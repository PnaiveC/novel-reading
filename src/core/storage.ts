import { usableLocalStorage } from './webStorage'
import { normalizeSettings, type ReadingSettings } from './settings'

export type { ReadingSettings } from './settings'

export interface ReadingProgress {
  chapterIndex: number
  /** 章节内段落锚点（A4）：重开后位置误差不超过一屏 */
  paragraphIndex: number
  updatedAt: number
}

const PREFIX = 'novel-reading:'

const fallback = new Map<string, string>()

function getStore(): Storage | null {
  return usableLocalStorage()
}

function readItem(key: string): string | null {
  const store = getStore()
  if (store) return store.getItem(key)
  return fallback.get(key) ?? null
}

function writeItem(key: string, value: string): void {
  const store = getStore()
  if (store) store.setItem(key, value)
  else fallback.set(key, value)
}

/** 以文件名 + 大小生成轻量文件标识，用于关联阅读进度 */
export function fileKey(name: string, size: number): string {
  const source = `${name}:${size}`
  let hash = 5381
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

export function saveProgress(key: string, progress: ReadingProgress): void {
  writeItem(`${PREFIX}progress:${key}`, JSON.stringify(progress))
}

export function loadProgress(key: string): ReadingProgress | null {
  const raw = readItem(`${PREFIX}progress:${key}`)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as ReadingProgress
    if (typeof data.chapterIndex !== 'number') return null
    return {
      chapterIndex: data.chapterIndex,
      // v1 只记到章节，回填成第 0 段
      paragraphIndex: typeof data.paragraphIndex === 'number' ? data.paragraphIndex : 0,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    }
  } catch {
    return null
  }
}

export function removeProgress(key: string): void {
  const store = getStore()
  if (store) store.removeItem(`${PREFIX}progress:${key}`)
  else fallback.delete(`${PREFIX}progress:${key}`)
}

/**
 * v1 用「文件名 + 大小」当进度键，v2 换成内容哈希。
 * 打开书时调一次：新键没有进度、旧键有，就把旧进度搬过来并删掉旧键。
 */
export function migrateLegacyProgress(
  bookId: string,
  name: string,
  size: number,
): ReadingProgress | null {
  const current = loadProgress(bookId)
  if (current) return current
  const legacyKey = fileKey(name, size)
  if (legacyKey === bookId) return null
  const legacy = loadProgress(legacyKey)
  if (!legacy) return null
  saveProgress(bookId, legacy)
  removeProgress(legacyKey)
  return legacy
}

export function saveSettings(settings: ReadingSettings): void {
  writeItem(`${PREFIX}settings`, JSON.stringify(normalizeSettings(settings)))
}

export function loadSettings(): ReadingSettings | null {
  const raw = readItem(`${PREFIX}settings`)
  if (!raw) return null
  try {
    return normalizeSettings(JSON.parse(raw) as Partial<ReadingSettings>)
  } catch {
    return null
  }
}

/** 清空阅读器本地存储（测试与“重置”场景使用） */
export function clearStorage(): void {
  const store = getStore()
  if (store) store.clear()
  else fallback.clear()
}
