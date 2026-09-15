import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import App from '../../src/App.vue'
import { computeBookId } from '../../src/core/book'
import { createLibrary, type StoredBook } from '../../src/core/library'
import { clearStorage, loadSettings, loadProgress } from '../../src/core/storage'
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
