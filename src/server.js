'use strict'

import os from 'os'
import http from 'http'
import express from 'express'

import RoutesConfig from './routes.conf'
import Routes from './router'
import USSDModel from './model'

const PORT = process.env.PORT || 4040

const app = express()
const router = express.Router()

USSDModel.setupConfig({
  RAPIDPRO_CHANNEL_TOKEN: '5c2e7bc6-a96b-44fb-a95c-09863cdff4cf',
  COUCHDB_URL: 'http://admin:admin@localhost:5984/set',
  USSD_CODES: [
    '*35131*22#'
  ]
})

RoutesConfig.init(app)
Routes.init(router)
app.use('/', router)

// log exceptions without halting system
process.on('uncaughtException', (err) => {
  console.log(err)
})

http.createServer(app)
  .listen(PORT, () => {
    console.log(`up and running @: ${os.hostname()} on port: ${PORT}`)
  })
