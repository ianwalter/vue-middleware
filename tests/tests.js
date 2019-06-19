const path = require('path')
const { test } = require('@ianwalter/bff')
const express = require('express')
const supertest = require('supertest')
const VueMiddleware = require('..')

test('VueMiddleware', async ({ expect, sleep }) => {
  const app = express()
  app.use(VueMiddleware({
    distPath: path.join(__dirname, 'fixtures/dist'),
    serverConfig: require('./fixtures/server/webpack.config.js'),
    clientConfig: require('./fixtures/client/webpack.config.js'),
    async sendResponse (req, res, next, renderer) {
      expect(req.url).toBe('/about')
      const html = await renderer.renderToString(req)
      res.type('text/html').send(html)
    }
  }))
  const server = app.listen()
  await sleep(10000)
  const { body } = await supertest(server).get('/about')
  expect(body).toContain('<h1>About</h1>')
})
