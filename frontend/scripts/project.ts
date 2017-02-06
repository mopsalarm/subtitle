import * as angular from "angular";
import {IModule, IController} from "angular";
import {Pos, ISubtitle} from "./editor";
import IHttpService = angular.IHttpService;
import IPromise = angular.IPromise;

export function buildProjectComponent(mod: IModule) {
  mod.service("projectService", ProjectService);

  mod.component("projectOverview", {
    templateUrl: "templates/projects.html",
    controller: ProjectOverview,
  })
}

interface IResolveVideoResponse {
  url: string;
}

class ProjectOverview implements IController {
  public newProjectTitle: string = "";
  public newProjectVideoUrl: string = "";

  public selectedProject: Project = null;

  constructor(private projectService: ProjectService,
              private $http: IHttpService,
              private $mdDialog: ng.material.IDialogService) {
  }

  /**
   * The list of currently available projects
   */
  public get projects(): Project[] {
    return this.projectService.projects;
  }

  public onLoadProjectClicked(project: Project): void {
    this.selectedProject = project;
  }

  public createNewProject(): void {
    const match = /[0-9]+$/.exec(this.newProjectVideoUrl);

    this.$http
      .get("../resolve/" + match[0])
      .then(result => result.data as IResolveVideoResponse)
      .then(response => response.url)
      .then(url => this.handleResolvedUrl(url))
      .catch(err => this.showErrorDialog("Projekt konnte nicht angelegt werden."))
  }

  private reset(): void {
    this.newProjectTitle = "";
    this.newProjectVideoUrl = "";
  }

  private handleResolvedUrl(url: string) {
    if (!/mp4$/.test(url)) {
      this.showErrorDialog("Der angegebene Post ist kein Video.");
      return;
    }

    const project: Project = new Project({
      id: "pr" + Date.now(),
      title: this.newProjectTitle,
      video: url,
      silent: false,
      subtitles: [],
    });

    // save the project.
    this.projectService.save(project);

    // reset the input form
    this.reset();

    // and load the project.
    this.onLoadProjectClicked(project);
  }

  /**
   * Shows a little error dialog.
   */
  private showErrorDialog(msg: string): IPromise<any> {
    return this.$mdDialog.show(
      this.$mdDialog.alert()
        .title("Fehler")
        .textContent(msg)
        .ok("Okay")
        .escapeToClose(true));
  }
}

export interface IProjectState {
  id: string;
  title: string;
  video: string;
  silent: boolean;
  subtitles: ISubtitleState[];
}


interface ISubtitleState extends ISubtitle {
}

interface ISubtitleUpdate {
  time?: number;
  duration?: number;
  text?: string;
  color?: string;
  position?: Pos;
}

interface IProjectCommand {
  action: string;
}

type CommandAction = "sub.add" | "sub.rm" | "sub.update" | "pr.silent"

class AddSubtitleCommand implements IProjectCommand {
  public action: CommandAction = "sub.add";

  constructor(public baseState: ISubtitleState) {
  }
}

class DeleteSubtitleCommand implements IProjectCommand {
  public action: CommandAction = "sub.rm";

  constructor(public id: string) {
  }
}

class UpdateSubtitleCommand implements IProjectCommand {
  public action: CommandAction = "sub.update";

  constructor(public id: string,
              public update: ISubtitleUpdate) {
  }
}

class SetProjectSilentCommand implements IProjectCommand {
  public action: CommandAction = "pr.silent";

  constructor(public silent: boolean) {
  }
}

interface IApplyOptions {
  dontSave?: boolean;
  keepRedoStack?: boolean;
}

export class Project {
  private readonly _baseState: IProjectState;
  private readonly redoStack: IProjectCommand[] = [];

  private _state: IProjectState = null;
  private _commands: IProjectCommand[];
  private _subtitleStates: {[id: string]: ISubtitleState} = {};
  private _cachedSubtitles: ISubtitle[];

  public onChangeAction: () => void = null;

  constructor(state: IProjectState,
              commands: IProjectCommand[] = []) {

    // create defensive deep-copies
    this._baseState = angular.copy(state);
    this._commands = angular.copy(commands);
  }

  private get state(): IProjectState {
    if (this._state == null) {
      this.rebuild(this._commands, {dontSave: true});
    }

    return this._state;
  }

