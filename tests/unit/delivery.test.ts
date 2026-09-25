// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DELIVERY_FILE, findExternalRefs } from '../../build/single-file'
import { readStamp, sourceStamp } from '../../build/source-stamp'
import { createReaderViteConfig } from '../../vite.config'

/**
 * N3：交付链「一个产物，三份身份」的守卫。
 *
 * 关键是产物在这里**现建**：用真配置、只关掉「抄交付文件」那一步，输出到临时目录。
 * 于是这组用例既不会因为「没先跑 build」而静默跳过（以前是 skipIf(!existsSync(dist))），
 * 又能顺手把「根目录那份交付文件落后了」抓出来。
 */
const projectRoot = process.cwd()

let workDir = ''
let artifact = ''

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function boot(html: string, beforeParse?: (window: JSDOM['window']) => void): JSDOM {
  return new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole().on('jsdomError', (error) => {
      console.error('[jsdom]', error.message)
    }),
    ...(beforeParse ? { beforeParse } : {}),
  })
}

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'novel-reading-delivery-'))
  const config = createReaderViteConfig({ delivery: false })
  // vitest 把 NODE_ENV 设成 test；构建要按产物模式来，否则打进 dev 版 Vue（体积和 scopeId 都不一样）
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({
      ...config,
      configFile: false,
      root: projectRoot,
      mode: 'production',
      logLevel: 'silent',
      build: { ...config.build, outDir: workDir, emptyOutDir: true },
    })
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
  artifact = readFileSync(join(workDir, DELIVERY_FILE), 'utf8')
}, 120_000)

afterAll(() => {
  // 只删自己刚建出来的那个临时目录（确认它还在系统临时目录下）
  if (workDir && workDir.startsWith(tmpdir())) rmSync(workDir, { recursive: true, force: true })
})

describe('交付链：一个产物，三份身份（N3）', () => {
  it('产物自包含：没有外部引用，也带着挂载点', () => {
    expect(findExternalRefs(artifact)).toEqual([])
    expect(artifact).toContain('<div id="app">')
    expect(artifact.length).toBeGreaterThan(1000)
  })

  it('产物能冷启动：渲染出「拖进来 / 选文件」入口', async () => {
    const dom = boot(artifact)
    await wait(400)

    const app = dom.window.document.querySelector('#app')
    expect(app?.textContent ?? '').toContain('把 TXT 小说拖进来')
    expect(app?.querySelectorAll('button').length).toBeGreaterThan(0)
    dom.window.close()
  })

  it('本机有书时直接进正文，目录能打开（B3）', async () => {
    const stored = {
      id: 'dist-book',
      name: '演示.txt',
      size: 40,
      encoding: 'utf-8',
      text: '第一章 初见\n正文一。\n\n第二章 重逢\n正文二。',
      addedAt: 1,
      lastOpenedAt: 2,
    }
    // file:// 下浏览器不给 IndexedDB，产物会退回 localStorage，这里就走这条路
    const dom = boot(artifact, (window) => {
      window.localStorage.setItem('novel-reading:lastBookId', stored.id)
      window.localStorage.setItem(`novel-reading:book:${stored.id}`, JSON.stringify(stored))
    })
    await wait(400)

    const doc = dom.window.document
    expect(doc.querySelector('.chapter-name')?.textContent).toBe('第一章 初见')
    // C4 连读：第一章后面紧接着渲染第二章
    expect(doc.querySelectorAll('.chapter-title')[0]?.textContent).toBe('第一章 初见')
    expect(doc.querySelectorAll('.chapter-title')[1]?.textContent).toBe('第二章 重逢')
    expect(doc.querySelectorAll('.para')).toHaveLength(2)
    expect(doc.documentElement.dataset.theme).toBe('light')

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

  it('刚构建的产物带着这份源码的指纹', () => {
    expect(readStamp(artifact)).toBe(sourceStamp(projectRoot))
  })

  it('根目录那份交付文件就是这份源码构建的', () => {
    const delivered = readStamp(readFileSync(join(projectRoot, DELIVERY_FILE), 'utf8'))
    const current = sourceStamp(projectRoot)
    expect(
      delivered,
      `根目录的 ${DELIVERY_FILE} 记的源码指纹（${delivered ?? '没找到'}）跟现在这份源码（${current}）对不上：` +
        '先跑 npm run build。它是双击即读的交付文件，曾经就是它悄悄落后了（事故见 c1fea72）',
    ).toBe(current)
  })
})
