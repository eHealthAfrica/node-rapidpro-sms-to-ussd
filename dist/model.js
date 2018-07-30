'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _extend = require('extend');

var _extend2 = _interopRequireDefault(_extend);

var _requestPromise = require('request-promise');

var _requestPromise2 = _interopRequireDefault(_requestPromise);

var _nodeLoggerExtended = require('node-logger-extended');

var _nodeCodeUtility = require('node-code-utility');

var _nodeCodeUtility2 = _interopRequireDefault(_nodeCodeUtility);

var _nodePouchdbExtended = require('node-pouchdb-extended');

var _nodePouchdbExtended2 = _interopRequireDefault(_nodePouchdbExtended);

var _momentTimezone = require('moment-timezone');

var _momentTimezone2 = _interopRequireDefault(_momentTimezone);

var _constants = require('./constants');

var _constants2 = _interopRequireDefault(_constants);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var logger = new _nodeLoggerExtended.ModelLogger({ name: 'ussd' });
var USER_STATE_ID = _constants2.default.USER_STATE_ID;

var defaultConfig = {
  timeZone: 'Africa/Lagos',
  host: 'http://localhost',
  db: 'test',
  port: 5984,
  auth: {
    username: '',
    password: ''
  },
  rapidProUrl: '',
  rapidProChannelToken: '',
  rapidProAPIToken: '',
  ussdCodes: []
};

var config = {};
var db = null;
var userSessions = {};
var savingState = false;
var modelInstance = null;

