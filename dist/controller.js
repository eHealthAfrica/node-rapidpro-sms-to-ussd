'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _nodeCodeUtility = require('node-code-utility');

var _nodeCodeUtility2 = _interopRequireDefault(_nodeCodeUtility);

var _nodeLoggerExtended = require('node-logger-extended');

var _sleepSync = require('sleep-sync');

var _sleepSync2 = _interopRequireDefault(_sleepSync);

var _model = require('./model');

var _model2 = _interopRequireDefault(_model);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var logger = new _nodeLoggerExtended.ControllerLogger({ name: 'ussd' });
var constants = require('./constants');

var Model = _model2.default.getInstance();
var userPredefinedResponse = {};
var DELAY = 6000;

var emitter = new _events2.default();

var processRequest = function processRequest(data) {
  var mainEventKey = Model.getKeyFromPhone(data.msisdn);
  var endEventKey = mainEventKey + '-end';
  var phone = Model.extractUserPhone(data.msisdn);
  var USSDParams = data.ussdparams.replace('#', '');
  var USSDCodes = _nodeCodeUtility2.default.is.array(Model.config.ussdCodes) ? Model.config.ussdCodes : [];

  USSDCodes.forEach(function (code) {
    USSDParams = data.ussdparams.replace(code.replace('#', ''), constants.flow.TRIGGER);
  });

  var extraCodes = USSDParams.split('*');

  if ((userPredefinedResponse[phone] || []).length === 0 && extraCodes.length > 1) {
    USSDParams = extraCodes.shift();
    userPredefinedResponse[phone] = extraCodes;
  }

  Model.processIncoming(data).then(function (response) {
    if (!response.wait) {
      emitter.emit(endEventKey, response.raw);
    }
  }).catch(function (error) {
    var msg = 'something went wrong while processing #endOfSession';
    logger.error(msg, error);
    data.text = msg;
    emitter.emit(endEventKey, data);
  });
};

var Controller = function () {
  function Controller() {
    _classCallCheck(this, Controller);
  }

  _createClass(Controller, null, [{
    key: 'start',
    value: function start(req, res) {
      var srcData = Object.keys(req.query).length > 0 ? req.query : req.body;
      var data = _lodash2.default.cloneDeep(srcData);

      var phone = Model.extractUserPhone(data.msisdn);
      var mainEventKey = Model.getKeyFromPhone(data.msisdn);
      var endEventKey = mainEventKey + '-end';
      processRequest(data);

      emitter.on(mainEventKey, function (eventData) {
        if ((userPredefinedResponse[phone] || []).length > 0) {
          data.ussdparams = userPredefinedResponse[phone].shift();
          // delay between calls to rapdidPro to dequeue webhooks
          (0, _sleepSync2.default)(DELAY);
          processRequest(data);
        } else {
          emitter.emit(endEventKey, eventData);
        }
      });

      emitter.once(endEventKey, function (eventData) {
        emitter.removeAllListeners(mainEventKey);

        data.userdata = (eventData.text || eventData.userData || 'Unable to process request').replace(constants.flow.END_OF_SESSION, '');

        data.endofsession = Model.isEndOfSession(eventData.text);
        Model.updateUserSession(data);
        logger.info('exit session status = ' + data.endofsession);
        res.json(data);
      });
    }
  }, {
    key: 'sendUSSD',
    value: function sendUSSD(req, res) {
      var body = req.body;

      var mainEventKey = Model.getKeyFromPhone(body.to);
      var transformed = Model.transformData(body.to, body.text);
      transformed.direction = 'out';
      Model.save(transformed).catch(_nodeCodeUtility2.default.simpleErrorHandler.bind(null, false));
      logger.info('out going key = ' + mainEventKey);
      emitter.emit(mainEventKey, body);
      res.json({ msg: 'response received' });
    }
  }, {
    key: 'all',
    value: function all(req, res) {
      var options = req.query || {};
      Model.all(options).then(function (response) {
        return res.json(response);
      }).catch(function (error) {
        return res.status(error.status || 500).json(error);
      });
    }
  }, {
    key: 'getConfig',
    value: function getConfig(req, res) {
      res.json(Model.getRapidProConfig());
    }
  }, {
    key: 'getByPhones',
    value: function getByPhones(req, res) {
      var options = req.query || {};
      var phones = (options.phones || '').split(',');
      delete options.phones;
      Model.getByPhones(phones, options).then(function (response) {
        return res.json(response);
      }).catch(function (error) {
        return res.status(error.status || 500).json(error);
      });
    }
  }, {
    key: 'getByCampaignPhones',
    value: function getByCampaignPhones(req, res) {
      var options = req.query || {};
      var campaignId = req.params.campaignId;

      var phones = (options.phones || '').split(',');
      delete options.phones;
      Model.getByCampaignPhones(campaignId, phones, options).then(function (response) {
        return res.json(response);
      }).catch(function (error) {
        return res.status(error.status || 500).json(error);
      });
    }
  }, {
    key: 'getByPhonesDirection',
    value: function getByPhonesDirection(req, res) {
      var options = req.query || {};
      var direction = req.params.direction;

      var phones = (options.phones || '').split(',');
      delete options.phones;
      Model.getByPhonesDirection(direction, phones, options).then(function (response) {
        return res.json(response);
      }).catch(function (error) {
        return res.status(error.status || 500).json(error);
      });
    }
  }, {
    key: 'getByPhonesDirectionWithDate',
    value: function getByPhonesDirectionWithDate(req, res) {
      var options = req.query || {};
      var direction = req.params.direction;
      var phone = req.params.phone;

      Model.getByPhoneDirectionWithDate(direction, phone, options).then(function (response) {
        return res.json(response);
      }).catch(function (error) {
        return res.status(error.status || 500).json(error);
      });
    }
  }]);

  return Controller;
}();

module.exports = Controller;