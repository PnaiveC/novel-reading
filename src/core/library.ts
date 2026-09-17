import { base64ToBytes, bytesToBase64 } from './base64'
import type { Encoding } from './encoding'
import { usableLocalStorage } from './webStorage'

/** 存在本机的一本书（A3）：正文一起存，下次打开就不用再选文件 */
export interface StoredBook {
  id: string
  name: string
  size: number
  encoding: Encoding
  text: string
  /** 原始字节（B1：手动切编码要用）。localStorage 兜底时可能存不下，见下 */
  bytes?: Uint8Array
  /** 用户手动选过编码：下次打开别再自动识别，免得把他的选择顶掉 */
  encodingLocked?: boolean
  addedAt: number
  lastOpenedAt: number
}

export interface Library {
  saveBook(book: StoredBook): Promise<void>
  getBook(id: string): Promise<StoredBook | null>
  getLastBook(): Promise<StoredBook | null>
  setLastBook(id: string): Promise<void>
  /** C5 最近打开列表：只要目录信息，不把整本书读进内存 */
  listBooks(): Promise<BookSummary[]>
  removeBook(id: string): Promise<void>
}

/** 书架上的一行（C5）：正文不进内存 */
export interface BookSummary {
  id: string
  name: string
  size: number
  addedAt: number
  lastOpenedAt: number
}

function summarize(book: StoredBook): BookSummary {
  return {
    id: book.id,
    name: book.name,
    size: book.size,
    addedAt: book.addedAt,
    lastOpenedAt: book.lastOpenedAt,
  }
}

function byRecent(a: BookSummary, b: BookSummary): number {
  return b.lastOpenedAt - a.lastOpenedAt || a.name.localeCompare(b.name)
}

/** localStorage 只能存字符串：落盘时把字节转 base64，读回时转回来 */
interface StoredBookJson extends Omit<StoredBook, 'bytes'> {
  bytesBase64?: string
}

export function serializeBook(book: StoredBook): string {
  const { bytes, ...rest } = book
  const payload: StoredBookJson = rest
  if (bytes?.length) payload.bytesBase64 = bytesToBase64(bytes)
  return JSON.stringify(payload)
}

export function parseStoredBook(raw: string): StoredBook | null {
  try {
    const data = JSON.parse(raw) as StoredBookJson
    if (typeof data?.text !== 'string') return null
    const { bytesBase64, ...rest } = data
    return bytesBase64 ? { ...rest, bytes: base64ToBytes(bytesBase64) } : rest
  } catch {
    return null
  }
}

export interface LibraryOptions {
  /** 传 null 可强制走 localStorage 兜底（测试与不支持 IndexedDB 的浏览器） */
  indexedDb?: IDBFactory | null
  storage?: Storage | null
  dbName?: string
}

/** 本地放不下（配额满、浏览器不给存）时抛出，交给界面提示用户 */
export class StorageFullError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StorageFullError'
  }
}

const PREFIX = 'novel-reading:'
const DEFAULT_DB_NAME = 'novel-reading'
const DB_VERSION = 1
const BOOKS = 'books'
const META = 'meta'
const LAST_BOOK_KEY = 'lastBookId'

function lastBookStorageKey(): string {
  return `${PREFIX}${LAST_BOOK_KEY}`
}

function bookStorageKey(id: string): string {
  return `${PREFIX}book:${id}`
}

/* ------------------------------------------------------------------ IndexedDB */

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'))
  })
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest
    try {
      req = factory.open(name, DB_VERSION)
    } catch (error) {
      reject(error)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
    req.onblocked = () => reject(new Error('IndexedDB 被其它标签页占用'))
  })
}

function indexedDbLibrary(db: IDBDatabase): Library {
  const readMeta = async (key: string): Promise<string | null> => {
    const tx = db.transaction(META, 'readonly')
    const row = await request<{ key: string; value: string } | undefined>(
      tx.objectStore(META).get(key),
    )
    return row?.value ?? null
  }

  const writeMeta = async (key: string, value: string | null): Promise<void> => {
    const tx = db.transaction(META, 'readwrite')
    if (value === null) tx.objectStore(META).delete(key)
    else tx.objectStore(META).put({ key, value })
    await transactionDone(tx)
  }

  return {
    saveBook: async (book) => {
      const tx = db.transaction(BOOKS, 'readwrite')
      tx.objectStore(BOOKS).put(book)
      await transactionDone(tx)
    },
    getBook: async (id) => {
      const tx = db.transaction(BOOKS, 'readonly')
      const row = await request<StoredBook | undefined>(tx.objectStore(BOOKS).get(id))
      return row ?? null
    },
    getLastBook: async () => {
      const id = await readMeta(LAST_BOOK_KEY)
      if (!id) return null
      const tx = db.transaction(BOOKS, 'readonly')
      const row = await request<StoredBook | undefined>(tx.objectStore(BOOKS).get(id))
      return row ?? null
    },
    setLastBook: async (id) => {
      const tx = db.transaction(META, 'readwrite')
      tx.objectStore(META).put({ key: LAST_BOOK_KEY, value: id })
      await transactionDone(tx)
    },
    listBooks: async () => {
      const tx = db.transaction(BOOKS, 'readonly')
      const rows = await new Promise<StoredBook[]>((resolve, reject) => {
        const items: StoredBook[] = []
        const req = tx.objectStore(BOOKS).openCursor()
        req.onsuccess = () => {
          const cursor = req.result
          if (!cursor) {
            resolve(items)
            return
          }
          items.push(cursor.value as StoredBook)
          cursor.continue()
        }
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 读取失败'))
      })
      return rows.map(summarize).sort(byRecent)
    },
    removeBook: async (id) => {
      const tx = db.transaction(BOOKS, 'readwrite')
      tx.objectStore(BOOKS).delete(id)
      await transactionDone(tx)
      if ((await readMeta(LAST_BOOK_KEY)) === id) await writeMeta(LAST_BOOK_KEY, null)
    },
  }
}

