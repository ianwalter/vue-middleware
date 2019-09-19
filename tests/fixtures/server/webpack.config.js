const path = require('path')
const VueLoaderPlugin = require('vue-loader/lib/plugin')
const VueServerPlugin = require('../../../server-plugin')

module.exports = {
  entry: ['./entry.js'],
  target: 'node',
  output: {
    path: path.join(__dirname, '../dist'),
    libraryTarget: 'commonjs2'
  },
  plugins: [
    new VueLoaderPlugin(),
    new VueServerPlugin()
  ],
  module: {
    rules: [
      { test: /\.vue$/, loader: 'vue-loader' }
    ]
  }
}