  get id(): string {
    return this.baseState.id;
  }

  get title(): string {
    return this.baseState.title;
  }

  get video(): string {
    return this.baseState.video;
  }

  get baseState(): IProjectState {
    return angular.copy(this._baseState);
  }

  get currentState(): IProjectState {
    return angular.copy(this.state);
  }

  get silent(): boolean {
    return this.state.silent;
  }

  set silent(v: boolean) {
    this.applyCommand(new SetProjectSilentCommand(v));
  }

  get subtitles(): ISubtitle[] {
    if (this._cachedSubtitles == null) {
      this._cachedSubtitles = this.state.subtitles
        .map(state => new ProjectSubtitle(this, state))
        .sort((a, b) => a.time - b.time);
    }

    return this._cachedSubtitles;
  }

  get commands(): IProjectCommand[] {
    return angular.copy(this._commands);
  }

  public addSubtitle(baseState: ISubtitleState): ISubtitle {
    this.applyCommand(new AddSubtitleCommand(angular.copy(baseState)));
    return this.findSubtitle(baseState.id);
  }

  public removeSubtitle(subtitle: ISubtitle): void {
    this.applyCommand(new DeleteSubtitleCommand(subtitle.id));
  }

  public get undoAvailable(): boolean {
    return this._commands.length > 0;
  }

  public undo(): void {
    if (this.undoAvailable) {
      const commands = this._commands.slice();

      // remove last command
      this.redoStack.push(commands.pop());

      // and rebuild the project.
      this.rebuild(commands, {keepRedoStack: true});
    }
  }

  public get redoAvailable(): boolean {
    return this.redoStack.length > 0;
  }

  public redo(): void {
    if (this.redoAvailable) {
      this.applyCommand(this.redoStack.pop(), {keepRedoStack: true});
    }
  }

  public applyCommand(command: IProjectCommand, options: IApplyOptions = {}): void {
    this.applyCommands([command], options);
  }

  public get optimizedCommands(): IProjectCommand[] {
    const commands: IProjectCommand[] = [];

    let previousCommand: IProjectCommand;
    this._commands.forEach(command => {
      if (previousCommand && previousCommand.action === "sub.update") {
        if (command.action === "sub.update") {

          const currentUpdate = command as UpdateSubtitleCommand;
          const previousUpdate = previousCommand as UpdateSubtitleCommand;

          // merge states if they update the same subtitle.
          if (previousUpdate.id === currentUpdate.id) {
            angular.extend(previousUpdate.update, currentUpdate.update);
            return;
          }
        }
      }

      commands.push(command);
      previousCommand = command;
    });

    return commands;
  }

  private applyCommands(commands: IProjectCommand[], options: IApplyOptions = {}): void {
    commands.forEach(command => {
      switch (command.action) {
        case "sub.add": {
          const addCommand = command as AddSubtitleCommand;

          // create the entry
          const state: ISubtitleState = this.subtitleState(addCommand.baseState.id);
          angular.extend(state, addCommand.baseState);
          this.state.subtitles.push(state);

          this.invalidateSubtitleCache();
          break;
        }

        case "sub.rm": {
          const deleteCommand = command as DeleteSubtitleCommand;
          const idx = this.indexOfSubtitle(deleteCommand.id);
          this.state.subtitles.splice(idx, 1);
          this.invalidateSubtitleCache();
          break;
        }

        case "sub.update": {
          const updateCommand = command as UpdateSubtitleCommand;
          const idx = this.indexOfSubtitle(updateCommand.id);
          angular.extend(this.state.subtitles[idx], updateCommand.update);

          // we need to invalidate the cache to ensure the correct sorting of the subtitle
          // if the subtitles time changes.
          if (updateCommand.update.time != null) {
            this.invalidateSubtitleCache();
          }

          break;
        }

        case "pr.silent": {
          const silentCommand = command as SetProjectSilentCommand;
          this.state.silent = silentCommand.silent;
          break;
        }

        default:
          console.log("Can not apply command %s", command.action);
      }

      this._commands.push(command);
    });

    const clearRedoStack = !options.keepRedoStack;
    if (clearRedoStack) {
      this.redoStack.splice(0);
    }

    const save = !options.dontSave;
    if (save && this.onChangeAction != null) {
      this.onChangeAction();
    }
  }