/* --------------------------------------------------------------- localStorage */

function localLibrary(provided?: Storage | null): Library {
  const memory = new Map<string, string>()

  const resolveStorage = (): Storage | null => {
    if (provided !== undefined) return provided
    return usableLocalStorage()
  }

  const read = (key: string): string | null => {
    const store = resolveStorage()
    return store ? store.getItem(key) : (memory.get(key) ?? null)
  }

  const write = (key: string, value: string): void => {
    const store = resolveStorage()
    if (!store) {
      memory.set(key, value)
      return
    }
    try {
      store.setItem(key, value)
    } catch (error) {
      throw new StorageFullError('浏览器本地存储放不下这本书', { cause: error })
    }
  }

  const readBook = (id: string): StoredBook | null => {
    const raw = read(bookStorageKey(id))
    if (!raw) return null
    return parseStoredBook(raw)
  }

  const keys = (): string[] => {
    const store = resolveStorage()
    if (!store) return Array.from(memory.keys())
    const result: string[] = []
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index)
      if (key) result.push(key)
    }
    return result
  }

  const drop = (key: string): void => {
    const store = resolveStorage()
    if (store) store.removeItem(key)
    else memory.delete(key)
  }

  return {
    saveBook: async (book) => {
      const key = bookStorageKey(book.id)
      const full = serializeBook(book)
      try {
        write(key, full)
        return
      } catch (error) {
        // 存不下原始字节时退一步：只存解码后的正文，至少保住「记住上次这本书」
        if (!book.bytes?.length) throw error
      }
      write(key, serializeBook({ ...book, bytes: undefined }))
    },
    getBook: async (id) => readBook(id),
    getLastBook: async () => {
      const id = read(lastBookStorageKey())
      return id ? readBook(id) : null
    },
    setLastBook: async (id) => write(lastBookStorageKey(), id),
    listBooks: async () => {
      const prefix = bookStorageKey('')
      return keys()
        .filter((key) => key.startsWith(prefix))
        .map((key) => parseStoredBook(read(key) ?? ''))
        .filter((book): book is StoredBook => Boolean(book))
        .map(summarize)
        .sort(byRecent)
    },
    removeBook: async (id) => {
      drop(bookStorageKey(id))
      if (read(lastBookStorageKey()) === id) drop(lastBookStorageKey())
    },
  }
}

/* ------------------------------------------------------------------ 选择后端 */

async function selectBackend(options: LibraryOptions): Promise<Library> {
  const factory =
    options.indexedDb !== undefined
      ? options.indexedDb
      : typeof indexedDB !== 'undefined'
        ? indexedDB
        : null
  if (factory) {
    try {
      const db = await openDatabase(factory, options.dbName ?? DEFAULT_DB_NAME)
      return indexedDbLibrary(db)
    } catch {
      // IndexedDB 不可用（file:// 打开时部分浏览器会拒绝），退回 localStorage
    }
  }
  return localLibrary(options.storage)
}

/**
 * 本地书库。优先 IndexedDB（能装下整本书），不可用时退回 localStorage。
 * 后端在第一次调用时才确定，失败不影响本次阅读，只影响「下次自动打开」。
 */
export function createLibrary(options: LibraryOptions = {}): Library {
  let backend: Promise<Library> | null = null
  const pick = (): Promise<Library> => (backend ??= selectBackend(options))
  return {
    saveBook: async (book) => (await pick()).saveBook(book),
    getBook: async (id) => (await pick()).getBook(id),
    getLastBook: async () => (await pick()).getLastBook(),
    setLastBook: async (id) => (await pick()).setLastBook(id),
    listBooks: async () => (await pick()).listBooks(),
    removeBook: async (id) => (await pick()).removeBook(id),
  }
}
