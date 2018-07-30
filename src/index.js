

import Utility from 'node-code-utility';
import CouchDBBootstrap from 'couchdb-bootstrap-extended';
import path from 'path';
import USSDModel from './model';
import { init } from './router';

const APP_ROOT = path.join(path.resolve(__dirname, '../'));
module.exports = (configMapVar, router) => {
  const configMap = Utility.is.object(configMapVar) ? configMapVar : {};
  USSDModel.setupConfig(configMap);

  configMap.couchdbFolderPath = path.join(APP_ROOT, 'couchdb');
  configMap.dbOptions = {
    src: 'ussd-records',
    target: configMap.db,
  };
  const bootstrap = CouchDBBootstrap.getInstance(configMap);
  bootstrap.runAllSetup();

  init(router);
  return router;
};
