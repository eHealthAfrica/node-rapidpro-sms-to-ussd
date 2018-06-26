'use strict';

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
module.exports = function (configMap, router) {
  configMap = _nodeCodeUtility2.default.is.object(configMap) ? configMap : {};
  _model2.default.setupConfig(configMap);

  configMap.couchdbFolderPath = _path2.default.join(APP_ROOT, 'couchdb');
  configMap.dbOptions = {
    src: 'ussd-records',
    target: configMap.db
  };
  var bootstrap = _couchdbBootstrapExtended2.default.getInstance(configMap);
  bootstrap.runAllSetup();

  require('./router').init(router);
  return router;
};