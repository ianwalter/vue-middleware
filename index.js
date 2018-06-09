const { readFileSync } = require('fs')
const { join, dirname } = require('path')
const { oneLineTrim } = require('common-tags')

const mercuryWebpack = require('@appjumpstart/mercury-webpack')
const { createBundleRenderer } = require('vue-server-renderer')

const { NODE_ENV } = process.env

module.exports = function mercuryVue (options) {
  // Set the base directory as the directory containing the module that has
  // imported this module.
  const basedir = dirname(module.parent.filename)

  // Destructure options into variables with defaults.
  const {
    // The ouput directory specified in the serverBundle's webpack config.
    distPath = join(basedir, 'dist'),
    // The path to the index.html that will be used as a page template.
    templatePath = join(basedir, 'index.html'),
    // A function used to extract data form the request in order to render a
    // page specific to that request.
    createContext = (req, res) => ({ url: req.url }),
    // A boolean describing whether to operate in development mode or not.
    development = !NODE_ENV || NODE_ENV === 'development',
    // The name of the directory within the dist directory used for static
    // assets.
    staticDir = 'static',
    // The max amount of 100ms tries that the middleware should attempt to
    // wait for the renderer to be created.
    rendererCheckTries = 600,
    // An logger instance used to output information.
    logger = console
  } = options

  // Set serverBundle and clientManifest paths.
  const bundlePath = join(distPath, 'vue-ssr-server-bundle.json')
  const manifestPath = join(distPath, staticDir, 'vue-ssr-client-manifest.json')

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

  let createRendererErr
  let mercuryWebpackMiddleware
  if (development) {
    // Create an error message for the case when a render
    createRendererErr = new Error(oneLineTrim`
      Renderer was not created after ${rendererCheckTries * 100 / 1000}s.
    `)

    // Initialize the mercury-webpack middleware with hooks to update the
    // renderer when webpack-dev-server has re-generated the serverBundle or
    // clientManifest.
    mercuryWebpackMiddleware = mercuryWebpack({
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
  } else {
    // If not in development mode, use the pre-built serverBundle and
    // clientManfiest to create the renderer.
    serverBundle = require(bundlePath)
    clientMaifest = require(manifestPath)
    updateRenderer()
  }

  // Renders a page based on the request context and sends it to the client.
  async function sendPage (req, res, next) {
    // Create the context object used to pass data to the renderer.
    const context = createContext(req, res)

    try {
      // Use the renderer to generate HTML and send it to the client.
      const html = await renderer.renderToString(context)
      res.type('text/html').send(html)
    } catch (err) {
      next(err)
    }
  }

  async function mercuryVueMiddleware (err, req, res, next) {
    if (err || req.method !== 'GET') {
      // If there is an error or the request method is not GET, continue to the
      // next middleware/handler since no processing needs to be done in those
      // cases.
      next(err)
    } else {
      try {
        if (renderer) {
          // If the renderer already exists, go ahead and generate the page and
          // send it in the response.
          sendPage(req, res, next)
        } else {
          // Notify the user that the middleware is waiting for the renderer to
          // be created.
          logger.info('Waiting for the renderer to be created...')

          // Check for the renderer to be defined in 100ms intervals up until
          // the max tries is reached.
          let tries = 0
          let rendererCheckInterval = setInterval(() => {
            tries++
            if (renderer) {
              clearInterval(rendererCheckInterval)
              sendPage(req, res, next)
            } else if (tries === rendererCheckTries) {
              clearInterval(rendererCheckInterval)
              next(createRendererErr)
            }
          }, 100)
        }
      } catch (err) {
        next(err)
      }
    }
  }

  // Return a passthrough middleware function that will optionally route the
  // request through the mercury-webpack middleware if in development mode
  // before routing the request through the mercury-vue middleware.
  return function mercuryVuePassthrough (req, res, next) {
    if (mercuryWebpackMiddleware) {
      const mercuryVueNext = err => mercuryVueMiddleware(err, req, res, next)
      mercuryWebpackMiddleware(req, res, mercuryVueNext)
    } else {
      mercuryVueMiddleware(null, req, res, next)
    }
  }
}
