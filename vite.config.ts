import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { singleFilePlugin } from './build/single-file'

export default defineConfig({
  base: './',
  plugins: [vue(), singleFilePlugin()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    // 单文件产物：不拆 chunk、不加载外部模块，file:// 双击即可运行
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
