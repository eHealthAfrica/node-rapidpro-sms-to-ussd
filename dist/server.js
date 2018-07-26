'use strict';

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _index = require('./index');

var _index2 = _interopRequireDefault(_index);

var _routes = require('./routes.conf');

var _routes2 = _interopRequireDefault(_routes);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var PORT = process.env.SERVER_PORT || 4040;
var app = (0, _express2.default)();
var router = _express2.default.Router([]);
var env = process.env;

(0, _index2.default)({
  host: env.COUCHDB_HOST || 'http://localhost',
  port: env.COUCHDB_PORT || 5984,
  db: env.COUCHDB_NAME || 'test',
  auth: {
    username: env.COUCHDB_USER || 'admin',
    password: env.COUCHDB_PASS || 'admin'
  },
  rapidProUrl: env.RAPIDPRO_URL || 'http://localhost:8000',
  rapidProChannelToken: env.RAPIDPRO_CHANNEL_TOKEN || '04702942-a8ea-4a4c-abef-5c277ec45d1b',
  rapidProAPIToken: env.RAPIDPRO_API_TOKEN || '',
  ussdCodes: (env.USSD_CODES || '*35131*22#').split(',')
}, router);

_routes2.default.init(app);
app.use('/', router);

// log exceptions without halting system
process.on('uncaughtException', function (err) {
  console.log(err);
});

_http2.default.createServer(app).listen(PORT, function () {
  console.log('up and running @: ' + _os2.default.hostname() + ' on port: ' + PORT);
});