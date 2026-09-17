import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import App from '../../src/App.vue'
import { computeBookId } from '../../src/core/book'
import { createLibrary, type StoredBook } from '../../src/core/library'
import {
  clearStorage,
  loadBookmarks,
  loadProgress,
  loadSettings,
  loadShortcuts,
  loadUiPrefs,
} from '../../src/core/storage'
import { memoryStorage } from '../helpers/fakes'

const encoder = new TextEncoder()

const TOC_NOVEL = [
  '第一章 初见',
  '正文一。',
  '',
  '第二章 重逢',
  '正文二。',
  '',
  '第三章 远行',
  '正文三。',
  '',
  '第四章 归途',
  '正文四。',
  '',
  '第五章 结尾',
  '正文五。',
].join('\n')

async function mountApp(text = TOC_NOVEL): Promise<VueWrapper> {
  const bytes = encoder.encode(text)
  const stored: StoredBook = {
    id: 'hash-ui',
    name: '长篇.txt',
    size: bytes.length,
    encoding: 'utf-8',
    text,
    bytes,
    addedAt: 1,
    lastOpenedAt: 2,
  }
  const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
  await library.saveBook(stored)
  await library.setLastBook(stored.id)
  const wrapper = mount(App, { props: { library } })
  await flushPromises()
  return wrapper
}

function buttonByText(wrapper: VueWrapper, label: string): DOMWrapper<HTMLButtonElement> {
  const found = wrapper.findAll('button').find((button) => button.text() === label)
  if (!found) throw new Error(`找不到按钮：${label}`)
  return found as DOMWrapper<HTMLButtonElement>
}

function rootStyle(wrapper: VueWrapper): CSSStyleDeclaration {
  return (wrapper.find('.app').element as HTMLElement).style
}

async function pressKey(key: string): Promise<void> {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
  await flushPromises()
}

/** 改键录制时用：从 body 派发，事件才会走「window 捕获 → body」这条路 */
async function pressKeyOnBody(key: string): Promise<void> {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  await flushPromises()
}

beforeEach(() => {
  clearStorage()
})

describe('目录（B3）', () => {
  it('列出全部章节、当前章高亮，点第 3 章直接到位', async () => {
    const wrapper = await mountApp()
    expect(wrapper.find('.toc').exists()).toBe(false)

    await buttonByText(wrapper, '目录').trigger('click')
    const items = wrapper.findAll('.toc-item')
    expect(items).toHaveLength(5)
    expect(items[0].classes()).toContain('active')
    expect(items[2].text()).toContain('第三章 远行')

    await items[2].trigger('click')
    expect(wrapper.find('.chapter-name').text()).toBe('第三章 远行')
    expect(wrapper.findAll('.toc-item')[2].classes()).toContain('active')
    expect(wrapper.find('.pos').text()).toMatch(/^第 3\/5 章 · 全书 \d+%$/)
  })

  it('Esc 收起目录', async () => {
    const wrapper = await mountApp()
    await buttonByText(wrapper, '目录').trigger('click')
    expect(wrapper.find('.toc').exists()).toBe(true)
    await pressKey('Escape')
    expect(wrapper.find('.toc').exists()).toBe(false)
  })
})

describe('导航（B5）', () => {
  it('← / → 翻章，读完一章不用离开键盘', async () => {
    const wrapper = await mountApp()
    await pressKey('ArrowRight')
    expect(wrapper.find('.chapter-name').text()).toBe('第二章 重逢')
    await pressKey('ArrowRight')
    expect(wrapper.find('.chapter-name').text()).toBe('第三章 远行')
    await pressKey('ArrowLeft')
    expect(wrapper.find('.chapter-name').text()).toBe('第二章 重逢')
  })

  it('空格 / PageDown / PageUp / Home / End 都不报错，也不改变章节', async () => {
    const wrapper = await mountApp()
    for (const key of [' ', 'PageDown', 'PageUp', 'Home', 'End']) {
      await pressKey(key)
    }
    expect(wrapper.find('.chapter-name').text()).toBe('第一章 初见')
  })

  it('首尾不越界', async () => {
    const wrapper = await mountApp()
    await pressKey('ArrowLeft')
    expect(wrapper.find('.chapter-name').text()).toBe('第一章 初见')
    for (let i = 0; i < 8; i++) await pressKey('ArrowRight')
    expect(wrapper.find('.chapter-name').text()).toBe('第五章 结尾')
    expect(wrapper.find('.pos').text()).toBe('第 5/5 章 · 全书 100%')
  })
})

