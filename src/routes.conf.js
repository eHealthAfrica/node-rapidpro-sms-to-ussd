

import morgan from 'morgan';
import bodyParser from 'body-parser';
import contentLength from 'express-content-length-validator';
import helmet from 'helmet';
import compression from 'compression';
import zlib from 'zlib';

class RouteConfig {
  static init(application) {
    application.use(compression({
      level: zlib.Z_BEST_COMPRESSION,
      threshold: '1kb',
    }));

    application.use(bodyParser.json({ limit: '50mb' }));
    application.use(bodyParser.urlencoded({ extended: true }));
    application.use(morgan('dev'));
    application.use(contentLength.validateMax({ max: 999999 }));
    application.use(helmet());
  }
}

module.exports = RouteConfig;
