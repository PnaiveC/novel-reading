import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../../src/App.vue'
import { createLibrary, type StoredBook } from '../../src/core/library'
import { memoryStorage } from '../helpers/fakes'

const story: StoredBook = {
  id: 'hash-1',
  name: 'novel.txt',
  size: 20,
  encoding: 'utf-8',
  text: '第一章 初见\n正文一。\n正文二。',
  addedAt: 1,
  lastOpenedAt: 2,
}

async function mountApp(stored: StoredBook | null) {
  const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
  if (stored) {
    await library.saveBook(stored)
    await library.setLastBook(stored.id)
  }
  const wrapper = mount(App, { props: { library } })
  await flushPromises()
  return wrapper
}

describe('App 外壳', () => {
  it('没有本地书时给出「拖进来 / 选文件」入口', async () => {
    const wrapper = await mountApp(null)
    expect(wrapper.text()).toContain('把 TXT 小说拖进来')
    expect(wrapper.text()).toContain('选择文件')
  })

  it('有本地书时直接进正文', async () => {
    const wrapper = await mountApp(story)
    expect(wrapper.text()).toContain('第一章 初见')
    expect(wrapper.text()).toContain('正文一。')
    expect(wrapper.text()).toContain('第 1/1 章')
  })
})
