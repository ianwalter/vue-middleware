const path = require('path')
const { test } = require('@ianwalter/bff')
const { createExpressServer } = require('@ianwalter/test-server')
const { requester } = require('@ianwalter/requester')
const VueMiddleware = require('..')

test('VueMiddleware', async ({ expect, sleep }) => {
  const server = await createExpressServer()
  server.use(VueMiddleware({
    distPath: path.join(__dirname, 'fixtures/dist'),
    serverConfig: require('./fixtures/server/webpack.config.js'),
    clientConfig: require('./fixtures/client/webpack.config.js'),
    async sendResponse (req, res, next, renderer) {
      expect(req.url).toBe('/about')
      const html = await renderer.renderToString(req)
      res.type('text/html').send(html)
    }
  }))
  await sleep(10000)
  const { body } = await requester.get(`${server.url}/about`)
  expect(body).toContain('<h1>About</h1>')
  await server.close()
})
