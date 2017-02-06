import * as angular from "angular";
import {IModule, IController, IQService, IPromise} from "angular";
import {Project} from "./project";
import {IVideoInfo} from "./editor-preview";
import {ISubtitle, ISubtitleListListener} from "./editor";
import {DownloadDialogController} from "./download";
import IScope = angular.IScope;

export function buildProjectViewComponent(mod: IModule) {
  mod.component("projectView", {
    templateUrl: "templates/project-view.html",
    controller: ProjectViewController,
    bindings: {
      project: "<",
    },
  });
}

class ProjectViewController implements IController {
  public readonly project: Project;
  public video: IVideoInfo;

  public currentTime: number;
  public currentSubtitle: ISubtitle;

  constructor(private $q: IQService,
              private $mdDialog: ng.material.IDialogService,
              private hotkeys: ng.hotkeys.HotkeysProvider,
              $scope: IScope) {

    hotkeys.includeCheatSheet = true;

    hotkeys.bindTo($scope)
      .add({
        combo: "ctrl+z",
        description: "Macht den letzten Schritt rückgängig",
        allowIn: ["input", "textarea", "select"],
        callback: (event: Event) => {
          this.undoLastAction();
          event.stopPropagation();
        }
      })
      .add({
        combo: "ctrl+y",
        description: "Wiederholt den letzten rückgängig gemachten Schritt",
        allowIn: ["input", "textarea", "select"],
        callback: (event: Event) => {
          this.undoLastAction();
          event.stopPropagation();
        }
      });
  }

  public $onInit(): void {
    this.currentTime = 0;
    this.currentSubtitle = null;
    this.video = null;

    const videoUrl = this.project.video;
    console.log("Loading video ", videoUrl);

    // create a video element to load the video off-screen
    const element = document.createElement("video");
    element.src = videoUrl;
    element.preload = "auto";

    // get promises for duration and aspect-ratio.
    const duration: IPromise<number> = this.$q(resolve => {
      element.ondurationchange = ev => resolve(element.duration);
    });

    const aspect: IPromise<number> = this.$q(resolve => {
      element.oncanplay = ev => resolve(element.videoWidth / element.videoHeight);
    });

    this.$q.all([duration, aspect]).then(([duration, aspect]) => {
      this.video = {aspect, duration, url: videoUrl};
    });
  }

  public get loaded(): boolean {
    return this.video != null;
  }

  public setCurrentSubtitle(subtitle: ISubtitle): void {
    this.currentSubtitle = subtitle;
    this.currentTime = subtitle.time;
  }

  public clearCurrentSubtitle(): void {
    this.currentSubtitle = null;
  }

  public deleteSubtitle(subtitle: ISubtitle): void {
    this.project.removeSubtitle(subtitle);
  }

  public addSubtitle(baseState: ISubtitle): void {
    // save this subtitle.
    const subtitle = this.project.addSubtitle(angular.copy(baseState));
    this.setCurrentSubtitle(subtitle);
  }

  public get undoAvailable(): boolean {
    return this.project.undoAvailable;
  }

  public undoLastAction(): void {
    this.project.undo();
  }

  public get redoAvailable(): boolean {
    return this.project.redoAvailable;
  }

  public redoLastAction(): void {
    this.project.redo();
  }

  public toggleProjectSilent() {
    this.project.silent = !this.project.silent;
  }

  public get projectIsSilent(): boolean {
    return this.project.silent;
  }

  public subtitleListHandler: ISubtitleListListener = {
    onSubtitleClicked: (subtitle: ISubtitle) => {
      this.setCurrentSubtitle(subtitle);
    },

    onDeleteSubtitleClicked: (subtitle: ISubtitle) => {
      this.deleteSubtitle(subtitle);
    }
  };

  public exportProject(ev: MouseEvent): void {
    this.$mdDialog.show({
      templateUrl: "templates/download.html",
      parent: angular.element(document.body),
      controller: DownloadDialogController,
      controllerAs: "$ctrl",
      targetEvent: ev,
      clickOutsideToClose: false,
      locals: {
        project: this.project,
      }
    });
  }

  public toggleHotkeysCheatSheet(): void {
    this.hotkeys.toggleCheatSheet()
  }
}
