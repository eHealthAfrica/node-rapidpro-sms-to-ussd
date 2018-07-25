'use strict'

const Controller = require('./controller')
const BASE_URL = '/'
const rapidProEndPoint = process.env.RAPIDPRO_ENDPOINT || 'from-rapid-pro'

class USSDRoutes {
  static init (router) {
    router.route(`${BASE_URL}`)
      .get(Controller.start)
      .post(Controller.start)

    router.route(`${BASE_URL}all`)
      .get(Controller.all)

    router.route(`${BASE_URL}config`)
      .get(Controller.getConfig)

    router.route(`${BASE_URL}${rapidProEndPoint}`)
      .post(Controller.sendUSSD)
  }
}

module.exports = USSDRoutes
