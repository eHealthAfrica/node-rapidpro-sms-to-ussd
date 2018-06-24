'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _morgan = require('morgan');

var _morgan2 = _interopRequireDefault(_morgan);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _expressContentLengthValidator = require('express-content-length-validator');

var _expressContentLengthValidator2 = _interopRequireDefault(_expressContentLengthValidator);

var _helmet = require('helmet');

var _helmet2 = _interopRequireDefault(_helmet);

var _compression = require('compression');

var _compression2 = _interopRequireDefault(_compression);

var _zlib = require('zlib');

var _zlib2 = _interopRequireDefault(_zlib);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var RouteConfig = function () {
  function RouteConfig() {
    _classCallCheck(this, RouteConfig);
  }

  _createClass(RouteConfig, null, [{
    key: 'init',
    value: function init(application) {
      application.use((0, _compression2.default)({
        level: _zlib2.default.Z_BEST_COMPRESSION,
        threshold: '1kb'
      }));

      application.use(_bodyParser2.default.json({ limit: '50mb' }));
      application.use(_bodyParser2.default.urlencoded({ extended: true }));
      application.use((0, _morgan2.default)('dev'));
      application.use(_expressContentLengthValidator2.default.validateMax({ max: 999999 }));
      application.use((0, _helmet2.default)());
    }
  }]);

  return RouteConfig;
}();

module.exports = RouteConfig;