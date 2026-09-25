import {
  createLocalStorageBackend,
  createMemoryBackend,
  openIndexedDbBackend,
  StorageFullError,
  type LocalBackend,
  type StoredBook,
} from './backends'
import { normalizeBookmarks, type Bookmark } from './bookmarks'
import { usableLocalStorage } from './webStorage'

export type { StoredBook }
export { StorageFullError }

/** 读到哪儿（A4）：章节 + 段落锚点，外加最近打开列表要显示的两项 */
export interface ReadingProgress {
  chapterIndex: number
  /** 章节内段落锚点：重开后位置误差不超过一屏 */
  paragraphIndex: number
  updatedAt: number
  /** 上次离开时的章节总数与全书百分比（C5 列表直接显示，不用再翻整本书） */
  chapterCount?: number
  percent?: number
}

/** 最近打开的一行（C5）：书的信息 + 上次离开时的进度；正文不进内存 */
export interface BookSummary {
  id: string
  name: string
  size: number
  addedAt: number
  lastOpenedAt: number
  /** 还没读过就没有这一项 */
  progress?: ReadingProgress
}

/**
 * N2：书库。一本书在本机的足迹——正文与原始字节、阅读进度、书签、
 * 「上次打开的是哪本」这个指针——都归它管：删一本书就是删一整套，
 * 列表一行带上进度，调用方不必知道东西存在哪。
 */
export interface Library {
  saveBook(book: StoredBook): Promise<void>
  getBook(id: string): Promise<StoredBook | null>
  getLastBook(): Promise<StoredBook | null>
  setLastBook(id: string): Promise<void>
  /** 最近打开（C5）：按上次打开倒序，带进度 */
  listBooks(): Promise<BookSummary[]>
  /** 把这本书在本机留下的东西一次删干净：正文 / 索引 / 进度 / 书签 / 指针 */
  removeBook(id: string): Promise<void>
  /** 进度是「下次接着读」的便利：写不下不打断这次阅读（所以不抛） */
  saveProgress(id: string, progress: ReadingProgress): Promise<void>
  loadProgress(id: string): Promise<ReadingProgress | null>
  /** v1 用「文件名 + 大小」当进度键：打开书时搬一次家（换成内容哈希） */
  migrateLegacyProgress(book: { id: string; name: string; size: number }): Promise<ReadingProgress | null>
  /** 书签是用户的明确动作：存不下要抛出去，界面才能提示 */
  saveBookmarks(id: string, list: readonly Bookmark[]): Promise<void>
  loadBookmarks(id: string): Promise<Bookmark[]>
}

export interface LibraryOptions {
  /** 传 null 可强制走 localStorage 兜底（测试与不支持 IndexedDB 的浏览器） */
  indexedDb?: IDBFactory | null
  storage?: Storage | null
  dbName?: string
  /** 等 IndexedDB 开口最多等多久（file:// 下有的浏览器会一直不回话） */
  idbTimeoutMs?: number
}

export const IDB_OPEN_TIMEOUT = 1500

const DEFAULT_DB_NAME = 'novel-reading'
const LAST_BOOK_KEY = 'lastBookId'
const INDEX_PREFIX = 'index:'
const PROGRESS_PREFIX = 'progress:'

const indexKey = (id: string): string => `${INDEX_PREFIX}${id}`
const progressKey = (id: string): string => `${PROGRESS_PREFIX}${id}`
const bookmarksKey = (id: string): string => `bookmarks:${id}`

/** v1 的进度键：文件名 + 大小（只用来搬家，新键是内容哈希） */
export function fileKey(name: string, size: number): string {
  const source = `${name}:${size}`
  let hash = 5381
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
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

function parseSummary(raw: string | null): BookSummary | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as BookSummary
    if (typeof data?.id !== 'string' || typeof data?.name !== 'string') return null
    return {
      id: data.id,
      name: data.name,
      size: typeof data.size === 'number' ? data.size : 0,
      addedAt: typeof data.addedAt === 'number' ? data.addedAt : 0,
      lastOpenedAt: typeof data.lastOpenedAt === 'number' ? data.lastOpenedAt : 0,
    }
  } catch {
    return null
  }
}

function parseProgress(raw: string | null): ReadingProgress | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as ReadingProgress
    if (typeof data.chapterIndex !== 'number') return null
    return {
      chapterIndex: data.chapterIndex,
      // v1 只记到章节，回填成第 0 段
      paragraphIndex: typeof data.paragraphIndex === 'number' ? data.paragraphIndex : 0,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      ...(typeof data.chapterCount === 'number' ? { chapterCount: data.chapterCount } : {}),
      ...(typeof data.percent === 'number' ? { percent: data.percent } : {}),
    }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ 选后端 */

