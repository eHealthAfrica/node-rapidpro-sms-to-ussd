'use strict'

import EventEmitter from 'events'
import _ from 'lodash'
import Utility from 'node-code-utility'
import { ControllerLogger } from 'node-logger-extended'

import USSDModel from './model'

const logger = new ControllerLogger({name: 'ussd'})
const constants = require('./constants')
const Model = USSDModel.getInstance()

const emitter = new EventEmitter()

class Controller {
  static start (req, res) {
    const srcData = Object.keys(req.query).length > 0 ? req.query : req.body
    const data = _.cloneDeep(srcData)

    logger.info('initial entry')
    Model.processIncoming(data)
      .then((response) => {
        if (!response.wait) {
          emitter.emit(Model.getKeyFromPhone(data.msisdn), response.raw)
        }
      })
      .catch((error) => {
        const msg = 'something went wrong while processing #endOfSession'
        logger.error(msg, error)
        data.text = msg
        emitter.emit(Model.getKeyFromPhone(data.msisdn), data)
      })
    const key = Model.getKeyFromPhone(data.msisdn)
    logger.info(`generated key = ${key}`)
    emitter.once(key, (eventData) => {
      data.userdata = (eventData.text || eventData.userData || '').replace(constants.flow.END_OF_SESSION, '')
      data.endofsession = Model.isEndOfSession(eventData.text)
      Model.updateUserSession(data)
      logger.info(`exit session status = ${data.endofsession}`)
      res.json(data)
    })
  }

  static sendUSSD (req, res) {
    const body = req.body
    const key = Model.getKeyFromPhone(body.to)
    const transformed = Model.transformData(body.to, body.text)
    transformed.direction = 'out'
    Model.save(transformed)
      .catch(Utility.simpleErrorHandler.bind(null, false))
    logger.info(`out going key = ${key}`)
    emitter.emit(key, body)
    res.json({msg: 'response received'})
  }

  static all (req, res) {
    const options = req.query || {}
    Model.all(options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error))
  }

  static getConfig (req, res) {
    res.json(Model.getRapidProConfig())
  }

  static getByPhones (req, res) {
    const options = req.query || {}
    const phones = (options.phones || '').split(',')
    delete options.phones
    Model.getByPhones(phones, options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error))
  }

  static getByCampaignPhones (req, res) {
    const options = req.query || {}
    const campaignId = req.params.campaignId
    const phones = (options.phones || '').split(',')
    delete options.phones
    Model.getByCampaignPhones(campaignId, phones, options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error))
  }

  static getByPhonesDirection (req, res) {
    const options = req.query || {}
    const direction = req.params.direction
    const phones = (options.phones || '').split(',')
    delete options.phones
    Model.getByPhonesDirection(direction, phones, options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error))
  }

  static getByPhonesDirectionWithDate (req, res) {
    const options = req.query || {}
    const direction = req.params.direction
    const phone = req.params.phone
    Model.getByPhoneDirectionWithDate(direction, phone, options)
      .then(response => res.json(response))
      .catch(error => res.status(error.status || 500).json(error))
  }
}

module.exports = Controller
