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

var PORT = process.env.PORT || 4040;
var app = (0, _express2.default)();
var router = _express2.default.Router([]);

(0, _index2.default)({
  host: 'http://localhost',
  port: 5984,
  db: 'test',
  auth: {
    username: 'admin',
    password: 'admin'
  },
  rapidProUrl: 'http://localhost:8000',
  rapidProChannelToken: 'f59a26f6-b8e0-4831-831c-3bf416edcc5c',
  rapidProAPIToken: '',
  ussdCodes: ['*35131*22#']
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