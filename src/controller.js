

import EventEmitter from 'events';
import _ from 'lodash';
import Utility from 'node-code-utility';
import { ControllerLogger } from 'node-logger-extended';
import sleep from 'sleep-sync';

import USSDModel from './model';

const logger = new ControllerLogger({ name: 'ussd' });
const constants = require('./constants');

let Model = null;
const userPredefinedResponse = {};
const DELAY = 6000;

const emitter = new EventEmitter();

const ModelInstance = () => {
  if (!Model) {
    Model = USSDModel.getInstance();
  }
};

const processRequest = (data) => {
  ModelInstance();
  const mainEventKey = USSDModel.getKeyFromPhone(data.msisdn);
  const endEventKey = `${mainEventKey}-end`;
  const phone = USSDModel.extractUserPhone(data.msisdn);
  let USSDParams = data.ussdparams.replace('#', '');
  const USSDCodes = Utility.is.array(Model.config.ussdCodes) ? Model.config.ussdCodes : [];

  USSDCodes.forEach((code) => {
    USSDParams = data.ussdparams.replace(code.replace('#', ''), constants.flow.TRIGGER);
  });

  const extraCodes = USSDParams.split('*');

  if ((userPredefinedResponse[phone] || []).length === 0 && extraCodes.length > 1) {
    USSDParams = extraCodes.shift();
    userPredefinedResponse[phone] = extraCodes;
  }

  Model.processIncoming(data)
    .then((response) => {
      if (!response.wait) {
        emitter.emit(endEventKey, response.raw);
      }
    })
    .catch((error) => {
      const msg = 'something went wrong while processing #endOfSession';
      logger.error(msg, error);
      data.text = msg;
      emitter.emit(endEventKey, data);
    });
};

class Controller {
  static start(req, res) {
    ModelInstance();
    const srcData = Object.keys(req.query).length > 0 ? req.query : req.body;
    const data = _.cloneDeep(srcData);

    const phone = USSDModel.extractUserPhone(data.msisdn);
    const mainEventKey = USSDModel.getKeyFromPhone(data.msisdn);
    const endEventKey = `${mainEventKey}-end`;
    processRequest(data);

    emitter.on(mainEventKey, (eventData) => {
      if ((userPredefinedResponse[phone] || []).length > 0) {
        data.ussdparams = userPredefinedResponse[phone].shift();
        // delay between calls to rapdidPro to dequeue webhooks
        sleep(DELAY);
        processRequest(data);
      } else {
        emitter.emit(endEventKey, eventData);
      }
    });

    emitter.once(endEventKey, (eventData) => {
      emitter.removeAllListeners(mainEventKey);

      data.userdata = (
        eventData.text
        || eventData.userData
        || 'Unable to process request'
      ).replace(constants.flow.END_OF_SESSION, '');

      data.endofsession = Model.isEndOfSession(eventData.text);
      Model.updateUserSession(data);
      logger.info(`exit session status = ${data.endofsession}`);
      res.json(data);
    });
  }

  static sendUSSD(req, res) {
    ModelInstance();
    const { body } = req;
    const mainEventKey = Model.getKeyFromPhone(body.to);
    const transformed = Model.transformData(body.to, body.text);
    transformed.direction = 'out';
    Model.save(transformed)
      .catch(Utility.simpleErrorHandler.bind(null, false));
    logger.info(`out going key = ${mainEventKey}`);
    emitter.emit(mainEventKey, body);
    res.json({ msg: 'response received' });
  }

  static all(req, res) {
    const options = req.query || {};
    USSDModel.all(options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error));
  }

  static getConfig(req, res) {
    res.json(Model.getRapidProConfig());
  }

  static getByPhones(req, res) {
    const options = req.query || {};
    const phones = (options.phones || '').split(',');
    delete options.phones;
    USSDModel.getByPhones(phones, options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error));
  }

  static getByCampaignPhones(req, res) {
    const options = req.query || {};
    const { campaignId } = req.params;
    const phones = (options.phones || '').split(',');
    delete options.phones;
    USSDModel.getByCampaignPhones(campaignId, phones, options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error));
  }

  static getByPhonesDirection(req, res) {
    const options = req.query || {};
    const { direction } = req.params;
    const phones = (options.phones || '').split(',');
    delete options.phones;
    USSDModel.getByPhonesDirection(direction, phones, options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error));
  }

  static getByPhonesDirectionWithDate(req, res) {
    const options = req.query || {};
    const { direction } = req.params;
    const { phone } = req.params;
    USSDModel.getByPhoneDirectionWithDate(direction, phone, options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error));
  }
}

module.exports = Controller;
