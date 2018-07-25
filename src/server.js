'use strict'

import os from 'os'
import http from 'http'
import express from 'express'
import server from './index'
import RoutesConfig from './routes.conf'

const PORT = process.env.SERVER_PORT || 4040
const app = express()
const router = express.Router([])
const env = process.env

server({
  host: env.COUCHDB_HOST || 'http://localhost',
  port: env.COUCHDB_PORT || 5984,
  db: env.COUCHDB_NAME || 'test',
  auth: {
    username: env.COUCHDB_USER || 'admin',
    password: env.COUCHDB_PASS || 'admin'
  },
  rapidProUrl: env.RAPIDPRO_URL || 'http://localhost:8000',
  rapidProChannelToken: env.RAPIDPRO_CHANNEL_TOKEN || '04702942-a8ea-4a4c-abef-5c277ec45d1b',
  rapidProAPIToken: env.RAPIDPRO_API_TOKEN || '',
  ussdCodes: (env.USSD_CODES || '*35131*22#').split(',')
}, router)

RoutesConfig.init(app)
app.use('/', router)

// log exceptions without halting system
process.on('uncaughtException', (err) => {
  console.log(err)
})

http.createServer(app)
  .listen(PORT, () => {
    console.log(`up and running @: ${os.hostname()} on port: ${PORT}`)
  })
