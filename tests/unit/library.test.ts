import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  createLibrary,
  parseStoredBook,
  serializeBook,
  StorageFullError,
  type StoredBook,
} from '../../src/core/library'

function makeBook(id: string): StoredBook {
  return {
    id,
    name: `${id}.txt`,
    size: 12,
    encoding: 'utf-8',
    text: `第一章\n正文 ${id}`,
    addedAt: 1,
    lastOpenedAt: 2,
  }
}

/** 模拟浏览器拒绝 IndexedDB（file:// 下真的会这样） */
function deniedIndexedDb(): IDBFactory {
  return {
    open() {
      const request = {
        onerror: null,
        error: new Error('SecurityError'),
      } as unknown as IDBOpenDBRequest
      request.onerror = () => undefined
      setTimeout(() => request.onerror?.(new Event('error')), 0)
      return request
    },
  } as unknown as IDBFactory
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('createLibrary（IndexedDB 后端）', () => {
  it('存书、按 id 读回、记住上次那本', async () => {
    const library = createLibrary({ indexedDb: new IDBFactory() })
    const book = makeBook('a')
    await library.saveBook(book)
    await library.setLastBook(book.id)

    expect(await library.getBook('a')).toMatchObject({ id: 'a', text: book.text })
    expect(await library.getBook('missing')).toBeNull()
    expect((await library.getLastBook())?.id).toBe('a')
  })

  it('没存过书时没有「上次那本」', async () => {
    const library = createLibrary({ indexedDb: new IDBFactory() })
    expect(await library.getLastBook()).toBeNull()
  })

  it('lastBook 指向已不存在的书时返回 null，不抛异常', async () => {
    const library = createLibrary({ indexedDb: new IDBFactory() })
    await library.setLastBook('ghost')
    expect(await library.getLastBook()).toBeNull()
  })

  it('同一本书重复保存只留最新正文', async () => {
    const library = createLibrary({ indexedDb: new IDBFactory() })
    await library.saveBook(makeBook('a'))
    await library.saveBook({ ...makeBook('a'), lastOpenedAt: 9 })
    expect((await library.getBook('a'))?.lastOpenedAt).toBe(9)
  })

  it('原始字节（B1 手动切编码要用）一起存下来', async () => {
    const library = createLibrary({ indexedDb: new IDBFactory() })
    const bytes = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0x0a])
    await library.saveBook({ ...makeBook('a'), bytes, encoding: 'gbk', encodingLocked: true })
    const stored = await library.getBook('a')
    expect(Array.from(stored?.bytes ?? [])).toEqual(Array.from(bytes))
    expect(stored?.encodingLocked).toBe(true)
  })
})

describe('createLibrary（localStorage 兜底）', () => {
  it('显式关掉 IndexedDB 时走 localStorage', async () => {
    const library = createLibrary({ indexedDb: null, storage: window.localStorage })
    const book = makeBook('b')
    await library.saveBook(book)
    await library.setLastBook(book.id)
    expect(window.localStorage.getItem('novel-reading:lastBookId')).toBe('b')
    expect((await library.getLastBook())?.text).toBe(book.text)
  })

  it('IndexedDB 被拒时自动退回 localStorage', async () => {
    const library = createLibrary({ indexedDb: deniedIndexedDb(), storage: window.localStorage })
    const book = makeBook('c')
    await library.saveBook(book)
    await library.setLastBook(book.id)
    expect((await library.getBook('c'))?.name).toBe('c.txt')
    expect((await library.getLastBook())?.id).toBe('c')
  })

  it('兜底存储里坏数据当作没有', async () => {
    window.localStorage.setItem('novel-reading:book:bad', '{不是 JSON')
    const library = createLibrary({ indexedDb: null, storage: window.localStorage })
    expect(await library.getBook('bad')).toBeNull()
  })

  it('配额满时抛 StorageFullError，界面上给得出人话', async () => {
    const full: Storage = {
      length: 0,
      clear: () => undefined,
      key: () => null,
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const library = createLibrary({ indexedDb: null, storage: full })
    await expect(library.saveBook(makeBook('d'))).rejects.toBeInstanceOf(StorageFullError)
  })

  it('字节存不下时退一步只存正文，至少还认得出这本书', async () => {
    const limit = 400
    const tight: Storage = {
      length: 0,
      clear: () => undefined,
      key: () => null,
      getItem: (key) => window.localStorage.getItem(key),
      removeItem: (key) => window.localStorage.removeItem(key),
      setItem: (key, value) => {
        if (value.length > limit) throw new Error('QuotaExceededError')
        window.localStorage.setItem(key, value)
      },
    }
    const library = createLibrary({ indexedDb: null, storage: tight })
    const book = makeBook('big')
    await library.saveBook({ ...book, bytes: new Uint8Array(900).fill(7) })

    const stored = await library.getBook('big')
    expect(stored?.text).toBe(book.text)
    expect(stored?.bytes).toBeUndefined()
  })
})

describe('serializeBook / parseStoredBook', () => {
  it('字节转 base64 再转回来一模一样', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x00, 0xff])
    const raw = serializeBook({ ...makeBook('x'), bytes })
    expect(raw).toContain('bytesBase64')
    expect(Array.from(parseStoredBook(raw)?.bytes ?? [])).toEqual(Array.from(bytes))
  })

  it('没有字节的老记录照样读得出来', () => {
    const raw = JSON.stringify({ ...makeBook('old'), bytes: undefined })
    expect(parseStoredBook(raw)?.text).toBe(makeBook('old').text)
  })
})
