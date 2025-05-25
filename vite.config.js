import { defineConfig } from 'vite'
import tslOperatorPlugin from 'vite-plugin-tsl-operator'
import plainText from 'vite-plugin-plain-text';

export default defineConfig({
    base: './',
    assetsInclude: ['**/*.hdr', '**/*.glb', '**/*.obj'],
    server: {
        port: 1234,
    },
    plugins: [
        tslOperatorPlugin({logs:false}),
        plainText(
            { namedExport: false },
        ),
    ]
});