  private indexOfSubtitle(id: string) {
    for (let idx = 0; idx < this.state.subtitles.length; idx++) {
      const subtitle = this.state.subtitles[idx];
      if (subtitle.id === id) {
        return idx;
      }
    }

    throw new Error("Subtitle with id not found: " + id);
  }

  private findSubtitle(id: string): ProjectSubtitle {
    // validate that the subtitle exists.
    const idx = this.indexOfSubtitle(id);
    return new ProjectSubtitle(this, this.state.subtitles[idx]);
  }

  private subtitleState(id: string): ISubtitleState {
    const cached = this._subtitleStates[id];
    if (cached != null)
      return cached;

    // create and store a new instance
    const state: ISubtitleState = {
      id, time: 0, duration: 0,
      text: "", color: "#ffffff",
      position: {x: "center", y: "center"}
    };

    this._subtitleStates[id] = state;
    return state;
  }

  private invalidateSubtitleCache() {
    this._cachedSubtitles = null;
  }

  private rebuild(commands: IProjectCommand[], options: IApplyOptions = {}) {
    this._commands = [];
    this._state = angular.copy(this._baseState);

    console.time("rebuild project");

    // apply all the commands to the project.
    this.applyCommands(commands, options);
    this.invalidateSubtitleCache();

    console.timeEnd("rebuild project");
  }

  /**
   * Checks if a subtitle with this id exists in the project.
   */
  containsSubtitle(id: string): boolean {
    return this.state.subtitles.some(s => s.id === id);
  }
}

class ProjectSubtitle implements ISubtitle {
  public readonly id: string;

  constructor(private project: Project,
              private state: ISubtitleState) {

    this.id = state.id;
  }

  get time(): number {
    return roundTime(this.state.time);
  }

  set time(value: number) {
    this.update("time", roundTime(value))
  }

  get duration(): number {
    return roundTime(this.state.duration);
  }

  set duration(value: number) {
    this.update("duration", roundTime(value));
  }

  get text(): string {
    return this.state.text;
  }

  set text(value: string) {
    this.update("text", value);
  }

  get color(): string {
    return this.state.color;
  }

  set color(value: string) {
    this.update("color", value);
  }

  get position(): Pos {
    return this.state.position;
  }

  set position(value: Pos) {
    this.update("position", value);
  }

  get valid(): boolean {
    return this.project.containsSubtitle(this.id);
  }

  /**
   * Updates the given field in this subtitle.
   */
  private update(key: string, value: any): void {
    const update = {};
    update[key] = value;
    this.project.applyCommand(new UpdateSubtitleCommand(this.id, update))
  }
}

interface ISavedProject {
  readonly baseState: IProjectState;
  readonly commands: IProjectCommand[];
}

export class ProjectService {
  private _projects: Project[] = [];

  constructor() {
    const baseStates = (JSON.parse(localStorage.getItem("projects") || "[]") as IProjectState[]);
    this._projects = baseStates
      .map(base => {
        const encodedProject = localStorage.getItem(`project.${base.id}.commands`);
        if (encodedProject != null) {
          const savedProject = JSON.parse(encodedProject) as ISavedProject;
          return new Project(base, savedProject.commands);
        }
      })
      .filter(project => project != null);

    this._projects.forEach(project => project.onChangeAction = () => this.save(project));
  }

  /**
   * Returns the list of projects the user has configured.
   */
  public get projects(): Project[] {
    return this._projects;
  }

  /**
   * Saves the given project.
   */
  public save(project: Project): void {
    console.time("save project");

    console.log("Saving project %s", project.title);

    this._projects = [project].concat(...this.projects.filter(p => p.id != project.id));

    // save the encoded state
    const encoded: ISavedProject = {baseState: project.baseState, commands: project.optimizedCommands};
    localStorage.setItem(`project.${project.id}.commands`, JSON.stringify(encoded));

    // save the list of projects
    const projects = JSON.stringify(this._projects.map(pr => pr.baseState));
    localStorage.setItem("projects", projects);

    console.timeEnd("save project");
  }
}

export function roundTime(time: number): number {
  return Math.round(10 * time) / 10;
}