var Model = function () {
  function Model() {
    _classCallCheck(this, Model);

    if (!_nodeCodeUtility2.default.is.object(config)) {
      logger.info('class constructor expects Object type passed as arg');
      logger.info('but got ' + Object.prototype.toString.call(config));
      logger.info('using the following as default config ' + JSON.stringify(defaultConfig, null, 2));
    }
  }

  _createClass(Model, [{
    key: 'getRapidProUrl',
    value: function getRapidProUrl(status) {
      return this.config.rapidProUrl + '/handlers/external/' + status + '/' + this.config.rapidProChannelToken + '/';
    }

    /**
     * Private Method to determine if last session was concluded
     * conditions includes checking if endOfSession property was set to true
     * and last message sent out happened today
     *
     * @param {Object} data
     * @param {Object} response
     * @param {Array} serverResponse
     * @returns {Object}
     */

  }, {
    key: 'processLastSession',
    value: function processLastSession(data, response, serverResponse) {
      var lastResponse = serverResponse[0];
      var lastRequest = serverResponse[1];

      logger.info('about to process last response (' + lastResponse.phone + ') and request (' + lastResponse.phone + ')');
      logger.info('last request data was (' + lastResponse.userData + ')');
      var today = (0, _momentTimezone2.default)().tz(this.config.timeZone).format('L');
      var reportDate = (0, _momentTimezone2.default)(lastResponse.createdOn).tz(this.config.timeZone).format('L');

      var sessionNotEnded = lastResponse.endOfSession !== undefined && !lastResponse.endOfSession;
      var isNotEntry = (lastRequest.userData || '').trim() !== _constants2.default.flow.TRIGGER;
      var isToday = today === reportDate;

      logger.info('sessionNotEnded ' + sessionNotEnded + ', isNotEntry ' + isNotEntry + ', isToday ' + isToday);

      if (sessionNotEnded && isToday && isNotEntry) {
        data.awaitContinueResponse = true;
        this.updateUserSession(data);
        response.wait = false;
        var compiled = _lodash2.default.template(_constants2.default.continueFlow.message);

        response.raw = {
          text: compiled(_constants2.default.continueFlow.options),
          sessionId: data.sessionId,
          msisdn: data.msisdn
        };
      }

      logger.info('exiting last session with awaitContinueResponse = ' + data.awaitContinueResponse);
      return response;
    }

    /**
     * Private Method determine if user decides to continue from last session
     *
     * @param {Object} data
     * @param {Object} response
     * @param {Object} lastSession
     * @returns {Promise.<T>}
     */

  }, {
    key: 'processIncoming',


    /**
     * Process user resquest and determine response
     *
     * @param {Object} data
     * @property {String} msisdn - phone number
     * @property {String} network
     * @property {String} sessionId
     * @property {String} ussdparams - message
     * @property {Boolean} endofsession
     * @returns {Promise.<T>}
     */

    value: function processIncoming(data) {
      var _this = this;

      logger.info('processIncoming started');
      var original = _lodash2.default.cloneDeep(data);
      data = Model.updateUserSession(data);
      var response = { wait: true, raw: data };

      data.ussdparams = this.config.USSD_CODES ? this.setupCode(data) : data.ussdparams;

      if (Object.keys(data).length > 0) {
        var transformed = Model.transformData(data.msisdn, data.ussdparams);
        transformed.direction = 'in';
        this.save(transformed).catch(_nodeCodeUtility2.default.simpleErrorHandler.bind(null, false));

        return this.lastSessionCheck(data, response).then(Model.processContinueRequest.bind(null, data, response)).then(function (updatedResponse) {
          if (!updatedResponse.wait) {
            return updatedResponse;
          }
          return _this.notifyRapidPro(original, response);
        });
      }
      response.wait = false;
      return Promise.resolve(response);
    }

    /**
     * checks last session and determine if it was completed or interrupted
     * @param {Object} data
     * @param {Object} response
     * @returns {Promise.<T>}
     */

  }, {
    key: 'lastSessionCheck',
    value: function lastSessionCheck(data, response) {
      if (data.ussdparams === _constants2.default.flow.TRIGGER) {
        var promises = [Model.getLatest(data.msisdn, 'out', {}), Model.getLatest(data.msisdn, 'in', {})];
        return Promise.all(promises).then(this.processLastSession.bind(this, data, response));
      }
      return Promise.resolve(response);
    }

    /**
     * will pass message data.ussdparams to rapidPro server
     *
     * @param {Object} data
     * @param {Object} response
     * @returns {Promise.<T>}
     */

  }, {
    key: 'notifyRapidPro',
    value: function notifyRapidPro(data, response) {
      logger.info('about to send to rapid-pro for contact = ' + data.msisdn);
      var rapidProURL = this.getRapidProUrl('received');
      data.ussdparams = data.ussdparams === '*' ? _constants2.default.flow.TRIGGER : data.ussdparams;
      var sendOptions = {
        url: rapidProURL,
        form: {
          from: _nodeCodeUtility2.default.reformatPhoneNumber(data.msisdn),
          text: this.setupCode(data),
          date: new Date((0, _momentTimezone2.default)().tz(this.config.timeZone).format()).toJSON()
        }
      };

      return _requestPromise2.default.post(sendOptions).then(function () {
        return response;
      }).catch(function (error) {
        response.wait = false;
        data.text = error.body || error.message || 'could not process request due to unknown error';
        logger.error('failed from rapid pro', error);
        return response;
      });
    }
  }, {
    key: 'setupCode',


    /**
     *
     * @param {Object} data
     * @returns {String}
     */
    value: function setupCode(data) {
      data.ussdparams = data.ussdparams.replace('#', '');
      this.config.ussdCodes = _nodeCodeUtility2.default.is.array(this.config.ussdCodes) ? this.config.ussdCodes : [];
      this.config.ussdCodes.forEach(function (code) {
        data.ussdparams = data.ussdparams.replace(code.replace('#', ''), _constants2.default.flow.TRIGGER);
      });
      return data.ussdparams;
    }

    /**
     * gets all ussd entries in the db
     *
     * {Object} options
     * {Boolean} options.include_docs
     * {Number} options.limit,
     * {Boolean} options.descending,
     * {Array} options.keys,
     * {String} options.key
     *
     * @param {Object} options
     * @returns {Promise.<T>}
     */

  }], [{
    key: 'processContinueRequest',
    value: function processContinueRequest(data, response, lastSession) {
      logger.info('about to process continue request and wait = ' + lastSession.wait);
      if (!lastSession.wait) {
        logger.info('exiting continue request nothing to wait');
        return Promise.resolve(lastSession);
      }
      var USSDParams = parseInt(data.ussdparams, 10);
      var continueResponse = parseInt(_constants2.default.continueFlow.options.YES, 10);
      var noContinueResponse = parseInt(_constants2.default.continueFlow.options.NO, 10);
      var wantToContinue = data.awaitContinueResponse && USSDParams === continueResponse;
      var noContinue = data.awaitContinueResponse && USSDParams === noContinueResponse;

      if (wantToContinue) {
        logger.info('wantToContinue');
        return Model.getLatest(data.msisdn, 'out', {}).then(function (serverResponse) {
          logger.info('wantToContinue result point');
          response.wait = false;
          serverResponse.sessionId = data.sessionId;
          serverResponse.awaitContinueResponse = false;
          serverResponse.msisdn = data.msisdn;
          Model.updateUserSession(serverResponse);
          response.raw = serverResponse;
          return response;
        });
      }

      if (noContinue) {
        logger.info('noContinue');
        data.ussdparams = _constants2.default.flow.TRIGGER;
        data.awaitContinueResponse = false;
        Model.updateUserSession(data);
        return Promise.resolve(data);
      }
      return Promise.resolve(lastSession);
    }
  }, {
    key: 'buildKeys',
    value: function buildKeys(mappedKey, options) {
      options.descending = options.descending === undefined ? true : options.descending;
      // cast descending to string to compensate for url query string types

      if (options.descending.toString() === 'true') {
        options.startkey = [mappedKey, {}];
        options.endkey = [mappedKey];
      }

      if (options.descending.toString() === 'false') {
        options.startkey = [mappedKey];
        options.endkey = [mappedKey, {}];
      }
    }

    /**
     * save request and response to db
     * @param {Object} doc
     * @returns {Promise.<T>}
     */

  }, {
    key: 'save',
    value: function save(doc) {
      doc.docType = 'ussd';
      doc.phone = _nodeCodeUtility2.default.reformatPhoneNumber(doc.phone);
      doc.endOfSession = this.isEndOfSession(doc.userData);
      if (config.beforeSave && _nodeCodeUtility2.default.is.function(config.beforeSave)) {
        try {
          return config.beforeSave(doc).then(db.save);
        } catch (e) {
          logger.debug(e);
          return db.save(doc);
        }
      }

      return db.save(doc);
    }

    /**
     * gets or creates a unique key for every unique device making request or getting response based on device
     * phone number
     * @param {String} phone
     * @returns {String}
     */

  }, {
    key: 'getKeyFromPhone',
    value: function getKeyFromPhone(phone) {
      phone = this.extractUserPhone(phone);
      return 'ussd-session-' + phone;
    }
  }, {
    key: 'getUserState',
    value: function getUserState(phone) {
      phone = this.extractUserPhone(phone);
      return userSessions[phone] || {};
    }
  }, {
    key: 'extractUserPhone',
    value: function extractUserPhone(phone) {
      return (phone || '').replace('+', '').replace('234', '');
    }
  }, {
    key: 'updateUserSession',
    value: function updateUserSession(data) {
      var phone = Model.extractUserPhone(data.msisdn || data.phone);
      var currentData = {
        awaitContinueResponse: (userSessions[phone] || {}).awaitContinueResponse
      };
      userSessions[phone] = (0, _extend2.default)(true, currentData, data);
      return userSessions[phone];
    }
  }, {
    key: 'transformData',
    value: function transformData(phone, userData) {
      var userState = this.getUserState(phone);
      return {
        phone: phone,
        userData: userData,
        network: userState.network,
        sessionId: userState.sessionId || userState.sessionid,
        endOfSession: this.isEndOfSession(userData)
      };
    }

    /**
     * will load last user request or response to memory on system startup
     *
     * @returns {void}
     */

  }, {
    key: 'loadUserSessions',
    value: function loadUserSessions() {
      db.get(USER_STATE_ID).then(function (response) {
        userSessions = response;
      }).catch(_nodeCodeUtility2.default.simpleErrorHandler.bind(null, false));
    }

    /**
     * saves current session to db via cron
     *
     * @returns {void}
     */

  }, {
    key: 'saveUserSessions',
    value: function saveUserSessions() {
      if (!savingState) {
        logger.info('saving user session data ...');
        savingState = true;
        userSessions._id = USER_STATE_ID;
        userSessions.docType = USER_STATE_ID;
        db.save(userSessions).then(function (response) {
          userSessions._rev = response._rev;
          savingState = false;
        }).catch(function (error) {
          logger.info('user session data saving failed');
          savingState = false;
          logger.failed(null, null, error);
        });
      }
    }
  }, {
    key: 'all',
    value: function all(options) {
      options = _nodeCodeUtility2.default.is.object(options) ? options : {};
      var params = (0, _extend2.default)({}, options);
      return db.getView(_constants2.default.views.ALL, params);
    }

    /**
     *
     * @param {Array} phones
     * @param {Object} options
     * @property {Boolean} options.include_docs
     * @property {Number} options.limit,
     * @property {Boolean} options.descending,
     * @property {Array} options.keys,
     * @property {String} options.key
     * @returns {Promise.<T>}
     */

  }, {
    key: 'getByPhones',
    value: function getByPhones(phones, options) {
      options = _nodeCodeUtility2.default.is.object(options) ? options : {};
      phones = _nodeCodeUtility2.default.is.array(phones) ? phones : [];
      phones = phones.map(function (phone) {
        return _nodeCodeUtility2.default.reformatPhoneNumber(phone);
      });
      var params = (0, _extend2.default)({ keys: phones, include_docs: true }, options);
      return db.getView(_constants2.default.views.BY_PHONE, params);
    }

    /**
     * get ussd request/response from db by provided campaign id and list of phones
     *
     * @param {String} campaignId
     * @param {Array} phones
     * @param {Object} options
     * @property {Boolean} options.include_docs
     * @property {Number} options.limit,
     * @property {Boolean} options.descending,
     * @property {Array} options.keys,
     * @property {String} options.key
     * @returns {Promise.<T>}
     */

  }, {
    key: 'getByCampaignPhones',
    value: function getByCampaignPhones(campaignId, phones, options) {
      options = _nodeCodeUtility2.default.is.object(options) ? options : {};
      phones = _nodeCodeUtility2.default.is.array(phones) ? phones : [];
      phones = phones.map(function (phone) {
        return [campaignId, _nodeCodeUtility2.default.reformatPhoneNumber(phone)];
      });
      var params = (0, _extend2.default)({ keys: phones, include_docs: true }, options);
      return db.getView(_constants2.default.views.BY_CAMPAIGN_PHONE, params);
    }

    /**
     * get ussd request/response from db by provided direction (in or out) and list of phones
     *
     * @param {String} direction
     * @param {Array} phones
     * @param {Object} options
     * @property {Boolean} options.include_docs
     * @property {Number} options.limit,
     * @property {Boolean} options.descending,
     * @property {Array} options.keys,
     * @property {String} options.key
     * @returns {Promise.<T>}
     */

  }, {
    key: 'getByPhonesDirection',
    value: function getByPhonesDirection(direction, phones, options) {
      options = _nodeCodeUtility2.default.is.object(options) ? options : {};
      phones = _nodeCodeUtility2.default.is.array(phones) ? phones : [];
      phones = phones.map(function (phone) {
        return _nodeCodeUtility2.default.reformatPhoneNumber(phone) + '-' + direction;
      });
      var params = (0, _extend2.default)({ keys: phones, include_docs: true }, options);
      return db.getView(_constants2.default.views.BY_PHONE_DIRECTION, params);
    }

    /**
     * get ussd request/response from db by provided direction (in or out) and phone
     *
     * @param {String} direction
     * @param {String} phone
     * @param {Object} options
     * @property {Boolean} options.include_docs
     * @property {Number} options.limit,
     * @property {Boolean} options.descending,
     * @property {Array} options.keys,
     * @property {String} options.key
     * @returns {Promise.<T>}
     */

  }, {
    key: 'getByPhoneDirectionWithDate',
    value: function getByPhoneDirectionWithDate(direction, phone, options) {
      options = _nodeCodeUtility2.default.is.object(options) ? options : {};
      phone = _nodeCodeUtility2.default.is.string(phone) ? phone : '';
      var mappedKey = _nodeCodeUtility2.default.reformatPhoneNumber(phone) + '-' + direction;
      var params = (0, _extend2.default)(true, { include_docs: true, descending: false }, options);
      Model.buildKeys(mappedKey, params);
      return db.getView(_constants2.default.views.BY_PHONE_DIRECTION_DATE, params);
    }

    /**
     * get ussd latest response from db by provided phone
     *
     * @param {String} phone
     * @param {String} direction
     * @param {Object} options
     * @property {Boolean} options.include_docs
     * @property {Number} options.limit,
     * @property {Boolean} options.descending,
     * @property {Array} options.keys,
     * @property {String} options.key
     * @returns {Promise<Object>}
     */

  }, {
    key: 'getLatest',
    value: function getLatest(phone, direction, options) {
      phone = _nodeCodeUtility2.default.is.string(phone) ? phone : '';
      direction = _nodeCodeUtility2.default.is.string(direction) ? direction : 'out';
      options = _nodeCodeUtility2.default.is.object(options) ? options : {};
      options = (0, _extend2.default)(true, {
        include_docs: true,
        descending: true,
        limit: 1
      }, options);
      return this.getByPhoneDirectionWithDate(direction, phone, options).then(function (response) {
        return (response.rows[0] || {}).doc || {};
      });
    }

    /**
     * determine if it is end of session by searching for constants.flow.END_OF_SESSION keyword in outgoing message
     * end of session keyword can be #endOfSession
     *
     * @param {String} userData
     * @returns {Boolean}
     */

  }, {
    key: 'isEndOfSession',
    value: function isEndOfSession(userData) {
      return (userData || '' + _constants2.default.flow.END_OF_SESSION).toLowerCase().indexOf(_constants2.default.flow.END_OF_SESSION.toLowerCase()) > -1;
    }
  }, {
    key: 'getInstance',
    value: function getInstance() {
      if (!modelInstance) {
        modelInstance = new Model();
      }
      return modelInstance;
    }
  }, {
    key: 'setupConfig',
    value: function setupConfig(configMap) {
      var ModelInst = this.getInstance();
      configMap = _nodeCodeUtility2.default.is.object(configMap) ? configMap : {};
      configMap = (0, _extend2.default)(true, defaultConfig, configMap);
      ModelInst.config = configMap;
      config = configMap;
      db = _nodePouchdbExtended2.default.getInstance(configMap);
    }
  }]);

  return Model;
}();

module.exports = Model;