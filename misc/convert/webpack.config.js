module.exports = {
    entry: ["@babel/polyfill", "./index.js"],
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
    }
};