import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  plugins: [vue(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
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
    target: ['es2021', 'chrome100', 'safari13'],
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
