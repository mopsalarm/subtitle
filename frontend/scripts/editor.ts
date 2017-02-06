import * as angular from "angular";
import {IController} from "angular";
import {buildProjectComponent} from "./project";
import {buildProjectViewComponent} from "./project-view";
import {buildEditorPreviewComponent} from "./editor-preview";
import {buildEditorPanelComponent} from "./editor-panel";
import {buildDownloadComponent} from "./download";

export interface Pos {
  readonly x: number|string;
  readonly y: number|string;
}

export interface ISubtitle {
  readonly id: string;

  time: number
  duration: number

  text: string
  color: string
  position: Pos

  valid?: boolean
}

class SubtitleController {
  public config: ISubtitle;

  public get style(): any {
    const style: any = {
      position: "absolute",
      color: this.config.color,
    };

    style.whiteSpace = "pre";

    // center x position
    style.left = "5%";
    style.right = "5%";
    style.textAlign = this.config.position.x;

    switch (this.config.position.y) {
      case "top":
        style.top = "10%";
        break;

      case "bottom":
        style.bottom = "10%";
        break;

      case "center":
        style.top = "45%";
    }


    return style;
  }
}

export interface ISubtitleListListener {
  onSubtitleClicked(subtitle: ISubtitle);
  onDeleteSubtitleClicked(subtitle: ISubtitle);
}

class SubtitleListController implements IController {
  public subtitles: ISubtitle[];
  public selectedSubtitle: ISubtitle;
  public eventHandler: ISubtitleListListener;

  public formatSubtitleStart(subtitle: ISubtitle): string {
    const seconds = subtitle.time % 60;
    const minutes = Math.floor(subtitle.time / 60);

    return minutes + "m " + seconds + "s";
  }

  public onSubtitleClicked(subtitle: ISubtitle) {
    this.eventHandler.onSubtitleClicked(subtitle);
  }

  public onDeleteSubtitleClicked(subtitle: ISubtitle) {
    this.eventHandler.onDeleteSubtitleClicked(subtitle);
  }

  public isSelected(subtitle: ISubtitle): boolean {
    return this.selectedSubtitle && this.selectedSubtitle.id === subtitle.id;
  }
}


function main() {
  const app = angular.module('SubtitleApp', ['ngMaterial', 'ngMessages', 'cfp.hotkeys']);

  app.component("subtitleList", {
    templateUrl: "templates/editor-subtitles.html",
    controller: SubtitleListController,
    bindings: {
      subtitles: "<",
      selectedSubtitle: "<",
      eventHandler: "<",
    },
  });

  app.component("subtitle", {
    templateUrl: "templates/subtitle.html",
    controller: SubtitleController,
    bindings: {
      config: "<",
    },
  });

  buildProjectComponent(app);
  buildProjectViewComponent(app);
  buildEditorPreviewComponent(app);
  buildDownloadComponent(app);
  buildEditorPanelComponent(app);
}

main();
