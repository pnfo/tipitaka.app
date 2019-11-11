module.exports = {
    entry: "./index.js",
    output: {
        path: __dirname,
        filename: "bundle.js"
    },
    module: {
        rules: [
            {
              test: /\.m?js$/,
              exclude: /(node_modules|bower_components)/,
              use: {
                loader: 'babel-loader'
              }
            }
          ]
    }
};