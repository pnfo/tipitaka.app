module.exports = {
    entry: "./scripts/index.js",
    output: {
        path: __dirname + "/scripts",
        filename: "bundle.js"
    },
    module: {
        rules: [
            {
              test: /\.js$/,
              exclude: /(node_modules|bower_components)/,
              use: {
                loader: 'babel-loader'
              }
            }
          ]
    },
    mode: 'production'
};