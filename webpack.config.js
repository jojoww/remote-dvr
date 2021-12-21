const path = require('path');

module.exports = {
  entry: './src/RemoteDVR.ts',
  output: {
    library: 'remotedvrlib',
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
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: [".ts", ".tsx", ".js"]
  },
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      { test: /\.tsx?$/, loader: "ts-loader" }
    ]
  }
};