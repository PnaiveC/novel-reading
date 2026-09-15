import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'

const distHtml = join(process.cwd(), 'dist', 'index.html')

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

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
    await wait(400)

    const app = dom.window.document.querySelector('#app')
    expect(app?.textContent ?? '').toContain('把 TXT 小说拖进来')
    expect(app?.querySelectorAll('button').length).toBeGreaterThan(0)
    dom.window.close()
  })

  it.skipIf(!existsSync(distHtml))('本机有书时直接进正文，目录能打开（B3）', async () => {
    const stored = {
      id: 'dist-book',
      name: '演示.txt',
      size: 40,
      encoding: 'utf-8',
      text: '第一章 初见\n正文一。\n\n第二章 重逢\n正文二。',
      addedAt: 1,
      lastOpenedAt: 2,
    }
    const html = readFileSync(distHtml, 'utf8')
    // file:// 下浏览器不给 IndexedDB，产物会退回 localStorage，这里就走这条路
    const dom = new JSDOM(html, {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: new VirtualConsole().on('jsdomError', (error) => {
        console.error('[jsdom]', error.message)
      }),
      beforeParse: (window) => {
        window.localStorage.setItem('novel-reading:lastBookId', stored.id)
        window.localStorage.setItem(`novel-reading:book:${stored.id}`, JSON.stringify(stored))
      },
    })
    await wait(400)

    const doc = dom.window.document
    expect(doc.querySelector('.chapter-name')?.textContent).toBe('第一章 初见')
    expect(doc.querySelectorAll('.para')).toHaveLength(1)

    const tocButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '目录',
    )
    tocButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    await wait(50)

    const items = doc.querySelectorAll('.toc-item')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('第一章 初见')
    expect(items[1].textContent).toContain('第二章 重逢')
    dom.window.close()
  })
})
