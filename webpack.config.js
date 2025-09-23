//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
    target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
    mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

    entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: {
        // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        vscode: 'commonjs vscode',
        pdfkit: 'commonjs pdfkit',
        fs: 'commonjs fs',
        sqlite3: 'commonjs sqlite3'
    },
    resolve: {
        // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    },
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: "log", // enables logging required for problem matchers
    },
    // Adicione a seção de plugins aqui, dentro do 'extensionConfig'
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    // Copia a pasta 'data' da biblioteca pdfkit para a pasta 'dist'
                    from: path.join(__dirname, 'node_modules', 'pdfkit', 'js', 'data'),
                    to: path.join(__dirname, 'dist', 'data')
                },
                {
                    // Copia o arquivo binário do sqlite3 para a pasta 'dist'
                    from: path.join(__dirname, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node'),
                    to: path.join(__dirname, 'dist', 'node_sqlite3.node')
                },
                {
                    // Copia o binário também para o local esperado pelo sqlite3
                    from: path.join(__dirname, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node'),
                    to: path.join(__dirname, 'node_modules', 'sqlite3', 'lib', 'binding', 'node_sqlite3.node')
                }
            ],
        }),
    ]
};

module.exports = [extensionConfig];