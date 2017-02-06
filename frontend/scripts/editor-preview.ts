import {
  IModule,
  IController,
  ISCEService,
  IDirective,
  IAttributes,
  IScope,
  IIntervalService,
  IAugmentedJQuery,
  IPromise
} from "angular";
import {ISubtitle} from "./editor";

export function buildEditorPreviewComponent(mod: IModule) {
  mod.directive("suVideoPlay", VideoPlayDirectiveFactory);
  mod.directive("suVideoSeek", VideoSeekDirectiveFactory);

  mod.component("editorPreview", {
    templateUrl: "templates/editor-preview.html",
    controller: EditorPreviewController,
    bindings: {
      video: "<",
      subtitles: "<",
      silent: "<",
      currentTime: "=",
    },
  });
}

export interface IVideoInfo {
  aspect: number;
  duration: number;
  url: string;
}

class EditorPreviewController implements IController {
  public video: IVideoInfo;
  public currentTime: number;
  public silent: boolean;
  public subtitles: ISubtitle[];

  public playing: boolean = false;
  public previewVideoTime: number = -1;

  constructor(private $sce: ISCEService) {
  }

  public get videoUrl(): string {
    return this.$sce.trustAsResourceUrl(this.video.url);
  }

  /**
   * Returns all subtitles which are currently active.
   */
  public get activeSubtitles(): ISubtitle[] {
    const currentTime = this.playing ? this.previewVideoTime : this.currentTime;
    return this.subtitles.filter(sub => sub.time <= currentTime && currentTime <= sub.time + sub.duration)
  }

  public get formattedCurrentTime(): string {
    const time = this.playing ? this.previewVideoTime : this.currentTime;
    const minutes = Math.floor(time / 60);
    const seconds = Math.round(time % 60);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  public get sliderValue(): number {
    if (this.playing) {
      return this.previewVideoTime;
    } else {
      return this.currentTime;
    }
  }

  public set sliderValue(value: number) {
    if (!this.playing) {
      this.currentTime = value;
    }
  }

  public playButtonClicked(): void {
    if (this.playing) {
      this.stop();
    } else {
      this.preview();
    }
  }

  private preview(): void {
    this.playing = true;
    this.previewVideoTime = Math.max(0, this.currentTime - 2);
  }

  private stop(): void {
    if (this.previewVideoTime > this.currentTime) {
      this.currentTime = this.previewVideoTime;
    }

    this.playing = false;
    this.previewVideoTime = -1;
  }

  public get currentTimeFormatted(): string {
    const seconds = this.currentTime % 60;
    return seconds + "s"
  }

  public moveToStart(): void {
    this.moveTo(0);
  }

  public moveToEnd(): void {
    this.moveTo(this.video.duration);
  }

  public moveBy(delta: number): void {
    this.moveTo(this.currentTime + delta);
  }

  private moveTo(time: number): void {
    // stop playback if any
    this.stop();

    this.currentTime = time;
    if (this.currentTime < 0)
      this.currentTime = 0;

    if (this.currentTime > this.video.duration)
      this.currentTime = this.video.duration;
  }
}


function VideoSeekDirectiveFactory(): IDirective {
  interface Attributes extends IAttributes {
    suVideoSeek: string;
  }

  return {
    link: (scope: IScope, element: IAugmentedJQuery, attrs: Attributes) => {
      const video: HTMLVideoElement = element[0] as HTMLVideoElement;

      scope.$watch(attrs.suVideoSeek, (value: number) => {
        if (value >= 0) {
          video.currentTime = value;
        }
      });
    },
  };
}

function VideoPlayDirectiveFactory($interval: IIntervalService): IDirective {
  return {
    link: (scope: IScope, element: IAugmentedJQuery) => {
      const video: HTMLVideoElement = element[0] as HTMLVideoElement;

      let currentInterval: IPromise<any> = null;
      scope.$watch("suVideoPlay", (value: number) => {
        if (value >= 0 && currentInterval != null) {
          // already running, we wont apply interval now.
          return;
        }

        if (currentInterval != null) {
          $interval.cancel(currentInterval);
          currentInterval = null;
        }

        if (value < 0) {
          video.currentTime = 0;
          video.pause();
          return;
        }

        video.currentTime = value;
        video.play();

        // sync current playback position periodically
        currentInterval = $interval((() => scope["suVideoPlay"] = video.currentTime), 100);
      });

      scope.$watch("suVideoPlaySilent", (silent: boolean) => {
        const targetValue = silent ? 0 : 1;
        if (video.volume != targetValue) {
          video.volume = targetValue;
        }
      });
    },

    scope: {
      suVideoPlay: "=",
      suVideoPlaySilent: "<",
    }
  };
}