describe('排版（B4）', () => {
  it('拖字号滑块：正文 CSS 变量与本地设置同时更新', async () => {
    const wrapper = await mountApp()
    await buttonByText(wrapper, '排版').trigger('click')

    const fontSize = wrapper.findAll('.panel input[type="range"]')[0]
    expect(fontSize.attributes('max')).toBe('30')
    ;(fontSize.element as HTMLInputElement).value = '22'
    await fontSize.trigger('input')

    expect(rootStyle(wrapper).getPropertyValue('--reader-size')).toBe('22px')
    expect(loadSettings()?.fontSize).toBe(22)
  })

  it('字体 / 缩进 / 行距 / 页宽 / 段间距都能改并落盘', async () => {
    const wrapper = await mountApp()
    await buttonByText(wrapper, '排版').trigger('click')

    const selects = wrapper.findAll('.panel select')
    ;(selects[0].element as HTMLSelectElement).value = 'hei'
    await selects[0].trigger('change')
    ;(selects[1].element as HTMLSelectElement).value = '0'
    await selects[1].trigger('change')

    const ranges = wrapper.findAll('.panel input[type="range"]')
    for (const [index, value] of [
      [1, '2.2'],
      [2, '48'],
      [3, '1.2'],
    ] as const) {
      ;(ranges[index].element as HTMLInputElement).value = value
      await ranges[index].trigger('input')
    }

    const style = rootStyle(wrapper)
    expect(style.getPropertyValue('--reader-line')).toBe('2.2')
    expect(style.getPropertyValue('--reader-width')).toBe('48em')
    expect(style.getPropertyValue('--reader-para-gap')).toBe('1.2em')
    expect(style.getPropertyValue('--reader-indent')).toBe('0em')
    expect(style.getPropertyValue('--reader-font')).toContain('YaHei')
    expect(loadSettings()).toMatchObject({
      lineHeight: 2.2,
      maxWidth: 48,
      paragraphSpacing: 1.2,
      indent: 0,
      fontFamily: 'hei',
    })
  })

  it('恢复默认把设置放回初始值', async () => {
    const wrapper = await mountApp()
    await buttonByText(wrapper, '排版').trigger('click')
    const ranges = wrapper.findAll('.panel input[type="range"]')
    ;(ranges[0].element as HTMLInputElement).value = '28'
    await ranges[0].trigger('input')
    expect(loadSettings()?.fontSize).toBe(28)

    await buttonByText(wrapper, '恢复默认').trigger('click')
    expect(loadSettings()?.fontSize).toBe(18)
    expect(rootStyle(wrapper).getPropertyValue('--reader-size')).toBe('18px')
  })
})

