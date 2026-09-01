import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexHtml = resolve(process.cwd(), 'dist', 'index.html')

describe('打包产物', () => {
  it.skipIf(!existsSync(indexHtml))('index.html 使用相对资源路径，file:// 下可正常加载', () => {
    const html = readFileSync(indexHtml, 'utf-8')
    expect(html).toMatch(/src="\.\/assets\//)
    expect(html).toMatch(/href="\.\/assets\//)
  })
})
