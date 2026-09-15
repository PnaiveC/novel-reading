import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'

const distHtml = join(process.cwd(), 'dist', 'index.html')

/**
 * A1 的“断网双击可用”用 jsdom 空跑一遍产物：
 * 只加载这一个文件（不解析任何外链），界面能自己起来就算过。
 */
describe('单文件产物能自启动（先跑 npm run build）', () => {
  it.skipIf(!existsSync(distHtml))('冷启动渲染出打开入口', async () => {
    const dom = new JSDOM(readFileSync(distHtml, 'utf8'), {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: new VirtualConsole().on('jsdomError', (error) => {
        console.error('[jsdom]', error.message)
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 400))

    const app = dom.window.document.querySelector('#app')
    expect(app?.textContent ?? '').toContain('把 TXT 小说拖进来')
    expect(app?.querySelectorAll('button').length).toBeGreaterThan(0)
    dom.window.close()
  })
})
