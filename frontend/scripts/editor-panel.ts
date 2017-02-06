import * as angular from "angular";
import {ISubtitle} from "./editor";
import {roundTime} from "./project";

import IScope = angular.IScope;
import IModule = angular.IModule;
import IController = angular.IController;
import HotkeysProvider = angular.hotkeys.HotkeysProvider;
import ITimeoutService = angular.ITimeoutService;
import IDirective = angular.IDirective;
import IAugmentedJQuery = angular.IAugmentedJQuery;

export function buildEditorPanelComponent(app: IModule) {
  app.component("editorPanel", {
    templateUrl: "templates/editor-panel.html",
    controller: EditorPanelController,
    bindings: {
      subtitle: "<",
      currentTime: "<",
      onNewSubtitle: "&",
      onResetEditor: "&",
    },
  });

  app.directive("applyFocus", ApplyFocusDirective);
}

interface EditorSubtitle extends ISubtitle {
  _new?: boolean;
}

const DefaultColors: {name: string, color: string}[] = [
  {name: "Orange", color: "#ee4d2e"},
  {name: "pr0mium", color: "#1cb992"},
  {name: "Neuschwuchtel", color: "#e208ea"},
  {name: "Schwuchtel", color: "#ffffff"},
  {name: "Altschwuchtel", color: "#5bb91c"},
  {name: "Moderator", color: "#008fff"},
  {name: "Admin", color: "#ff9900"},
  {name: "Fliese", color: "#9c432b"},
  {name: "Gesperrt", color: "#444444"},
];


class EditorPanelController implements IController {
  public _subtitle: EditorSubtitle;
  public currentTime: number;
  public onNewSubtitle?: (a: {subtitle: ISubtitle}) => void;
  public onResetEditor: () => void;

  public textFieldHasFocus: boolean = false;

  constructor($scope: IScope, hotkeys: HotkeysProvider) {
    // reset the ui if the subtitle become invalid.
    $scope.$watch(() => this.subtitle.valid, (currentValue, previousValue) => {
      if (previousValue === true && currentValue !== true) {
        this.reset();
      }
    });

    const hk = hotkeys.bindTo($scope);

    function register(combo: string|string[], desc: string, fn: () => void) {
      hk.add({
        combo, callback: preventEventDefault(fn),
        allowIn: ["input", "textarea", "select", "*"],
        description: desc
      })
    }

    register(["meta+enter", "ctrl+enter"], "Speichert den aktuellen Untertitel",
      () => this.persist());

    register(["meta+space", "ctrl+space"], "Setzt die Eingabe zurück und beginnt einen neuen Untertitel",
      () => this.reset());

    register("meta+up", "Schiebt den aktuellen Untertitel eine Position weiter nach oben",
      () => this.updateSubtitlePosition("y", "+"));

    register("meta+down", "Schiebt den aktuellen Untertitel eine Position weiter nach unten",
      () => this.updateSubtitlePosition("y", "-"));

    register("meta+right", "Schiebt den aktuellen Untertitel eine Position weiter nach rechts",
      () => this.updateSubtitlePosition("x", "+"));

    register("meta+left", "Schiebt den aktuellen Untertitel eine Position weiter nach links",
      () => this.updateSubtitlePosition("x", "-"));
  }

  public $onInit(): void {
    this.reset();
  }

  public $onChanges(): void {
    // ensure that we always have a subtitle.
    if (this.subtitle == null) {
      this.reset();
    }
  }

  public get subtitle(): EditorSubtitle {
    return this._subtitle;
  }

  public set subtitle(value: EditorSubtitle) {
    if (value == null) {
      // reset, keeping some values from the previous subtitle.
      const prev = this.subtitle;

      this.subtitle = {
        _new: true,
        id: Date.now().toString(),
        text: "",
        time: 0,
        duration: 2,
        color: prev ? prev.color : "#ffffff",
        position: prev ? prev.position : {x: "center", y: "bottom"},
      };
    } else {
      this._subtitle = value;
    }
  }

  public persist(): void {
    if (this.subtitle._new && this.subtitle.text.trim() !== "") {
      // finish this subtitle
      this.subtitle._new = null;
      this.subtitle.time = roundTime(this.currentTime);

      if (this.onNewSubtitle != null) {
        this.onNewSubtitle({subtitle: this.subtitle});
      }
    }
  }

  public get isNewSubtitle(): boolean {
    //noinspection PointlessBooleanExpressionJS
    return this.subtitle != null && !!this.subtitle._new;
  }

  public get isValid(): boolean {
    return this.subtitle.text.trim() != "";
  }

  //noinspection JSMethodCanBeStatic
  public get defaultColors(): {name: string, color: string}[] {
    return DefaultColors;
  }

  /**
   * Returns a little svg icon with the given color.
   */
  public get textForColor(): string {
    const color = this.subtitle.color;
    const name = DefaultColors.filter(c => c.color === color)[0].name;

    return `
      <div>
        <svg viewBox="0 0 100 100" width="24" style="vertical-align: middle;">
          <circle r=40 cx=50 cy=50 fill="${color}" stroke="black" stroke-width=2></circle>
        </svg>
        <span style="vertical-align: middle;">${name}</span>
      </div>
    `;
  }

  public snapStartTime(): void {
    this.subtitle.time = this.currentTime;
  }

  public get canSnapEndTime(): boolean {
    return this.currentTime >= this.subtitle.time + 0.2;
  }

  public snapEndTime(): void {
    let duration = this.currentTime - this.subtitle.time;
    if (duration > 0) {
      this.subtitle.duration = duration;
    }
  }

  public get endTime(): number {
    return roundTime(this.subtitle.time + this.subtitle.duration);
  }

  public set endTime(value: number) {
    if (value > this.subtitle.time) {
      this.subtitle.duration = value - this.subtitle.time;
    }
  }

  public updateSubtitlePosition(dir: string, value: string) {
    if (value === "+" || value === "-") {
      const lookupTable = {
        "ycenter+": "top",
        "ycenter-": "bottom",
        "ybottom+": "center",
        "ytop-": "center",
        "xcenter+": "right",
        "xcenter-": "left",
        "xleft+": "center",
        "xright-": "center",
      };

      const previous: string = this.subtitle.position[dir];
      value = lookupTable[dir + previous + value] || previous;
    }

    const pos = angular.copy(this.subtitle.position);
    pos[dir] = value;
    this.subtitle.position = pos;
  }

  private reset(): void {
    this.onResetEditor();
    this.textFieldHasFocus = true;
  }
}

function ApplyFocusDirective($timeout: ITimeoutService): IDirective {
  return {
    scope: {
      trigger: '=applyFocus'
    },

    link: function (scope: IScope, element: JQuery) {
      scope.$watch('trigger', (value: boolean) => {
        if (value === true) {
          $timeout(() => element[0].focus());
          scope["trigger"] = false;
        }
      });
    }
  }
}

function preventEventDefault(fn: (Event?) => void): (Event) => void {
  return (event: Event) => {
    fn(event);
    event.preventDefault();
  }
}
