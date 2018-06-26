'use strict'

import os from 'os'
import http from 'http'
import express from 'express'
import server from './index'
import RoutesConfig from './routes.conf'

const PORT = process.env.PORT || 4040
const app = express()
const router = express.Router([])

server({
  host: 'http://localhost',
  port: 5984,
  db: 'test',
  auth: {
    username: 'admin',
    password: 'admin'
  },
  rapidProUrl: 'http://localhost:8000',
  rapidProChannelToken: 'f59a26f6-b8e0-4831-831c-3bf416edcc5c',
  rapidProAPIToken: '',
  ussdCodes: ['*35131*22#']
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
