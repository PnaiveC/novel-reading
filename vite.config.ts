import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { deliveryFilePlugin, singleFilePlugin } from './build/single-file'

/**
 * 源码入口放在 src/index.html：根目录的 index.html 是构建产物（双击即读的交付文件），
 * 不能拿来当 Vite 入口——否则构建会把产物当成模板，源码再也进不去产物。
 */
const entry = fileURLToPath(new URL('./src/index.html', import.meta.url))

export interface ReaderViteOptions {
  /** 是否把产物抄成根目录的交付文件（构建期测试传 false，免得动工作区） */
  delivery?: boolean
}

/**
 * 一份产物，三份身份（N3）：`src/index.html` 是源码入口，`dist/index.html` 是产物，
 * 根目录的 `index.html` 是交付文件（双击即读）。构建同时产出后两者；
 * 想只要产物（比如测试里现建一份来验），把 delivery 关掉。
 */
export function createReaderViteConfig(options: ReaderViteOptions = {}): UserConfig {
  return {
    base: './',
    plugins: [
      vue(),
      singleFilePlugin(),
      ...(options.delivery === false ? [] : [deliveryFilePlugin()]),
    ],
    server: { open: '/src/index.html' },
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      // 别清空 dist/：那里面可能放着用户手测用的文本（需求文档、样本），
      // 构建只覆盖自己产出的 index.html，不碰别的东西。
      emptyOutDir: false,
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
  }
}

export default defineConfig(createReaderViteConfig())
