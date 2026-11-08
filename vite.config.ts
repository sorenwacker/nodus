import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  plugins: [vue(), wasm()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // The docs site and the Rust build are not app sources; watching them
      // reloads the running app every time documentation is rebuilt
      ignored: ['**/docs/**', '**/src-tauri/target/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  optimizeDeps: {
    include: [
      'd3-force',
      'd3-timer',
      'd3-dispatch',
      'd3-quadtree',
      'd3-color',
      'd3-interpolate',
      'd3-transition',
      'd3-selection',
      'd3-scale',
      'd3-scale-chromatic',
      'd3',
    ],
    exclude: [
      '@myriaddreamin/typst.ts',
      '@myriaddreamin/typst-ts-renderer',
      '@myriaddreamin/typst-ts-web-compiler',
    ],
  },
  build: {
    // Top-level await (used by the wasm modules) needs Safari 15 / macOS 10.15+
    target: ['es2022', 'chrome100', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    commonjsOptions: {
      include: [/d3-.*/, /node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'd3': ['d3', 'd3-color', 'd3-interpolate', 'd3-transition', 'd3-selection', 'd3-scale', 'd3-scale-chromatic'],
        },
      },
    },
  },
})