describe('编码切换接进界面（B1）', () => {
  it('在排版面板里换编码，正文跟着重解码，位置仍记在原处', async () => {
    const wrapper = await mountApp()
    const bookId = computeBookId(encoder.encode(TOC_NOVEL))
    await pressKey('ArrowRight')
    expect(wrapper.find('.chapter-name').text()).toBe('第二章 重逢')

    await buttonByText(wrapper, '排版').trigger('click')

    const encodingSelect = wrapper.findAll('.panel select')[2]
    expect(encodingSelect.attributes('disabled')).toBeUndefined()
    ;(encodingSelect.element as HTMLSelectElement).value = 'gbk'
    await encodingSelect.trigger('change')
    await flushPromises()

    expect(wrapper.find('.para').text()).not.toBe('正文二。')
    expect(loadProgress(bookId)?.chapterIndex).toBe(1)

    // 换回正确编码：回到第二章，位置没丢（B1 的验收点）
    ;(encodingSelect.element as HTMLSelectElement).value = 'utf-8'
    await encodingSelect.trigger('change')
    await flushPromises()
    expect(wrapper.find('.chapter-name').text()).toBe('第二章 重逢')
  })

  it('没有原始字节的老缓存：编码下拉框禁用并说明原因', async () => {
    const bytes = encoder.encode(TOC_NOVEL)
    const stored: StoredBook = {
      id: 'hash-cached',
      name: '老缓存.txt',
      size: bytes.length,
      encoding: 'utf-8',
      text: TOC_NOVEL,
      addedAt: 1,
      lastOpenedAt: 2,
    }
    const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
    await library.saveBook(stored)
    await library.setLastBook(stored.id)
    const wrapper = mount(App, { props: { library } })
    await flushPromises()

    await buttonByText(wrapper, '排版').trigger('click')
    const encodingSelect = wrapper.findAll('.panel select')[2]
    expect(encodingSelect.attributes('disabled')).toBeDefined()
    expect(wrapper.find('.panel .hint').text()).toContain('重新拖入原文件')
  })
})

