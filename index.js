const { readFileSync } = require('fs')
const { join, dirname } = require('path')
const { oneLineTrim } = require('common-tags')

const mercuryWebpack = require('@appjumpstart/mercury-webpack')
const { createBundleRenderer } = require('vue-server-renderer')
const { pick } = require('accept-language-parser')

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
    createContext = req => ({ url: req.url }),
    // A boolean describing whether to operate in development mode or not.
    development = !NODE_ENV || NODE_ENV === 'development',
    // The name of the directory within the dist directory used for static
    // assets.
    staticDir = 'static',
    // The max amount of 100ms attempts that the middleware should attempt to
    // wait for the renderer to be created.
    rendererCheckAttempts = 600,
    // A logger instance used to output information.
    logger = console,
    // An array of language codes that are supported by the application.
    supportedLanguages = [],
    // The language code to default to if a request's preferred language isn't
    // supported by the application.
    defaultLanguage = options.supportedLanguages[0]
  } = options

  // Create the keys array used to create the necessary renderers based on
  // whether the serverConfig is a multi-compiler config or not.
  const keys = supportedLanguages.length ? supportedLanguages : ['default']

  // Update the renderer when the serverBundle or clientManifest changes.
  let renderers = {}
  let serverBundles = {}
  let clientManifests = {}
  function updateRenderer (key) {
    renderers[key] = createBundleRenderer(serverBundles[key], {
      runInNewContext: false,
      template: readFileSync(templatePath, 'utf-8'),
      basedir,
      clientManifest: clientManifests[key]
    })
  }

  let createRendererErr
  let mercuryWebpackMiddlewares = {}
  keys.forEach(key => {
    // Set serverBundle and clientManifest paths.
    const bundleName = key === 'default'
      ? 'vue-ssr-server-bundle.json'
      : `vue-ssr-server-bundle.${key}.json`
    const bundlePath = join(distPath, bundleName)
    const manifestName = key === 'default'
      ? 'vue-ssr-client-manifest.json'
      : `vue-ssr-client-manifest.${key}.json`
    const manifestPath = join(distPath, staticDir, manifestName)

    if (development) {
      // Create an error message for the case when the renderer hasn't been
      // created after the max number of check attempts.
      createRendererErr = new Error(oneLineTrim`
        Renderer was not created after ${rendererCheckAttempts * 100 / 1000}s.
      `)

      // Initialize the mercury-webpack middleware with hooks to update the
      // renderer when webpack-dev-server has re-generated the serverBundle or
      // clientManifest.
      mercuryWebpackMiddlewares[key] = mercuryWebpack({
        ...options,
        serverHook: function webpackServerHook (mfs) {
          serverBundles[key] = JSON.parse(mfs.readFileSync(bundlePath))
          updateRenderer(key)
        },
        clientHook: function webpackClientHook ({ fileSystem }) {
          const manifest = fileSystem.readFileSync(manifestPath)
          clientManifests[key] = JSON.parse(manifest)
          updateRenderer(key)
        }
      })
    } else {
      // If not in development mode, use the pre-built serverBundle and
      // clientManfiest to create the renderer.
      serverBundles[key] = require(bundlePath)
      clientManifests[key] = require(manifestPath)
      updateRenderer(key)
    }
  })

  // Renders a page based on the request context and sends it to the client.
  async function sendPage (req, res, next) {
    // Create the context object used to pass data to the renderer.
    const context = createContext(req, res)

    try {
      // Use the renderer to generate HTML and send it to the client.
      let html = await renderers[req.languageCode].renderToString(context)
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
        if (renderers[req.languageCode]) {
          // If the renderer already exists, go ahead and generate the page and
          // send it in the response.
          sendPage(req, res, next)
        } else {
          // Notify the user that the middleware is waiting for the renderer to
          // be created.
          logger.info('Waiting for the renderer to be created...')

          // Check for the renderer to be defined in 100ms intervals up until
          // the max number of attempts is reached.
          let attempts = 0
          let rendererCheckInterval = setInterval(() => {
            attempts++
            if (renderers[req.languageCode]) {
              clearInterval(rendererCheckInterval)
              sendPage(req, res, next)
            } else if (attempts === rendererCheckAttempts) {
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
    // Default to the single compiler MercuryWebpackMiddleware instance.
    let mercuryWebpackMiddleware = mercuryWebpackMiddlewares['default']

    // If there are multiple supported languages, try to determine the
    // preferred language from the Accept-Language header. If the preferred
    // language is supported, add it (or the default language) to the request so
    // that the matching middleware can be used to serve the request.
    if (supportedLanguages.length > 0) {
      const headerValue = req.headers['accept-language']
      const language = pick(supportedLanguages, headerValue, { loose: true })
      req.languageCode = language || defaultLanguage
      mercuryWebpackMiddleware = mercuryWebpackMiddlewares[req.languageCode]
    }

    if (mercuryWebpackMiddleware) {
      const mercuryVueNext = err => mercuryVueMiddleware(err, req, res, next)
      mercuryWebpackMiddleware(req, res, mercuryVueNext)
    } else {
      mercuryVueMiddleware(null, req, res, next)
    }
  }
}
