import {IModule, IController, IQService, IHttpService, IPromise} from "angular";
import {Project} from "./project";
import IScope = angular.IScope;

export function buildDownloadComponent(mod: IModule) {
  mod.service("downloadService", DownloadService);
}

export class DownloadDialogController implements IController {
  private project: Project;
  private destroyed: boolean = false;

  public status: IExportStatus;
  public progress: number = -1;

  constructor(private $mdDialog: ng.material.IDialogService,
              private downloadService: DownloadService,
              private $scope: IScope,
              locals: {[key: string]: any}) {

    this.project = locals["project"] as Project;

    this.downloadService
      .poll(this.project, (progress: number): boolean => this.updateProgress(progress))
      .then(status => this.status = status)
      .catch(error => console.log("polling stopped with an error: " + error));

    this.$scope.$on("$destroy", () => this.$onDestroy());
  }

  public $onDestroy() {
    console.log("DownloadDialogController was destroyed");
    this.destroyed = true;
  }

  public close() {
    this.$mdDialog.hide();
  }

  private updateProgress(progress?: number): boolean {
    if (progress != null) {
      this.progress = progress * 100;
    }

    return !this.destroyed
  }

  public get progressMode(): string {
    return this.progress > 0 ? "determinate" : "indeterminate";
  }

  public get finished(): boolean {
    return this.status != null && this.status.finished;
  }

  public get videoUrl(): string {
    return this.status != null ? `../video/${this.status.id}/video.mp4` : "#";
  }
}


interface IExportStatus {
  id: string
  progress: number
  finished: boolean
}

class DownloadService {
  constructor(private $q: IQService, private $http: IHttpService) {
  }

  private doExport(project: Project): IPromise<IExportStatus> {
    return this.$http.post("../api/export", project.currentState).then(resp => {
      const id = resp.data && resp.data["jobId"];
      if (id != null) {
        return this.fetchStatus(id);

      } else {
        console.log(resp.data);
        return this.$q.reject("Fehler beim Starten des Download.");
      }
    })
  }

  private fetchStatus(id: string): IPromise<IExportStatus> {
    return this.$http.get("../api/export/" + id).then(resp => resp.data as IExportStatus);
  }

  public poll(project: Project, progressCallback: (number?: number) => boolean): IPromise<IExportStatus> {
    const fetchStatusWithRetry = (id: string): IPromise<IExportStatus> => {
      if (!progressCallback(null)) {
        console.log("Stop polling for %s now", id);
        return this.$q.reject("polling stopped");
      }

      // fetch status. On failure wait a moment and try again.
      return this.fetchStatus(id)
        .catch(err => delay(this.$q, 1000).then(() => fetchStatusWithRetry(id)));
    };

    const handleStatus = (status: IExportStatus): IPromise<IExportStatus> => {
      if (status.finished)
        return this.$q.resolve(status);

      if (!progressCallback(status.progress)) {
        console.log("Stop polling for %s now", status.id);
        return this.$q.reject("polling stopped");
      }

      return delay(this.$q, 1000).then(() => fetchStatusWithRetry(status.id)).then(handleStatus);
    };

    return this.doExport(project).then(handleStatus);
  }
}

function delay($q: IQService, val: number): IPromise<any> {
  return $q(resolve => setTimeout(() => resolve(), val));
}
