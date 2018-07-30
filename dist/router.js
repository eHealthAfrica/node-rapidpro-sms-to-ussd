'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Controller = require('./controller');

var BASE_URL = ('/' + (process.env.API_EXT || '').replace(/^\/+/g, '')).replace(/\/$/, '');

var USSDRoutes = function () {
  function USSDRoutes() {
    _classCallCheck(this, USSDRoutes);
  }

  _createClass(USSDRoutes, null, [{
    key: 'init',
    value: function init(router) {
      router.route(BASE_URL + '/').get(Controller.start).post(Controller.start);

      router.route(BASE_URL + '/all').get(Controller.all);

      router.route(BASE_URL + '/config').get(Controller.getConfig);

      router.route(BASE_URL + '/from-rapid-pro').post(Controller.sendUSSD);
    }
  }]);

  return USSDRoutes;
}();

module.exports = USSDRoutes;