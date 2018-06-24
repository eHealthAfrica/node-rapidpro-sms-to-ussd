'use strict';

const _ = require('lodash');
const extend = require('extend');
const request = require('request-promise');
const moment = require('moment-timezone');

const db = require('../../commons/db');
const config = require('../../config');
const smsService = require('../sms/sms.service');
const ModelLogger = require('../../commons/logging').ModelLogger;
const Utility = require('../../lib/utility');
const constants = require('./ussd.constants');
const settingsModel = require('../settings/settings.model');

const logger = new ModelLogger({ name: 'ussd' });
const USER_STATE_ID = constants.USER_STATE_ID;
const serverType = config.serverType;

let userSessions = {};
let savingState = false;

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

const processLastSession = (data, response, serverResponse) => {
  const lastResponse = serverResponse[0];
  const lastRequest = serverResponse[1];
  logger.info(`about to process last response (${lastResponse.phone}) and request (${lastResponse.phone})`);
  logger.info(`last request data was (${lastResponse.userData})`);
  const today = moment().tz(config.TIME_ZONE).format('L');
  const reportDate = moment(lastResponse.createdOn).tz(config.TIME_ZONE).format('L');

  const sessionNotEnded = lastResponse.endOfSession !== undefined && !lastResponse.endOfSession;
  const isNotEntry = (lastRequest.userData || '').trim() !== constants.flow.TRIGGER;
  const isToday = today === reportDate;
  logger.info(`sessionNotEnded ${sessionNotEnded}, isNotEntry ${isNotEntry}, isToday ${isToday}`);
  if (sessionNotEnded && isToday && isNotEntry) {
    data.awaitContinueResponse = true;
    USSDModel.updateUserSession(data);
    response.wait = false;
    const compiled = _.template(constants.continueFlow.message);
    response.raw = {
      text: compiled(constants.continueFlow.options),
      sessionId: data.sessionId,
      msisdn: data.msisdn
    };
  }
  logger.info(`exiting last session with awaitContinueResponse = ${data.awaitContinueResponse}`);
  return response;
};

/**
 * Private Method determine if user decides to continue from last session
 *
 * @param {Object} data
 * @param {Object} response
 * @param {Object} lastSession
 * @returns {Promise.<T>}
 */
const processContinueRequest = (data, response, lastSession) => {
  logger.info(`about to process continue request and wait = ${lastSession.wait}`);
  if (!lastSession.wait) {
    logger.info('exiting continue request nothing to wait');
    return Promise.resolve(lastSession);
  }
  const USSDParams = parseInt(data.ussdparams, 10);
  const continueResponse = parseInt(constants.continueFlow.options.YES, 10);
  const noContinueResponse = parseInt(constants.continueFlow.options.NO, 10);
  const wantToContinue = data.awaitContinueResponse && USSDParams === continueResponse;
  const noContinue = data.awaitContinueResponse && USSDParams === noContinueResponse;
  logger.info(`processContinueRequest -- awaitContinueResponse = ${data.awaitContinueResponse} USSDParams = ${USSDParams}`);
  if (wantToContinue) {
    logger.info('wantToContinue');
    return USSDModel.getLatest(data.msisdn, 'out', {}).then(serverResponse => {
      logger.info('wantToContinue result point');
      response.wait = false;
      serverResponse.sessionId = data.sessionId;
      serverResponse.awaitContinueResponse = false;
      serverResponse.msisdn = data.msisdn;
      USSDModel.updateUserSession(serverResponse);
      response.raw = serverResponse;
      return response;
    });
  }

  if (noContinue) {
    logger.info('noContinue');
    data.ussdparams = constants.flow.TRIGGER;
    data.awaitContinueResponse = false;
    USSDModel.updateUserSession(data);
  }
  return Promise.resolve(lastSession);
};

const buildKeys = (mappedKey, options) => {
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
};

class USSDModel {
  /**
   * save request and response to db
   * @param {Object} doc
   * @returns {Promise.<T>}
   */
  static save(doc) {
    doc.docType = 'ussd';
    doc.phone = Utility.reformatPhoneNumber(doc.phone);
    doc.endOfSession = USSDModel.isEndOfSession(doc.userData);
    return smsService.currentCampaign(doc.phone).then(campaign => {
      doc.campaignId = campaign || '';
      logger.info(`saving data with direction = ${doc.direction} and text is = ${doc.userData} for 
        contact = ${doc.phone} for campaign = ${campaign || 'None'}`);
      return db.save(doc);
    });
  }

