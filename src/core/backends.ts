import { base64ToBytes, bytesToBase64 } from './base64'
import type { Encoding } from './encoding'

/**
 * N2 的两条 port：
 * - `BookStore` 放大件（整本书的正文与原始字节），只会按 id 存取；
 * - `KeyValueStore` 放小件（阅读进度、书签、最近打开索引、上次打开指针），按键存取。
 *
 * IndexedDB / localStorage / 内存 三个 adapter 各实现一套；键怎么起名、失败怎么办，
 * 都是书库 module（`library.ts`）的事，这里只管存取。
 */
export interface StoredBook {
  id: string
  name: string
  size: number
  encoding: Encoding
  text: string
  /** 原始字节（B1：手动切编码要用）。兜底存储里可能存不下，见 `library.ts` */
  bytes?: Uint8Array
  /** 用户手动选过编码：下次打开别再自动识别，免得把他的选择顶掉 */
  encodingLocked?: boolean
  addedAt: number
  lastOpenedAt: number
}

export interface BookStore {
  put(book: StoredBook): Promise<void>
  get(id: string): Promise<StoredBook | null>
  delete(id: string): Promise<void>
  /** 有哪些书的 id——不读大件，列表回填索引时用 */
  keys(): Promise<string[]>
}

export interface KeyValueStore {
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  keys(prefix: string): Promise<string[]>
}

export interface LocalBackend {
  books: BookStore
  values: KeyValueStore
  /** 关掉底层连接（只有 IndexedDB 需要；没接上的连接得自己关，免得握着库不放） */
  close(): void
}

/** 本地放不下（配额满、浏览器不给存）时抛出，交给界面提示用户 */
export class StorageFullError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StorageFullError'
  }
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

/* ------------------------------------------------------------------ 内存 */

function copyBook(book: StoredBook): StoredBook {
  return book.bytes?.length ? { ...book, bytes: new Uint8Array(book.bytes) } : { ...book }
}

/** 没有可用存储时（Node 里跑测试、浏览器禁掉本地存储）用的后端 */
export function createMemoryBackend(): LocalBackend {
  const books = new Map<string, StoredBook>()
  const values = new Map<string, string>()
  return {
    close: () => undefined,
    books: {
      put: async (book) => {
        books.set(book.id, copyBook(book))
      },
      get: async (id) => {
        const book = books.get(id)
        return book ? copyBook(book) : null
      },
      delete: async (id) => {
        books.delete(id)
      },
      keys: async () => [...books.keys()],
    },
    values: {
      read: async (key) => values.get(key) ?? null,
      write: async (key, value) => {
        values.set(key, value)
      },
      remove: async (key) => {
        values.delete(key)
      },
      keys: async (prefix) => [...values.keys()].filter((key) => key.startsWith(prefix)),
    },
  }
}

/* ------------------------------------------------------------ localStorage */

export const LOCAL_PREFIX = 'novel-reading:'

/**
 * localStorage 后端：大件和小件都挤在这一个 key/value 空间里。
 * 写不下时抛 StorageFullError（配额满），由书库 module 决定怎么退让。
 */
export function createLocalStorageBackend(storage: Storage): LocalBackend {
  const fullKey = (key: string): string => `${LOCAL_PREFIX}${key}`

  const write = (key: string, value: string): void => {
    try {
      storage.setItem(fullKey(key), value)
    } catch (error) {
      // 同一条存储既放书也放进度 / 书签，所以这里只说存储，不说「哪一样」放不下
      throw new StorageFullError('浏览器本地存储放不下', { cause: error })
    }
  }

  const keysWithPrefix = (prefix: string): string[] => {
    const found: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key && key.startsWith(fullKey(prefix))) found.push(key.slice(LOCAL_PREFIX.length))
    }
    return found
  }

  return {
    close: () => undefined,
    books: {
      put: async (book) => write(`book:${book.id}`, serializeBook(book)),
      get: async (id) => {
        const raw = storage.getItem(fullKey(`book:${id}`))
        return raw ? parseStoredBook(raw) : null
      },
      delete: async (id) => {
        storage.removeItem(fullKey(`book:${id}`))
      },
      keys: async () => keysWithPrefix('book:').map((key) => key.slice('book:'.length)),
    },
    values: {
      read: async (key) => storage.getItem(fullKey(key)),
      write: async (key, value) => write(key, value),
      remove: async (key) => {
        storage.removeItem(fullKey(key))
      },
      keys: async (prefix) => keysWithPrefix(prefix),
    },
  }
}

/* --------------------------------------------------------------- IndexedDB */

const DB_VERSION = 1
const BOOKS = 'books'
const META = 'meta'

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

/** 打开（必要时建好）书库的库表：`books` 放大件，`meta` 放小件 */
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

/**
 * IndexedDB 后端：能装下整本书，也能只取 key（列表回填索引时用）。
 * 打不开（file:// 下有的浏览器直接拒绝、有的干脆不回话）由调用方退回小存储。
 */
export async function openIndexedDbBackend(
  factory: IDBFactory,
  dbName: string,
): Promise<LocalBackend> {
  const db = await openDatabase(factory, dbName)
  const readMeta = async (key: string): Promise<string | null> => {
    const tx = db.transaction(META, 'readonly')
    const row = await request<{ key: string; value: string } | undefined>(
      tx.objectStore(META).get(key),
    )
    return row?.value ?? null
  }
  const writeMeta = async (key: string, value: string): Promise<void> => {
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put({ key, value })
    await transactionDone(tx)
  }
  return {
    close: () => db.close(),
    books: {
      put: async (book) => {
        const tx = db.transaction(BOOKS, 'readwrite')
        tx.objectStore(BOOKS).put(book)
        await transactionDone(tx)
      },
      get: async (id) => {
        const tx = db.transaction(BOOKS, 'readonly')
        const row = await request<StoredBook | undefined>(tx.objectStore(BOOKS).get(id))
        return row ?? null
      },
      delete: async (id) => {
        const tx = db.transaction(BOOKS, 'readwrite')
        tx.objectStore(BOOKS).delete(id)
        await transactionDone(tx)
      },
      keys: async () => {
        const tx = db.transaction(BOOKS, 'readonly')
        const rows = await request<IDBValidKey[]>(tx.objectStore(BOOKS).getAllKeys())
        return rows.map((key) => String(key))
      },
    },
    values: {
      read: readMeta,
      write: writeMeta,
      remove: async (key) => {
        const tx = db.transaction(META, 'readwrite')
        tx.objectStore(META).delete(key)
        await transactionDone(tx)
      },
      keys: async (prefix) => {
        const tx = db.transaction(META, 'readonly')
        const rows = await request<IDBValidKey[]>(tx.objectStore(META).getAllKeys())
        return rows.map((key) => String(key)).filter((key) => key.startsWith(prefix))
      },
    },
  }
}
