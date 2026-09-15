import type { Encoding } from './encoding'
import { usableLocalStorage } from './webStorage'

/** 存在本机的一本书（A3）：正文一起存，下次打开就不用再选文件 */
export interface StoredBook {
  id: string
  name: string
  size: number
  encoding: Encoding
  text: string
  addedAt: number
  lastOpenedAt: number
}

export interface Library {
  saveBook(book: StoredBook): Promise<void>
  getBook(id: string): Promise<StoredBook | null>
  getLastBook(): Promise<StoredBook | null>
  setLastBook(id: string): Promise<void>
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
    try {
      const book = JSON.parse(raw) as StoredBook
      return typeof book.text === 'string' ? book : null
    } catch {
      return null
    }
  }

  return {
    saveBook: async (book) => write(bookStorageKey(book.id), JSON.stringify(book)),
    getBook: async (id) => readBook(id),
    getLastBook: async () => {
      const id = read(lastBookStorageKey())
      return id ? readBook(id) : null
    },
    setLastBook: async (id) => write(lastBookStorageKey(), id),
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
  }
}
