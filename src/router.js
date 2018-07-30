

const Controller = require('./controller');

const BASE_URL = `/${(process.env.API_EXT || '').replace(/^\/+/g, '')}`.replace(/\/$/, '');

class USSDRoutes {
  static init(router) {
    router.route(`${BASE_URL}/`)
      .get(Controller.start)
      .post(Controller.start);

    router.route(`${BASE_URL}/all`)
      .get(Controller.all);

    router.route(`${BASE_URL}/config`)
      .get(Controller.getConfig);

    router.route(`${BASE_URL}/from-rapid-pro`)
      .post(Controller.sendUSSD);
  }
}

module.exports = USSDRoutes;
