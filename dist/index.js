'use strict';

var _routes = require('./routes.conf');

var _routes2 = _interopRequireDefault(_routes);

var _model = require('./model');

var _model2 = _interopRequireDefault(_model);

var _nodeCodeUtility = require('node-code-utility');

var _nodeCodeUtility2 = _interopRequireDefault(_nodeCodeUtility);

var _couchdbBootstrapExtended = require('couchdb-bootstrap-extended');

var _couchdbBootstrapExtended2 = _interopRequireDefault(_couchdbBootstrapExtended);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var APP_ROOT = _path2.default.join(_path2.default.resolve(__dirname, '../'));
module.exports = function (configMap, app, router) {
  var bootstrapDBoptions = {};
  configMap = _nodeCodeUtility2.default.is.object(configMap) ? configMap : {};
  _model2.default.setupConfig(configMap);
  if (configMap.DB_NAME) {
    bootstrapDBoptions.src = 'ussd-records';
    bootstrapDBoptions.target = configMap.DB_NAME;
  }
  var bootstrap = _couchdbBootstrapExtended2.default.getInstance(_path2.default.join(APP_ROOT, 'couchdb'), configMap.COUCHDB_URL, bootstrapDBoptions);
  bootstrap.runAllSetup();
  _routes2.default.init(app);
  require('./router').init(router);
  return app;
};