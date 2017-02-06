;(function () {
  const angularVersion = "1.6.1";

  requirejs.config({
    baseUrl: "dist",

    paths: {
      "angular": `https://ajax.googleapis.com/ajax/libs/angularjs/${angularVersion}/angular.min`,
      "angular-aria": `https://ajax.googleapis.com/ajax/libs/angularjs/${angularVersion}/angular-aria.min`,
      "angular-animate": `https://ajax.googleapis.com/ajax/libs/angularjs/${angularVersion}/angular-animate.min`,
      "angular-messages": `https://ajax.googleapis.com/ajax/libs/angularjs/${angularVersion}/angular-messages.min`,
      "angular-material": `https://ajax.googleapis.com/ajax/libs/angular_material/1.1.1/angular-material.min`,
      "angular-hotkeys": `https://cdnjs.cloudflare.com/ajax/libs/angular-hotkeys/1.7.0/hotkeys.min`
    },

    shim: {
      "angular": {
        exports: 'angular'
      },
      "angular-material": {
        deps: ["angular", "angular-aria", "angular-animate", "angular-messages"]
      },
      "angular-aria": {
        deps: ["angular"]
      },
      "angular-animate": {
        deps: ["angular"]
      },
      "angular-messages": {
        deps: ["angular"]
      },
      "angular-hotkeys": {
        deps: ["angular"]
      }
    }
  });

  requirejs(["angular", "angular-material", "angular-hotkeys", "editor"], function (angular) {
    var $html = angular.element(document.getElementsByTagName('html')[0]);
    angular.element().ready(function () {
      angular.bootstrap(document, ['SubtitleApp']);
    });
  });

})();
