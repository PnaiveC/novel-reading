import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { singleFilePlugin } from './build/single-file'

/**
 * 源码入口放在 src/index.html：根目录的 index.html 是构建产物（双击即读的交付文件），
 * 不能拿来当 Vite 入口——否则构建会把产物当成模板，源码再也进不去产物。
 */
const entry = fileURLToPath(new URL('./src/index.html', import.meta.url))

export default defineConfig({
  base: './',
  plugins: [vue(), singleFilePlugin()],
  server: { open: '/src/index.html' },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    // 单文件产物：不拆 chunk、不加载外部模块，file:// 双击即可运行
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: entry,
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
