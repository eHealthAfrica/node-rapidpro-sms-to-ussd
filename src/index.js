'use strict'

import USSDModel from './model'
import Utility from 'node-code-utility'
import CouchDBBootstrap from 'couchdb-bootstrap-extended'
import path from 'path'

const APP_ROOT = path.join(path.resolve(__dirname, '../'))
module.exports = function (configMap, router) {
  configMap = Utility.is.object(configMap) ? configMap : {}
  USSDModel.setupConfig(configMap)

  configMap.couchdbFolderPath = path.join(APP_ROOT, 'couchdb')
  configMap.dbOptions = {
    src: 'ussd-records',
    target: configMap.db
  }
  const bootstrap = CouchDBBootstrap.getInstance(configMap)
  bootstrap.runAllSetup()

  require('./router').init(router)
  return router
}