async function selectBackend(options: LibraryOptions): Promise<LocalBackend> {
  const factory =
    options.indexedDb !== undefined
      ? options.indexedDb
      : typeof indexedDB !== 'undefined'
        ? indexedDB
        : null
  if (factory) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const opening = openIndexedDbBackend(factory, options.dbName ?? DEFAULT_DB_NAME)
    try {
      return await Promise.race([
        opening,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('IndexedDB 打开超时')),
            options.idbTimeoutMs ?? IDB_OPEN_TIMEOUT,
          )
        }),
      ])
    } catch {
      // IndexedDB 不可用（file:// 打开时有的浏览器直接拒绝、有的干脆不回话），
      // 迟到的连接自己关掉，退回小存储——不能把用户卡在「正在打开…」
      void opening.then((backend) => backend.close()).catch(() => undefined)
    } finally {
      clearTimeout(timer)
    }
  }
  const storage = options.storage !== undefined ? options.storage : usableLocalStorage()
  return storage ? createLocalStorageBackend(storage) : createMemoryBackend()
}

/**
 * 本地书库（N2）：IndexedDB 能装下整本书就用它，不可用时退回 localStorage，
 * 连 localStorage 都没有就退回内存。后端在第一次调用时才确定，
 * 存不下不影响本次阅读，只影响「下次自动打开」。
 */
export function createLibrary(options: LibraryOptions = {}): Library {
  let backend: Promise<LocalBackend> | null = null
  const pick = (): Promise<LocalBackend> => (backend ??= selectBackend(options))

  async function saveBook(book: StoredBook): Promise<void> {
    const { books, values } = await pick()
    try {
      await books.put(book)
    } catch (error) {
      // 存不下原始字节时退一步：只存解码后的正文，至少保住「记住上次这本书」
      if (!(error instanceof StorageFullError) || !book.bytes?.length) throw error
      await books.put({ ...book, bytes: undefined })
    }
    await values.write(indexKey(book.id), JSON.stringify(summarize(book)))
  }

  async function getBook(id: string): Promise<StoredBook | null> {
    return (await pick()).books.get(id)
  }

  async function getLastBook(): Promise<StoredBook | null> {
    const { books, values } = await pick()
    const id = await values.read(LAST_BOOK_KEY)
    return id ? books.get(id) : null
  }

  async function setLastBook(id: string): Promise<void> {
    await (await pick()).values.write(LAST_BOOK_KEY, id)
  }

  async function listBooks(): Promise<BookSummary[]> {
    const { books, values } = await pick()
    const rows: BookSummary[] = []
    const indexed = new Set<string>()
    for (const key of await values.keys(INDEX_PREFIX)) {
      const summary = parseSummary(await values.read(key))
      if (!summary) continue
      rows.push(summary)
      indexed.add(summary.id)
    }
    // 老数据还没有索引：这里补一次（只有第一次列表要读大件）
    for (const id of await books.keys()) {
      if (indexed.has(id)) continue
      const book = await books.get(id)
      if (!book) continue
      const summary = summarize(book)
      rows.push(summary)
      await values.write(indexKey(id), JSON.stringify(summary))
    }
    const progress = new Map<string, ReadingProgress>()
    for (const key of await values.keys(PROGRESS_PREFIX)) {
      const parsed = parseProgress(await values.read(key))
      if (parsed) progress.set(key.slice(PROGRESS_PREFIX.length), parsed)
    }
    return rows
      .map((row) => {
        const found = progress.get(row.id)
        return found ? { ...row, progress: found } : row
      })
      .sort(byRecent)
  }

  async function removeBook(id: string): Promise<void> {
    const { books, values } = await pick()
    await books.delete(id)
    await values.remove(indexKey(id))
    await values.remove(progressKey(id))
    await values.remove(bookmarksKey(id))
    if ((await values.read(LAST_BOOK_KEY)) === id) await values.remove(LAST_BOOK_KEY)
  }

  async function saveProgress(id: string, progress: ReadingProgress): Promise<void> {
    const { values } = await pick()
    try {
      await values.write(progressKey(id), JSON.stringify(progress))
    } catch {
      // 写不下（配额满 / 存储被禁）也不打断这次阅读：进度是便利，
      // 丢一次只是下次的落点不准，不值得为此弹提示。
    }
  }

  async function loadProgress(id: string): Promise<ReadingProgress | null> {
    return parseProgress(await (await pick()).values.read(progressKey(id)))
  }

  async function migrateLegacyProgress(book: {
    id: string
    name: string
    size: number
  }): Promise<ReadingProgress | null> {
    const current = await loadProgress(book.id)
    if (current) return current
    const legacyKey = fileKey(book.name, book.size)
    if (legacyKey === book.id) return null
    const legacy = await loadProgress(legacyKey)
    if (!legacy) return null
    await saveProgress(book.id, legacy)
    await (await pick()).values.remove(progressKey(legacyKey))
    return legacy
  }

  async function saveBookmarks(id: string, list: readonly Bookmark[]): Promise<void> {
    await (await pick()).values.write(bookmarksKey(id), JSON.stringify(list))
  }

  async function loadBookmarks(id: string): Promise<Bookmark[]> {
    const raw = await (await pick()).values.read(bookmarksKey(id))
    if (!raw) return []
    try {
      return normalizeBookmarks(JSON.parse(raw))
    } catch {
      return []
    }
  }

  return {
    saveBook,
    getBook,
    getLastBook,
    setLastBook,
    listBooks,
    removeBook,
    saveProgress,
    loadProgress,
    migrateLegacyProgress,
    saveBookmarks,
    loadBookmarks,
  }
}
