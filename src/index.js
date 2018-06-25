'use strict'

import RoutesConfig from './routes.conf'
import USSDModel from './model'
import Utility from 'node-code-utility'

module.exports = function (configMap, app, router) {
  // const router = express.Router([])

  configMap = Utility.is.object(configMap) ? configMap : {}
  USSDModel.setupConfig(configMap)
  RoutesConfig.init(app)
  require('./router').init(router)
  return app
}
