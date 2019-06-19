const path = require('path')
const VueLoaderPlugin = require('vue-loader/lib/plugin')
const VueClientPlugin = require('../../../client-plugin')

module.exports = {
  entry: ['./entry.js'],
  output: {
    path: path.join(__dirname, '../dist')
  },
  plugins: [
    new VueLoaderPlugin(),
    new VueClientPlugin()
  ],
  module: {
    rules: [
      { test: /\.vue$/, loader: 'vue-loader' }
    ]
  }
}
