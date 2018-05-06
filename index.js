const { readFileSync } = require('fs')
const { join, dirname } = require('path')

const mercuryWebpack = require('@appjumpstart/mercury-webpack')
const { createBundleRenderer } = require('vue-server-renderer')

const { NODE_ENV } = process.env

module.exports = function mercuryVue (options) {
  const basedir = dirname(module.parent.filename)
  const {
    distPath = join(basedir, 'dist'),
    templatePath = join(basedir, 'index.html'),
    createContext = (req, res) => ({ url: req.url }),
    development = !NODE_ENV || NODE_ENV === 'development'
  } = options
  const bundlePath = join(distPath, 'vue-ssr-server-bundle.json')
  const manifestPath = join(distPath, 'static', 'vue-ssr-client-manifest.json')

  // Update the renderer when the serverBundle or clientManifest changes.
  let renderer
  let serverBundle
  let clientManifest
  function updateRenderer () {
    renderer = createBundleRenderer(serverBundle, {
      runInNewContext: false,
      template: readFileSync(templatePath, 'utf-8'),
      basedir,
      clientManifest
    })
  }

  if (!development) {
    serverBundle = require(bundlePath)
    clientMaifest = require(manifestPath)
    updateRenderer()
  }

  const mercuryWebpackMiddleware = mercuryWebpack({
    ...options,
    serverHook: function webpackServerHook (mfs) {
      serverBundle = JSON.parse(mfs.readFileSync(bundlePath))
      updateRenderer()
    },
    clientHook: function webpackClientHook ({ fileSystem }) {
      clientManifest = JSON.parse(fileSystem.readFileSync(manifestPath))
      updateRenderer()
    }
  })

  return function mercuryVuePassthrough (req, res, next) {
    mercuryWebpackMiddleware(req, res, async function mercuryVueMiddleware (err) {
      //
      if (err || req.method !== 'GET') {
        next(err)
      } else {
        // TODO: setInterval until renderer is not undefined.

        //
        try {
          // Use the renderer to generate the HTML that will be sent to the
          // client.
          const app = await renderer.renderToString(createContext(req, res))
          res.type('text/html').send(app)
        } catch (error) {
          next(error)
        }
      }
    })
  }
}
