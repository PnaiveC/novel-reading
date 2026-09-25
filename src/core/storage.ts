import { normalizeSettings, type ReadingSettings } from './settings'
import { normalizeShortcuts, type ShortcutBindings } from './shortcuts'
import { normalizeUiPrefs, type UiPrefs } from './uiPrefs'
import { usableLocalStorage } from './webStorage'

export type { ReadingSettings } from './settings'

/**
 * 全局偏好（排版、快捷键、界面偏好）。这些不属于「哪本书」，所以不进 N2 的书库 module；
 * 它们只走 localStorage，拿不到就退回内存，坏了就当没设置过。
 */
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

/* ------------------------------------------------------------ C3 快捷键 */

export function saveShortcuts(bindings: ShortcutBindings): void {
  writeItem(`${PREFIX}shortcuts`, JSON.stringify(normalizeShortcuts(bindings)))
}

export function loadShortcuts(): ShortcutBindings {
  const raw = readItem(`${PREFIX}shortcuts`)
  if (!raw) return normalizeShortcuts(null)
  try {
    return normalizeShortcuts(JSON.parse(raw))
  } catch {
    return normalizeShortcuts(null)
  }
}

/* ------------------------------------------------------------ C2 界面偏好 */

export function saveUiPrefs(prefs: UiPrefs): void {
  writeItem(`${PREFIX}ui`, JSON.stringify(normalizeUiPrefs(prefs)))
}

export function loadUiPrefs(): UiPrefs {
  const raw = readItem(`${PREFIX}ui`)
  if (!raw) return normalizeUiPrefs(null)
  try {
    return normalizeUiPrefs(JSON.parse(raw))
  } catch {
    return normalizeUiPrefs(null)
  }
}

/** 清空全局偏好（测试与「重置」场景使用） */
export function clearStorage(): void {
  const store = getStore()
  if (store) store.clear()
  else fallback.clear()
}
