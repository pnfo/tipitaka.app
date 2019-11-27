module.exports = {
    entry: ["@babel/polyfill", "./scripts/index.js"],
    output: {
        path: __dirname + "/static/scripts",
        filename: "webpack-bundle.js"
    },
    module: {
        rules: [
            {
              test: /\.m?js$/,
              exclude: /(node_modules|bower_components)/,
              use: {
                loader: 'babel-loader',
                options: {
                    presets: [
                        [
                          '@babel/preset-env', {
                            "targets": {
                              "node": "current",
                              "chrome": 30
                            },
                            loose: true, 
                            modules: false
                          }
                        ]
                    ],
                    sourceType: 'unambiguous',
                    plugins: ["@babel/plugin-transform-spread"]
                }
              }
            }
          ]
    },
    mode: 'production'
};