  /**
   * gets or creates a unique key for every unique device making request or getting response based on device
   * phone number
   * @param {String} phone
   * @returns {String}
   */
  static getKeyFromPhone(phone) {
    phone = USSDModel.extractUserPhone(phone);
    return `ussd-session-${phone}`;
  }

  static getUserState(phone) {
    phone = USSDModel.extractUserPhone(phone);
    return userSessions[phone] || {};
  }

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

  static processIncoming(data) {
    logger.info('processIncoming started');
    const original = _.cloneDeep(data);
    data = USSDModel.updateUserSession(data);
    const response = { wait: true, raw: data };

    data.ussdparams = config.ussd.code ? USSDModel.setupCode(data) : data.ussdparams;

    if (Object.keys(data).length > 0) {
      const transformed = USSDModel.transformData(data.msisdn, data.ussdparams);
      transformed.direction = 'in';
      USSDModel.save(transformed).catch(Utility.simpleErrorHandler.bind(null, false));

      return USSDModel.lastSessionCheck(data, response).then(processContinueRequest.bind(null, data, response)).then(updatedResponse => {
        if (!updatedResponse.wait) {
          return updatedResponse;
        }
        return USSDModel.notifyRapidPro(original, response);
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
  static lastSessionCheck(data, response) {
    if (data.ussdparams === constants.flow.TRIGGER) {
      const promises = [USSDModel.getLatest(data.msisdn, 'out', {}), USSDModel.getLatest(data.msisdn, 'in', {})];
      return Promise.all(promises).then(processLastSession.bind(null, data, response));
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
  static notifyRapidPro(data, response) {
    logger.info(`about to send to rapid-pro for contact = ${data.msisdn}`);
    const rapidProConfig = Object.assign({ status: 'received' }, USSDModel.getRapidProConfig());
    const rapidProURL = smsService.getURL('rapidPro', rapidProConfig);
    data.ussdparams = data.ussdparams === '*' ? constants.flow.TRIGGER : data.ussdparams;
    const sendOptions = {
      url: rapidProURL,
      form: {
        from: Utility.reformatPhoneNumber(data.msisdn),
        text: USSDModel.setupCode(data),
        date: new Date(moment().tz(config.TIME_ZONE).format()).toJSON()
      }
    };

    return request.post(sendOptions).then(() => {
      return response;
    }).catch(error => {
      response.wait = false;
      data.text = error.body || error.message || 'could not process request due to unknown error';
      logger.error('failed from rapid pro', error);
      return response;
    });
  }

  static extractUserPhone(phone) {
    return (phone || '').replace('+', '').replace('234', '');
  }

  static updateUserSession(data) {
    const phone = USSDModel.extractUserPhone(data.msisdn || data.phone);
    const currentData = {
      awaitContinueResponse: (userSessions[phone] || {}).awaitContinueResponse
    };
    userSessions[phone] = extend(true, currentData, data);
    return userSessions[phone];
  }

  static transformData(phone, userData) {
    const userState = USSDModel.getUserState(phone);
    return {
      phone,
      userData,
      network: userState.network,
      sessionId: userState.sessionId || userState.sessionid,
      endOfSession: USSDModel.isEndOfSession(userData)
    };
  }

  /**
   * will load last user request or response to memory on system startup
   *
   * @returns {void}
   */

  static loadUserSessions() {
    db.get(USER_STATE_ID).then(response => {
      userSessions = response;
    }).catch(Utility.simpleErrorHandler.bind(null, false));
  }

  /**
   * saves current session to db via cron
   *
   * @returns {void}
   */
  static saveUserSessions() {
    if (!savingState) {
      logger.info('saving user session data ...');
      savingState = true;
      userSessions._id = USER_STATE_ID;
      userSessions.docType = USER_STATE_ID;
      db.save(userSessions).then(response => {
        userSessions._rev = response._rev;
        savingState = false;
      }).catch(error => {
        logger.info('user session data saving failed');
        savingState = false;
        logger.failed(null, null, error);
      });
    }
  }

  /**
   *
   * @param {Object} data
   * @returns {String}
   */
  static setupCode(data) {
    data.ussdparams = data.ussdparams.replace('#', '');
    config.ussd.code = config.ussd.code || [];
    config.ussd.code.forEach(code => {
      data.ussdparams = data.ussdparams.replace(code.replace('#', ''), constants.flow.TRIGGER);
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
  static all(options) {
    options = Utility.is.object(options) ? options : {};
    const params = extend({}, options);
    return db.getView(constants.views.ALL, params);
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
  static getByPhones(phones, options) {
    options = Utility.is.object(options) ? options : {};
    phones = Utility.is.array(phones) ? phones : [];
    phones = phones.map(phone => Utility.reformatPhoneNumber(phone));
    const params = extend({ keys: phones, include_docs: true }, options);
    return db.getView(constants.views.BY_PHONE, params);
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
  static getByCampaignPhones(campaignId, phones, options) {
    options = Utility.is.object(options) ? options : {};
    phones = Utility.is.array(phones) ? phones : [];
    phones = phones.map(phone => [campaignId, Utility.reformatPhoneNumber(phone)]);
    const params = extend({ keys: phones, include_docs: true }, options);
    return db.getView(constants.views.BY_CAMPAIGN_PHONE, params);
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
  static getByPhonesDirection(direction, phones, options) {
    options = Utility.is.object(options) ? options : {};
    phones = Utility.is.array(phones) ? phones : [];
    phones = phones.map(phone => `${Utility.reformatPhoneNumber(phone)}-${direction}`);
    const params = extend({ keys: phones, include_docs: true }, options);
    return db.getView(constants.views.BY_PHONE_DIRECTION, params);
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
  static getByPhoneDirectionWithDate(direction, phone, options) {
    options = Utility.is.object(options) ? options : {};
    phone = Utility.is.string(phone) ? phone : '';
    const mappedKey = `${Utility.reformatPhoneNumber(phone)}-${direction}`;
    const params = extend(true, { include_docs: true, descending: false }, options);
    buildKeys(mappedKey, params);
    return db.getView(constants.views.BY_PHONE_DIRECTION_DATE, params);
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

  static getLatest(phone, direction, options) {
    phone = Utility.is.string(phone) ? phone : '';
    direction = Utility.is.string(direction) ? direction : 'out';
    options = Utility.is.object(options) ? options : {};
    options = extend(true, {
      include_docs: true,
      descending: true,
      limit: 1
    }, options);
    return USSDModel.getByPhoneDirectionWithDate(direction, phone, options).then(response => (response.rows[0] || {}).doc || {});
  }

  /**
   * determine if it is end of session by searching for constants.flow.END_OF_SESSION keyword in outgoing message
   * end of session keyword can be #endOfSession
   *
   * @param {String} userData
   * @returns {Boolean}
   */
  static isEndOfSession(userData) {
    return (userData || '').toLowerCase().indexOf(constants.flow.END_OF_SESSION.toLowerCase()) > -1;
  }

  static getRapidProDomain() {
    const settings = settingsModel.get(constants.APP_TYPE)[serverType] || {};
    return ((settings.rapidPro || {}).ussd || {}).domain || config.ussd.rapidPro.domain;
  }

  static getRapidProAPIToken() {
    const settings = settingsModel.get(constants.APP_TYPE)[serverType] || {};
    return ((settings.rapidPro || {}).ussd || {}).apiToken || config.ussd.rapidPro.apiToken;
  }

  static getRapidProChannelToken() {
    const settings = settingsModel.get(constants.APP_TYPE)[serverType] || {};
    return ((settings.rapidPro || {}).ussd || {}).channelToken || config.ussd.rapidPro.channelToken;
  }

  static getRapidProChannelPath() {
    const settings = settingsModel.get(constants.APP_TYPE)[serverType] || {};
    return ((settings.rapidPro || {}).ussd || {}).channelPath || '/handlers/external';
  }

  /**
   * @return {Object}
   */
  static getRapidProConfig() {
    const domain = USSDModel.getRapidProDomain();
    logger.info(`rapidPro domain used here is ${domain}`);
    const params = {
      domain: domain,
      channelToken: USSDModel.getRapidProChannelToken(),
      apiToken: USSDModel.getRapidProAPIToken(),
      channelPath: USSDModel.getRapidProChannelPath()
    };
    return extend(true, config.ussd.rapidPro, params);
  }
}

module.exports = USSDModel;