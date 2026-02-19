import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import legacy from '@vitejs/plugin-legacy'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                convert: resolve(__dirname, 'misc/convert/index.html')
            }
        },
        outDir: 'dist',
        emptyOutDir: true,
        // Ensure minify is not false, as legacy plugin relies on terser
        minify: 'terser',
    },
    server: {
        port: 5155,
        open: '/index.html', // Open main entry by default
        proxy: {
            '/tipitaka-query': {
                target: 'http://localhost:8402',
                changeOrigin: true,
                secure: false,
            }
        },
    },
    plugins: [
        legacy({
            // Android 7.0 ships with Chrome 51
            targets: ['chrome >= 51', 'android >= 7'],

            // Essential for async/await in older browsers
            additionalLegacyPolyfills: ['regenerator-runtime/runtime'],

            // Forces the legacy chunks to render even if the browser "thinks" it supports modules
            renderLegacyChunks: true,
        }),
    ],
});
