'use strict';

const EventEmitter = require('events');
const _ = require('lodash');

const USSDModel = require('./ussd.model');
const Utility = require('../../lib/utility');
const ControllerLogger = require('../../commons/logging').ControllerLogger;
const logger = new ControllerLogger({ name: 'ussd' });
const constants = require('./ussd.constants');
const SettingsModel = require('../settings/settings.model');
const serverType = require('../../config').serverType;

const APP_TYPE = constants.APP_TYPE;
const emitter = new EventEmitter();

class USSDController {
  static start(req, res) {
    const srcData = Object.keys(req.query).length > 0 ? req.query : req.body;
    const data = _.cloneDeep(srcData);

    const settingsOptions = SettingsModel.createOptions(APP_TYPE, serverType);
    logger.info(`shouldRedirect = ${settingsOptions.shouldRedirect} and current = ${settingsOptions.settings.current}`);
    if (settingsOptions.shouldRedirect) {
      SettingsModel.redirectPostTo(settingsOptions.url, srcData).then(response => res.json(response)).catch(error => res.status(error.status || 500).json(error));
      return;
    }

    logger.info('initial entry');
    USSDModel.processIncoming(data).then(response => {
      if (!response.wait) {
        emitter.emit(USSDModel.getKeyFromPhone(data.msisdn), response.raw);
      }
    }).catch(error => {
      const msg = 'something went wrong while processing #endOfSession';
      logger.error(msg, error);
      data.text = msg;
      emitter.emit(USSDModel.getKeyFromPhone(data.msisdn), data);
    });
    const key = USSDModel.getKeyFromPhone(data.msisdn);
    logger.info(`generated key = ${key}`);
    emitter.once(key, eventData => {
      data.userdata = (eventData.text || eventData.userData || '').replace(constants.flow.END_OF_SESSION, '');
      data.endofsession = USSDModel.isEndOfSession(eventData.text);
      USSDModel.updateUserSession(data);
      logger.info(`exit session status = ${data.endofsession}`);
      res.json(data);
    });
  }

  static sendUSSD(req, res) {
    const body = req.body;
    const key = USSDModel.getKeyFromPhone(body.to);
    const transformed = USSDModel.transformData(body.to, body.text);
    transformed.direction = 'out';
    USSDModel.save(transformed).catch(Utility.simpleErrorHandler.bind(null, false));
    logger.info(`out going key = ${key}`);
    emitter.emit(key, body);
    res.json({ msg: 'response received' });
  }

  static all(req, res) {
    const options = req.query || {};
    USSDModel.all(options).then(response => res.json(response)).catch(error => res.status(error.status || 500).json(error));
  }

  static getConfig(req, res) {
    res.json(USSDModel.getRapidProConfig());
  }

  static getByPhones(req, res) {
    const options = req.query || {};
    const phones = (options.phones || '').split(',');
    delete options.phones;
    USSDModel.getByPhones(phones, options).then(response => res.json(response)).catch(error => res.status(error.status || 500).json(error));
  }

  static getByCampaignPhones(req, res) {
    const options = req.query || {};
    const campaignId = req.params.campaignId;
    const phones = (options.phones || '').split(',');
    delete options.phones;
    USSDModel.getByCampaignPhones(campaignId, phones, options).then(response => res.json(response)).catch(error => res.status(error.status || 500).json(error));
  }

  static getByPhonesDirection(req, res) {
    const options = req.query || {};
    const direction = req.params.direction;
    const phones = (options.phones || '').split(',');
    delete options.phones;
    USSDModel.getByPhonesDirection(direction, phones, options).then(response => res.json(response)).catch(error => res.status(error.status || 500).json(error));
  }

  static getByPhonesDirectionWithDate(req, res) {
    const options = req.query || {};
    const direction = req.params.direction;
    const phone = req.params.phone;
    USSDModel.getByPhoneDirectionWithDate(direction, phone, options).then(response => res.json(response)).catch(error => res.status(error.status || 500).json(error));
  }
}

module.exports = USSDController;