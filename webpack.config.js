const path = require('path');

module.exports = {
  entry: './src/RemoteDVR.js',
  output: {
    library: 'remoteDvr',
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  optimization: {
    minimize: true
  },
  devServer: {
    contentBase: path.join(__dirname, ''),
    compress: true,
    port: 9000
  }
};

module.rules = [
  ]
