'use strict'

import RoutesConfig from './routes.conf'
import USSDModel from './model'
import Utility from 'node-code-utility'
import CouchDBBootstrap from 'couchdb-bootstrap-extended'
import path from 'path'

const APP_ROOT = path.join(path.resolve(__dirname, '../'))
module.exports = function (configMap, app, router) {
  const bootstrapDBoptions = {}
  configMap = Utility.is.object(configMap) ? configMap : {}
  USSDModel.setupConfig(configMap)
  if (configMap.DB_NAME) {
    bootstrapDBoptions.src = 'ussd-records'
    bootstrapDBoptions.target = configMap.DB_NAME
  }
  const bootstrap = CouchDBBootstrap.getInstance(path.join(APP_ROOT, 'couchdb'), configMap.COUCHDB_URL, bootstrapDBoptions)
  bootstrap.runAllSetup()
  RoutesConfig.init(app)
  require('./router').init(router)
  return app
}