describe('主题（C1）', () => {
  it('默认日间；换夜间 / 护眼 / 跟随系统都落到 html 上并落盘', async () => {
    const wrapper = await mountApp()
    expect(document.documentElement.dataset.theme).toBe('light')

    await buttonByText(wrapper, '排版').trigger('click')
    const theme = wrapper.findAll('.panel select')[3]

    ;(theme.element as HTMLSelectElement).value = 'dark'
    await theme.trigger('change')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(loadSettings()?.theme).toBe('dark')

    ;(theme.element as HTMLSelectElement).value = 'sepia'
    await theme.trigger('change')
    expect(document.documentElement.dataset.theme).toBe('sepia')

    ;(theme.element as HTMLSelectElement).value = 'auto'
    await theme.trigger('change')
    // jsdom 没有 matchMedia，「跟随系统」按浅色算，不该炸
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(loadSettings()?.theme).toBe('auto')
  })

  it('T 键循环主题，不动正文', async () => {
    const wrapper = await mountApp()
    await pressKey('t')
    expect(document.documentElement.dataset.theme).toBe('sepia')
    expect(wrapper.find('.chapter-name').text()).toBe('第一章 初见')
    await pressKey('t')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('沉浸模式（C2）', () => {
  it('M 键开沉浸：工具栏收起，鼠标靠顶 / 靠底才露出来；Esc 退出', async () => {
    const wrapper = await mountApp()
    await pressKey('m')

    expect(loadUiPrefs().immersive).toBe(true)
    expect(wrapper.find('.app').classes()).toContain('immersive')
    expect(wrapper.find('.bar').classes()).toContain('hidden')
    expect(wrapper.find('.status').classes()).toContain('hidden')

    await wrapper.find('.app').trigger('mousemove', { clientY: 12 })
    expect(wrapper.find('.bar').classes()).not.toContain('hidden')
    expect(wrapper.find('.status').classes()).toContain('hidden')

    await wrapper.find('.app').trigger('mousemove', { clientY: window.innerHeight - 10 })
    expect(wrapper.find('.status').classes()).not.toContain('hidden')

    await wrapper.find('.app').trigger('mouseleave')
    expect(wrapper.find('.bar').classes()).toContain('hidden')
    expect(wrapper.find('.status').classes()).toContain('hidden')

    await pressKey('Escape')
    expect(loadUiPrefs().immersive).toBe(false)
    expect(wrapper.find('.app').classes()).not.toContain('immersive')
  })
})

describe('快捷键（C3）', () => {
  it('默认键位：d 目录、w 排版、b 书签、r 最近，再按一次收起', async () => {
    const wrapper = await mountApp()

    await pressKey('d')
    expect(wrapper.find('.toc').exists()).toBe(true)
    await pressKey('d')
    expect(wrapper.find('.toc').exists()).toBe(false)

    await pressKey('w')
    expect(wrapper.find('.panel').exists()).toBe(true)
    await pressKey('Escape')
    expect(wrapper.find('.panel').exists()).toBe(false)

    await pressKey('b')
    expect(wrapper.find('.bookmarks').exists()).toBe(true)
    await pressKey('Escape')

    await pressKey('r')
    await flushPromises()
    expect(wrapper.find('.recent').exists()).toBe(true)
  })

  it('自己改键：录一个新键，旧键失效、新键生效；撞键被拒绝；能恢复默认', async () => {
    const wrapper = await mountApp()
    await pressKey('w')
    await buttonByText(wrapper, '快捷键').trigger('click')
    expect(wrapper.find('.shortcuts').exists()).toBe(true)

    const tocRow = wrapper.findAll('.shortcuts .row').find((row) => row.text().includes('目录'))!
    await tocRow.find('.set').trigger('click')
    await pressKeyOnBody('k')
    expect(loadShortcuts().toc).toEqual(['k'])
    expect(wrapper.find('.shortcuts .message').text()).toContain('目录')

    // w 是「排版与设置」的键，改键撞上要被拒绝
    await tocRow.find('.set').trigger('click')
    await pressKeyOnBody('w')
    expect(loadShortcuts().toc).toEqual(['k'])
    expect(wrapper.find('.shortcuts .message').text()).toContain('排版与设置')

    await wrapper.findAll('.shortcuts button').find((item) => item.text() === '恢复默认')!.trigger('click')
    expect(loadShortcuts().toc).toEqual(['d'])

    await pressKey('Escape')
    await pressKey('d')
    expect(wrapper.find('.toc').exists()).toBe(true)
  })
})

describe('连续阅读（C4）', () => {
  it('正文里连着渲染下一章，滚动条一路往下就接上了', async () => {
    const wrapper = await mountApp()
    const sections = wrapper.findAll('[data-chapter]')
    expect(sections.length).toBeGreaterThan(1)
    expect(sections[0].find('.chapter-title').text()).toBe('第一章 初见')
    expect(sections[1].find('.chapter-title').text()).toBe('第二章 重逢')
    expect(sections[1].find('.para').text()).toBe('正文二。')
  })

  it('翻到下一章时窗口跟着往后长，当前章高亮与位置提示同步', async () => {
    const wrapper = await mountApp()
    await pressKey('ArrowRight')
    await pressKey('ArrowRight')
    expect(wrapper.find('.chapter-name').text()).toBe('第三章 远行')
    expect(wrapper.findAll('[data-chapter="3"]').length).toBe(1)
    expect(wrapper.find('.pos').text()).toMatch(/^第 3\/5 章 · 全书 \d+%$/)
  })
})

describe('最近打开列表（C5）', () => {
  const OTHER_NOVEL = ['第一章 另一本', '别的正文。', '', '第二章 结束', '收尾。'].join('\n')

  async function mountTwoBooks() {
    const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
    const bytesA = encoder.encode(TOC_NOVEL)
    const bytesB = encoder.encode(OTHER_NOVEL)
    const idA = computeBookId(bytesA)
    const idB = computeBookId(bytesB)
    const books: StoredBook[] = [
      {
        id: idA,
        name: '长篇.txt',
        size: bytesA.length,
        encoding: 'utf-8',
        text: TOC_NOVEL,
        bytes: bytesA,
        addedAt: 1,
        lastOpenedAt: 1,
      },
      {
        id: idB,
        name: '另一本.txt',
        size: bytesB.length,
        encoding: 'utf-8',
        text: OTHER_NOVEL,
        bytes: bytesB,
        addedAt: 2,
        lastOpenedAt: 2,
      },
    ]
    for (const book of books) await library.saveBook(book)
    await library.setLastBook(idA)
    const wrapper = mount(App, { props: { library } })
    await flushPromises()
    return { wrapper, library, idA, idB }
  }

  function rowOf(wrapper: VueWrapper, name: string): DOMWrapper<HTMLElement> {
    const row = wrapper.findAll('.recent .row').find((item) => item.text().includes(name))
    if (!row) throw new Error(`最近列表里没有 ${name}`)
    return row as DOMWrapper<HTMLElement>
  }

  it('列出本机的书与进度，点一本就切过去，各自的位置都不丢', async () => {
    const { wrapper } = await mountTwoBooks()
    await pressKey('ArrowRight')

    await pressKey('r')
    await flushPromises()
    expect(wrapper.findAll('.recent .row')).toHaveLength(2)
    expect(rowOf(wrapper, '长篇.txt').text()).toContain('第 2/5 章')
    expect(rowOf(wrapper, '长篇.txt').text()).toContain('在读')

    await rowOf(wrapper, '另一本.txt').find('.open').trigger('click')
    await flushPromises()
    expect(wrapper.find('.book-name').text()).toBe('另一本.txt')
    expect(wrapper.find('.chapter-name').text()).toBe('第一章 另一本')
    expect(wrapper.find('.recent').exists()).toBe(false)

    await pressKey('r')
    await flushPromises()
    expect(rowOf(wrapper, '另一本.txt').text()).toContain('在读')
    expect(rowOf(wrapper, '长篇.txt').text()).toContain('第 2/5 章')
  })

  it('删掉一本：本机记录没了，当前在读的那本删了也不打断这次阅读', async () => {
    const { wrapper, library, idA, idB } = await mountTwoBooks()
    await pressKey('r')
    await flushPromises()

    await rowOf(wrapper, '另一本.txt').find('.del').trigger('click')
    await flushPromises()
    expect(await library.getBook(idB)).toBeNull()
    expect(rowOf(wrapper, '长篇.txt').text()).toContain('长篇.txt')
    expect(wrapper.findAll('.recent .row')).toHaveLength(1)

    await rowOf(wrapper, '长篇.txt').find('.del').trigger('click')
    await flushPromises()
    expect(await library.listBooks()).toEqual([])
    expect(await library.getBook(idA)).toBeNull()
    expect(wrapper.find('.chapter-name').text()).toBe('第一章 初见')
    expect(wrapper.find('.status').text()).toContain('已从本机删掉')
  })
})

describe('书签（C7）', () => {
  it('A 加书签并落盘，书签列表点一条跳回去，也能删掉', async () => {
    const wrapper = await mountApp()
    const bookId = computeBookId(encoder.encode(TOC_NOVEL))

    await pressKey('ArrowRight')
    await pressKey('a')
    expect(loadBookmarks(bookId)).toHaveLength(1)
    expect(loadBookmarks(bookId)[0]?.chapterTitle).toBe('第二章 重逢')
    expect(loadBookmarks(bookId)[0]?.excerpt).toBe('正文二。')
    expect(wrapper.find('.status').text()).toContain('已加书签')

    await pressKey('ArrowRight')
    expect(wrapper.find('.chapter-name').text()).toBe('第三章 远行')

    await pressKey('b')
    expect(wrapper.find('.bookmarks').exists()).toBe(true)
    expect(wrapper.find('.bookmarks .row').text()).toContain('第二章 重逢')

    await wrapper.find('.bookmarks .row .open').trigger('click')
    expect(wrapper.find('.chapter-name').text()).toBe('第二章 重逢')
    expect(wrapper.find('.bookmarks').exists()).toBe(false)

    await pressKey('b')
    await wrapper.find('.bookmarks .row .del').trigger('click')
    expect(loadBookmarks(bookId)).toEqual([])
    expect(wrapper.find('.bookmarks .empty').text()).toContain('还没有书签')
  })

  it('换一本书不串书签：各是各的', async () => {
    await mountApp()
    const bookId = computeBookId(encoder.encode(TOC_NOVEL))
    await pressKey('a')
    expect(loadBookmarks(bookId)).toHaveLength(1)
    expect(loadBookmarks('hash-other')).toEqual([])
  })
})
