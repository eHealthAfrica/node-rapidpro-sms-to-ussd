'use strict'

import EventEmitter from 'events'
import _ from 'lodash'
import Utility from 'node-code-utility'
import { ControllerLogger } from 'node-logger-extended'
import sleep from 'sleep-sync'

import USSDModel from './model'

const logger = new ControllerLogger({name: 'ussd'})
const constants = require('./constants')
const Model = USSDModel.getInstance()
const userPredefinedResponse = {}
const DELAY = 6000

const emitter = new EventEmitter()

const processRequest = (data) => {
  const mainEventKey = Model.getKeyFromPhone(data.msisdn)
  const endEventKey = `${mainEventKey}-end`
  const phone = Model.extractUserPhone(data.msisdn)
  let USSDParams = data.ussdparams.replace('#', '')
  const USSDCodes = Utility.is.array(Model.config.ussdCodes) ? Model.config.ussdCodes : []

  USSDCodes.forEach(code => {
    USSDParams = data.ussdparams.replace(code.replace('#', ''), constants.flow.TRIGGER)
  })

  const extraCodes = USSDParams.split('*')

  if ((userPredefinedResponse[phone] || []).length === 0 && extraCodes.length > 1) {
    USSDParams = extraCodes.shift()
    userPredefinedResponse[phone] = extraCodes
  }

  Model.processIncoming(data)
    .then((response) => {
      if (!response.wait) {
        emitter.emit(endEventKey, response.raw)
      }
    })
    .catch((error) => {
      const msg = 'something went wrong while processing #endOfSession'
      logger.error(msg, error)
      data.text = msg
      emitter.emit(endEventKey, data)
    })
}

class Controller {
  static start (req, res) {
    const srcData = Object.keys(req.query).length > 0 ? req.query : req.body
    const data = _.cloneDeep(srcData)

    const phone = Model.extractUserPhone(data.msisdn)
    const mainEventKey = Model.getKeyFromPhone(data.msisdn)
    const endEventKey = `${mainEventKey}-end`
    processRequest(data)

    emitter.on(mainEventKey, eventData => {
      if ((userPredefinedResponse[phone] || []).length > 0) {
        data.ussdparams = userPredefinedResponse[phone].shift()
        // delay between calls to rapdidPro to dequeue webhooks
        sleep(DELAY)
        processRequest(data)
      } else {
        emitter.emit(endEventKey, eventData)
      }
    })

    emitter.once(endEventKey, eventData => {
      emitter.removeAllListeners(mainEventKey)

      data.userdata = (
        eventData.text ||
        eventData.userData ||
        `Unable to process request`
      ).replace(constants.flow.END_OF_SESSION, '')

      data.endofsession = Model.isEndOfSession(eventData.text)
      Model.updateUserSession(data)
      logger.info(`exit session status = ${data.endofsession}`)
      res.json(data)
    })
  }

  static sendUSSD (req, res) {
    const body = req.body
    const mainEventKey = Model.getKeyFromPhone(body.to)
    const transformed = Model.transformData(body.to, body.text)
    transformed.direction = 'out'
    Model.save(transformed)
      .catch(Utility.simpleErrorHandler.bind(null, false))
    logger.info(`out going key = ${mainEventKey}`)
    emitter.emit(mainEventKey, body)
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
