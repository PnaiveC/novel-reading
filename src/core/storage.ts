export interface ReadingSettings {
  fontSize: number
  lineHeight: number
  maxWidth: number
  theme: 'light' | 'sepia' | 'dark'
}

export interface ReadingProgress {
  chapterIndex: number
  updatedAt: number
}

const PREFIX = 'novel-reading:'

const fallback = new Map<string, string>()

function getStore(): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage?.getItem === 'function') {
      return window.localStorage
    }
  } catch {
    // 忽略访问异常，走内存兜底
  }
  return null
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
    return typeof data.chapterIndex === 'number' ? data : null
  } catch {
    return null
  }
}

export function saveSettings(settings: ReadingSettings): void {
  writeItem(`${PREFIX}settings`, JSON.stringify(settings))
}

export function loadSettings(): ReadingSettings | null {
  const raw = readItem(`${PREFIX}settings`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ReadingSettings
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
