import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { parseStoredBook, serializeBook, StorageFullError, type StoredBook } from '../../src/core/backends'
import { createLibrary, fileKey } from '../../src/core/library'
import { memoryStorage } from '../helpers/fakes'

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

/** 模拟 file:// 下另一种表现：open 出去就再也没有回话 */
function silentIndexedDb(): IDBFactory {
  return {
    open() {
      return {} as unknown as IDBOpenDBRequest
    },
  } as unknown as IDBFactory
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('createLibrary：本地书库不回话时不能把用户卡住', () => {
  it('IndexedDB 打开超时 → 退回 localStorage，书照样存得住', async () => {
    const store = memoryStorage()
    const library = createLibrary({
      indexedDb: silentIndexedDb(),
      storage: store,
      idbTimeoutMs: 20,
    })
    const book = makeBook('timeout')
    const started = Date.now()
    await library.saveBook(book)
    await library.setLastBook(book.id)

    expect(Date.now() - started).toBeLessThan(1000)
    expect((await library.getLastBook())?.id).toBe('timeout')
    expect(await library.getBook('timeout')).toMatchObject({ name: 'timeout.txt' })
    expect(store.getItem(`novel-reading:book:timeout`)).toContain('timeout.txt')
  })
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

  it('最近打开列表：按上次打开时间倒序，不带正文（C5）', async () => {
    const library = createLibrary({ indexedDb: new IDBFactory() })
    await library.saveBook({ ...makeBook('a'), lastOpenedAt: 10 })
    await library.saveBook({ ...makeBook('b'), lastOpenedAt: 30 })
    await library.saveBook({ ...makeBook('c'), lastOpenedAt: 20 })

    const list = await library.listBooks()
    expect(list.map((book) => book.id)).toEqual(['b', 'c', 'a'])
    expect(Object.keys(list[0] ?? {}).sort()).toEqual(['addedAt', 'id', 'lastOpenedAt', 'name', 'size'])
  })

  it('删掉一本书（C5）：列表里没了，它当过「上次那本」也不会再自动打开', async () => {
    const library = createLibrary({ indexedDb: new IDBFactory() })
    await library.saveBook(makeBook('a'))
    await library.setLastBook('a')
    await library.removeBook('a')

    expect(await library.listBooks()).toEqual([])
    expect(await library.getBook('a')).toBeNull()
    expect(await library.getLastBook()).toBeNull()
  })

  it('localStorage 兜底后端同样能列书、删书', async () => {
    const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
    await library.saveBook({ ...makeBook('a'), lastOpenedAt: 1 })
    await library.saveBook({ ...makeBook('b'), lastOpenedAt: 2 })
    expect((await library.listBooks()).map((book) => book.id)).toEqual(['b', 'a'])

    await library.removeBook('b')
    expect((await library.listBooks()).map((book) => book.id)).toEqual(['a'])
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

function makeBookmark(id: string) {
  return {
    id,
    chapterIndex: 1,
    paragraphIndex: 2,
    chapterTitle: '第二章',
    excerpt: '正文',
    createdAt: 3,
  }
}

describe('一本书在本机的足迹（N2）', () => {
  it('进度存得回，v1 老记录补第 0 段，写不下也不抛', async () => {
    const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
    expect(await library.loadProgress('missing')).toBeNull()

    await library.saveProgress('a', {
      chapterIndex: 2,
      paragraphIndex: 4,
      updatedAt: 5,
      chapterCount: 30,
      percent: 12,
    })
    expect(await library.loadProgress('a')).toEqual({
      chapterIndex: 2,
      paragraphIndex: 4,
      updatedAt: 5,
      chapterCount: 30,
      percent: 12,
    })

    window.localStorage.setItem(
      'novel-reading:progress:v1book',
      JSON.stringify({ chapterIndex: 5, updatedAt: 1 }),
    )
    const fromV1 = createLibrary({ indexedDb: null, storage: window.localStorage })
    expect(await fromV1.loadProgress('v1book')).toEqual({
      chapterIndex: 5,
      paragraphIndex: 0,
      updatedAt: 1,
    })

    // 配额满：进度写不下去也不打断阅读（书签那种明确动作才提示）
    const blocked: Storage = {
      length: 0,
      clear: () => undefined,
      key: () => null,
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const tight = createLibrary({ indexedDb: null, storage: blocked })
    await expect(
      tight.saveProgress('a', { chapterIndex: 1, paragraphIndex: 0, updatedAt: 1 }),
    ).resolves.toBeUndefined()
  })

  it('书签按书存、按书读，坏 JSON 当作没有', async () => {
    const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
    await library.saveBookmarks('book-1', [makeBookmark('1:2')])
    expect(await library.loadBookmarks('book-1')).toHaveLength(1)
    expect(await library.loadBookmarks('book-2')).toEqual([])

    window.localStorage.setItem('novel-reading:bookmarks:book-3', '{坏 JSON')
    const onGlobal = createLibrary({ indexedDb: null, storage: window.localStorage })
    expect(await onGlobal.loadBookmarks('book-3')).toEqual([])
  })

  it('删掉一本书：正文 / 索引 / 进度 / 书签 / 上次打开指针一起没', async () => {
    const store = memoryStorage()
    const library = createLibrary({ indexedDb: null, storage: store })
    await library.saveBook(makeBook('a'))
    await library.setLastBook('a')
    await library.saveProgress('a', { chapterIndex: 1, paragraphIndex: 1, updatedAt: 1 })
    await library.saveBookmarks('a', [makeBookmark('1:2')])

    await library.removeBook('a')
    expect(await library.getBook('a')).toBeNull()
    expect(await library.getLastBook()).toBeNull()
    expect(await library.loadProgress('a')).toBeNull()
    expect(await library.loadBookmarks('a')).toEqual([])
    expect(store.getItem('novel-reading:index:a')).toBeNull()
  })

  it('最近打开：一行带上进度，按上次打开倒序', async () => {
    const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
    await library.saveBook({ ...makeBook('a'), lastOpenedAt: 10 })
    await library.saveBook({ ...makeBook('b'), lastOpenedAt: 30 })
    await library.saveProgress('a', {
      chapterIndex: 1,
      paragraphIndex: 0,
      updatedAt: 1,
      chapterCount: 4,
      percent: 25,
    })

    const rows = await library.listBooks()
    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
    expect(rows[0]?.progress).toBeUndefined()
    expect(rows[1]?.progress).toMatchObject({ chapterIndex: 1, percent: 25 })
  })

  it('列书不读大件：索引在的时候，列表只碰小记录', async () => {
    const base = memoryStorage()
    const reads: string[] = []
    const counting: Storage = {
      ...base,
      // 展开会把 memoryStorage 的 length getter 变成某个瞬间的值，这里得补回来
      get length() {
        return base.length
      },
      key: (index) => base.key(index),
      getItem: (key) => {
        reads.push(key)
        return base.getItem(key)
      },
    }
    const library = createLibrary({ indexedDb: null, storage: counting })
    await library.saveBook({ ...makeBook('big'), text: '正文'.repeat(2000) })
    await library.listBooks()

    reads.length = 0
    expect((await library.listBooks()).map((row) => row.id)).toEqual(['big'])
    expect(reads.filter((key) => key.startsWith('novel-reading:book:'))).toEqual([])
  })

  it('老数据还没有索引：列表照样列得出来，顺手补上索引', async () => {
    const store = memoryStorage()
    store.setItem('novel-reading:book:old', serializeBook({ ...makeBook('old'), lastOpenedAt: 3 }))
    const library = createLibrary({ indexedDb: null, storage: store })

    expect((await library.listBooks()).map((row) => row.id)).toEqual(['old'])
    expect(store.getItem('novel-reading:index:old')).toContain('old.txt')
  })

  it('v1 的进度键（文件名 + 大小）搬一次家', async () => {
    const library = createLibrary({ indexedDb: null, storage: memoryStorage() })
    const legacy = fileKey('novel.txt', 20)
    await library.saveProgress(legacy, { chapterIndex: 1, paragraphIndex: 3, updatedAt: 7 })

    const progress = await library.migrateLegacyProgress({ id: 'hash-a', name: 'novel.txt', size: 20 })
    expect(progress).toMatchObject({ chapterIndex: 1, paragraphIndex: 3 })
    expect(await library.loadProgress('hash-a')).not.toBeNull()
    expect(await library.loadProgress(legacy)).toBeNull()
  })

  it('IndexedDB 后端一样：进度 / 书签 / 列表 / 删足迹都走同一个 module', async () => {
    const library = createLibrary({ indexedDb: new IDBFactory() })
    await library.saveBook({ ...makeBook('a'), lastOpenedAt: 10 })
    await library.setLastBook('a')
    await library.saveProgress('a', { chapterIndex: 2, paragraphIndex: 1, updatedAt: 5 })
    await library.saveBookmarks('a', [makeBookmark('1:2')])

    expect((await library.listBooks())[0]?.progress?.chapterIndex).toBe(2)
    expect(await library.loadBookmarks('a')).toHaveLength(1)

    await library.removeBook('a')
    expect(await library.listBooks()).toEqual([])
    expect(await library.loadProgress('a')).toBeNull()
    expect(await library.loadBookmarks('a')).toEqual([])
  })
})
