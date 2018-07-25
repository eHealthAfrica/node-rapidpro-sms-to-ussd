'use strict'

import _ from 'lodash'
import extend from 'extend'
import request from 'request-promise'
import { ModelLogger } from 'node-logger-extended'
import Utility from 'node-code-utility'
import Database from 'node-pouchdb-extended'
import moment from 'moment-timezone'

import constants from './constants'

const logger = new ModelLogger({name: 'ussd'})
const USER_STATE_ID = constants.USER_STATE_ID
const defaultConfig = {
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
}

let config = {}
let db = null
let userSessions = {}
let savingState = false
let modelInstance = null

class Model {
  constructor () {
    if (!Utility.is.object(config)) {
      logger.info(`class constructor expects Object type passed as arg`)
      logger.info(`but got ${Object.prototype.toString.call(config)}`)
      logger.info(`using the following as default config ${JSON.stringify(defaultConfig, null, 2)}`)
    }
  }

  getRapidProUrl (status) {
    return `${this.config.rapidProUrl}/handlers/external/${status}/${this.config.rapidProChannelToken}/`
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

  processLastSession (data, response, serverResponse) {
    const lastResponse = serverResponse[0]
    const lastRequest = serverResponse[1]

    logger.info(`about to process last response (${lastResponse.phone}) and request (${lastResponse.phone})`)
    logger.info(`last request data was (${lastResponse.userData})`)
    const today = moment().tz(this.config.timeZone).format('L')
    const reportDate = moment(lastResponse.createdOn).tz(this.config.timeZone).format('L')

    const sessionNotEnded = lastResponse.endOfSession !== undefined && !lastResponse.endOfSession
    const isNotEntry = (lastRequest.userData || '').trim() !== constants.flow.TRIGGER
    const isToday = today === reportDate

    logger.info(`sessionNotEnded ${sessionNotEnded}, isNotEntry ${isNotEntry}, isToday ${isToday}`)

    if (sessionNotEnded && isToday && isNotEntry) {
      data.awaitContinueResponse = true
      this.updateUserSession(data)
      response.wait = false
      const compiled = _.template(constants.continueFlow.message)

      response.raw = {
        text: compiled(constants.continueFlow.options),
        sessionId: data.sessionId,
        msisdn: data.msisdn
      }
    }

    logger.info(`exiting last session with awaitContinueResponse = ${data.awaitContinueResponse}`)
    return response
  }

  /**
   * Private Method determine if user decides to continue from last session
   *
   * @param {Object} data
   * @param {Object} response
   * @param {Object} lastSession
   * @returns {Promise.<T>}
   */
  processContinueRequest (data, response, lastSession) {
    logger.info(`about to process continue request and wait = ${lastSession.wait}`)
    if (!lastSession.wait) {
      logger.info('exiting continue request nothing to wait')
      return Promise.resolve(lastSession)
    }
    const USSDParams = parseInt(data.ussdparams, 10)
    const continueResponse = parseInt(constants.continueFlow.options.YES, 10)
    const noContinueResponse = parseInt(constants.continueFlow.options.NO, 10)
    const wantToContinue = data.awaitContinueResponse && USSDParams === continueResponse
    const noContinue = data.awaitContinueResponse && USSDParams === noContinueResponse

    logger.info(`processContinueRequest -- awaitContinueResponse = ${data.awaitContinueResponse} USSDParams = ${USSDParams}`)
    if (wantToContinue) {
      logger.info('wantToContinue')
      return this.getLatest(data.msisdn, 'out', {})
        .then(serverResponse => {
          logger.info('wantToContinue result point')
          response.wait = false
          serverResponse.sessionId = data.sessionId
          serverResponse.awaitContinueResponse = false
          serverResponse.msisdn = data.msisdn
          this.updateUserSession(serverResponse)
          response.raw = serverResponse
          return response
        })
    }

    if (noContinue) {
      logger.info('noContinue')
      data.ussdparams = constants.flow.TRIGGER
      data.awaitContinueResponse = false
      this.updateUserSession(data)
    }
    return Promise.resolve(lastSession)
  }

  buildKeys (mappedKey, options) {
    options.descending = options.descending === undefined ? true : options.descending
    // cast descending to string to compensate for url query string types

    if (options.descending.toString() === 'true') {
      options.startkey = [mappedKey, {}]
      options.endkey = [mappedKey]
    }

    if (options.descending.toString() === 'false') {
      options.startkey = [mappedKey]
      options.endkey = [mappedKey, {}]
    }
  }

  /**
   * save request and response to db
   * @param {Object} doc
   * @returns {Promise.<T>}
   */
  save (doc) {
    doc.docType = 'ussd'
    doc.phone = Utility.reformatPhoneNumber(doc.phone)
    doc.endOfSession = this.isEndOfSession(doc.userData)
    if (config.beforeSave && Utility.is.function(config.beforeSave)) {
      try {
        return config.beforeSave(doc)
          .then(db.save)
      } catch (e) {
        logger.debug(e)
        return db.save(doc)
      }
    }

    return db.save(doc)
  }

  /**
   * gets or creates a unique key for every unique device making request or getting response based on device
   * phone number
   * @param {String} phone
   * @returns {String}
   */
  getKeyFromPhone (phone) {
    phone = this.extractUserPhone(phone)
    return `ussd-session-${phone}`
  }

  getUserState (phone) {
    phone = this.extractUserPhone(phone)
    return userSessions[phone] || {}
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

  processIncoming (data) {
    logger.info('processIncoming started')
    const original = _.cloneDeep(data)
    data = this.updateUserSession(data)
    const response = { wait: true, raw: data }

    data.ussdparams = this.config.USSD_CODES ? this.setupCode(data) : data.ussdparams

    if (Object.keys(data).length > 0) {
      const transformed = this.transformData(data.msisdn, data.ussdparams)
      transformed.direction = 'in'
      this.save(transformed)
        .catch(Utility.simpleErrorHandler.bind(null, false))

      return this.lastSessionCheck(data, response)
        .then(this.processContinueRequest.bind(null, data, response))
        .then(updatedResponse => {
          if (!updatedResponse.wait) {
            return updatedResponse
          }
          return this.notifyRapidPro(original, response)
        })
    }
    response.wait = false
    return Promise.resolve(response)
  }

  /**
   * checks last session and determine if it was completed or interrupted
   * @param {Object} data
   * @param {Object} response
   * @returns {Promise.<T>}
   */
  lastSessionCheck (data, response) {
    if (data.ussdparams === constants.flow.TRIGGER) {
      const promises = [
        this.getLatest(data.msisdn, 'out', {}),
        this.getLatest(data.msisdn, 'in', {})
      ]
      return Promise.all(promises)
        .then(this.processLastSession.bind(this, data, response))
    }
    return Promise.resolve(response)
  }

  /**
   * will pass message data.ussdparams to rapidPro server
   *
   * @param {Object} data
   * @param {Object} response
   * @returns {Promise.<T>}
   */
  notifyRapidPro (data, response) {
    logger.info(`about to send to rapid-pro for contact = ${data.msisdn}`)
    const rapidProURL = this.getRapidProUrl('received')
    data.ussdparams = data.ussdparams === '*' ? constants.flow.TRIGGER : data.ussdparams
    const sendOptions = {
      url: rapidProURL,
      form: {
        from: Utility.reformatPhoneNumber(data.msisdn),
        text: this.setupCode(data),
        date: new Date(moment().tz(this.config.timeZone).format()).toJSON()
      }
    }

    return request.post(sendOptions)
      .then(() => { return response })
      .catch((error) => {
        response.wait = false
        data.text = error.body || error.message || 'could not process request due to unknown error'
        logger.error('failed from rapid pro', error)
        return response
      })
  }

  extractUserPhone (phone) {
    return (phone || '').replace('+', '').replace('234', '')
  }

  updateUserSession (data) {
    const phone = this.extractUserPhone(data.msisdn || data.phone)
    const currentData = {
      awaitContinueResponse: (userSessions[phone] || {}).awaitContinueResponse
    }
    userSessions[phone] = extend(true, currentData, data)
    return userSessions[phone]
  }

  transformData (phone, userData) {
    const userState = this.getUserState(phone)
    return {
      phone,
      userData,
      network: userState.network,
      sessionId: userState.sessionId || userState.sessionid,
      endOfSession: this.isEndOfSession(userData)
    }
  }

  /**
   * will load last user request or response to memory on system startup
   *
   * @returns {void}
   */

  static loadUserSessions () {
    db.get(USER_STATE_ID)
      .then((response) => {
        userSessions = response
      })
      .catch(Utility.simpleErrorHandler.bind(null, false))
  }

  /**
   * saves current session to db via cron
   *
   * @returns {void}
   */
  static saveUserSessions () {
    if (!savingState) {
      logger.info('saving user session data ...')
      savingState = true
      userSessions._id = USER_STATE_ID
      userSessions.docType = USER_STATE_ID
      db.save(userSessions)
        .then((response) => {
          userSessions._rev = response._rev
          savingState = false
        })
        .catch((error) => {
          logger.info('user session data saving failed')
          savingState = false
          logger.failed(null, null, error)
        })
    }
  }

  /**
   *
   * @param {Object} data
   * @returns {String}
   */
  setupCode (data) {
    data.ussdparams = data.ussdparams.replace('#', '')
    this.config.ussdCodes = Utility.is.array(this.config.ussdCodes) ? this.config.ussdCodes : []
    this.config.ussdCodes.forEach(code => {
      data.ussdparams = data.ussdparams.replace(code.replace('#', ''), constants.flow.TRIGGER)
    })
    return data.ussdparams
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
  all (options) {
    options = Utility.is.object(options) ? options : {}
    const params = extend({}, options)
    return db.getView(constants.views.ALL, params)
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
  getByPhones (phones, options) {
    options = Utility.is.object(options) ? options : {}
    phones = Utility.is.array(phones) ? phones : []
    phones = phones.map(phone => Utility.reformatPhoneNumber(phone))
    const params = extend({ keys: phones, include_docs: true }, options)
    return db.getView(constants.views.BY_PHONE, params)
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
  getByCampaignPhones (campaignId, phones, options) {
    options = Utility.is.object(options) ? options : {}
    phones = Utility.is.array(phones) ? phones : []
    phones = phones.map(phone => [campaignId, Utility.reformatPhoneNumber(phone)])
    const params = extend({ keys: phones, include_docs: true }, options)
    return db.getView(constants.views.BY_CAMPAIGN_PHONE, params)
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
  getByPhonesDirection (direction, phones, options) {
    options = Utility.is.object(options) ? options : {}
    phones = Utility.is.array(phones) ? phones : []
    phones = phones.map(phone => `${Utility.reformatPhoneNumber(phone)}-${direction}`)
    const params = extend({ keys: phones, include_docs: true }, options)
    return db.getView(constants.views.BY_PHONE_DIRECTION, params)
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
  getByPhoneDirectionWithDate (direction, phone, options) {
    options = Utility.is.object(options) ? options : {}
    phone = Utility.is.string(phone) ? phone : ''
    const mappedKey = `${Utility.reformatPhoneNumber(phone)}-${direction}`
    const params = extend(true, { include_docs: true, descending: false }, options)
    this.buildKeys(mappedKey, params)
    return db.getView(constants.views.BY_PHONE_DIRECTION_DATE, params)
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

  getLatest (phone, direction, options) {
    phone = Utility.is.string(phone) ? phone : ''
    direction = Utility.is.string(direction) ? direction : 'out'
    options = Utility.is.object(options) ? options : {}
    options = extend(true, {
      include_docs: true,
      descending: true,
      limit: 1
    }, options)
    return this.getByPhoneDirectionWithDate(direction, phone, options)
      .then(response => (response.rows[0] || {}).doc || {})
  }

  /**
   * determine if it is end of session by searching for constants.flow.END_OF_SESSION keyword in outgoing message
   * end of session keyword can be #endOfSession
   *
   * @param {String} userData
   * @returns {Boolean}
   */
  isEndOfSession (userData) {
    return (userData || `${constants.flow.END_OF_SESSION}`)
      .toLowerCase().indexOf(constants.flow.END_OF_SESSION.toLowerCase()) > -1
  }

  static getInstance () {
    if (!modelInstance) {
      modelInstance = new Model()
    }
    return modelInstance
  }

  static setupConfig (configMap) {
    const Model = this.getInstance()
    configMap = Utility.is.object(configMap) ? configMap : {}
    configMap = extend(true, defaultConfig, configMap)
    Model.config = configMap
    config = configMap
    db = Database.getInstance(configMap)
  }
}

module.exports = Model
