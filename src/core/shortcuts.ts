export type ShortcutActionId =
  | 'prevChapter'
  | 'nextChapter'
  | 'pageDown'
  | 'pageUp'
  | 'chapterStart'
  | 'chapterEnd'
  | 'toc'
  | 'settings'
  | 'bookmark'
  | 'bookmarks'
  | 'recent'
  | 'theme'
  | 'immersive'

export interface ShortcutAction {
  id: ShortcutActionId
  label: string
  group: 'nav' | 'panel'
  keys: string[]
}

/** 一个功能可以有多个键（空格和 PageDown 都往下翻），改键时只留新按的那个 */
export type ShortcutBindings = Record<ShortcutActionId, string[]>

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'prevChapter', label: '上一章', group: 'nav', keys: ['ArrowLeft'] },
  { id: 'nextChapter', label: '下一章', group: 'nav', keys: ['ArrowRight'] },
  { id: 'pageDown', label: '往下翻页', group: 'nav', keys: [' ', 'PageDown'] },
  { id: 'pageUp', label: '往上翻页', group: 'nav', keys: ['PageUp'] },
  { id: 'chapterStart', label: '本章开头', group: 'nav', keys: ['Home'] },
  { id: 'chapterEnd', label: '本章结尾', group: 'nav', keys: ['End'] },
  { id: 'toc', label: '目录', group: 'panel', keys: ['d'] },
  { id: 'settings', label: '排版与设置', group: 'panel', keys: ['w'] },
  { id: 'bookmark', label: '加书签', group: 'panel', keys: ['a'] },
  { id: 'bookmarks', label: '书签列表', group: 'panel', keys: ['b'] },
  { id: 'recent', label: '最近打开', group: 'panel', keys: ['r'] },
  { id: 'theme', label: '切换主题', group: 'panel', keys: ['t'] },
  { id: 'immersive', label: '沉浸模式', group: 'panel', keys: ['m'] },
]

const KEY_LABELS: Record<string, string> = {
  ' ': '空格',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Home: 'Home',
  End: 'End',
  Escape: 'Esc',
}

export function keyLabel(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key]
  return key.length === 1 ? key.toUpperCase() : key
}

export function keysLabel(keys: readonly string[]): string {
  return keys.map(keyLabel).join(' / ')
}

/** 浏览器报的 key 归一化：字母不分大小写，空格统一成空格 */
export function normalizeKey(key: string): string {
  if (key === 'Spacebar' || key === 'Space') return ' '
  return key.length === 1 ? key.toLowerCase() : key
}

export function defaultShortcuts(): ShortcutBindings {
  const result = {} as ShortcutBindings
  for (const action of SHORTCUT_ACTIONS) result[action.id] = [...action.keys]
  return result
}

export function findAction(id: ShortcutActionId): ShortcutAction | undefined {
  return SHORTCUT_ACTIONS.find((action) => action.id === id)
}

/**
 * 把存下来的绑定收进合法状态：只认已知功能、只认字符串键、同一个键不给两个功能用。
 * 坏数据 / 旧版本缺字段都退回默认，不影响能读。
 */
export function normalizeShortcuts(input: unknown): ShortcutBindings {
  const source = (input ?? {}) as Record<string, unknown>
  const result = {} as ShortcutBindings
  const used = new Set<string>()

  const take = (rawKeys: unknown, fallback: string[]): string[] => {
    const keys: string[] = []
    const list = Array.isArray(rawKeys) ? rawKeys : []
    for (const item of list) {
      if (typeof item !== 'string' || !item) continue
      const key = normalizeKey(item)
      if (used.has(key) || keys.includes(key)) continue
      keys.push(key)
    }
    if (keys.length) return keys
    for (const item of fallback) {
      const key = normalizeKey(item)
      if (used.has(key) || keys.includes(key)) continue
      keys.push(key)
    }
    return keys
  }

  for (const action of SHORTCUT_ACTIONS) {
    const keys = take(source[action.id], action.keys)
    keys.forEach((key) => used.add(key))
    result[action.id] = keys
  }
  return result
}

export function actionForKey(bindings: ShortcutBindings, key: string): ShortcutActionId | null {
  const normalized = normalizeKey(key)
  for (const action of SHORTCUT_ACTIONS) {
    if ((bindings[action.id] ?? []).includes(normalized)) return action.id
  }
  return null
}

export interface RebindResult {
  ok: boolean
  bindings: ShortcutBindings
  /** 键冲突时给出占用者的名字 */
  conflictLabel?: string
}

export function rebindShortcut(
  bindings: ShortcutBindings,
  id: ShortcutActionId,
  key: string,
): RebindResult {
  const normalized = normalizeKey(key)
  if (!normalized) return { ok: false, bindings }
  for (const action of SHORTCUT_ACTIONS) {
    if (action.id !== id && (bindings[action.id] ?? []).includes(normalized)) {
      return { ok: false, bindings, conflictLabel: action.label }
    }
  }
  return { ok: true, bindings: { ...bindings, [id]: [normalized] } }
}

/** 键位提示文案，给按钮 title 用 */
export function shortcutHint(bindings: ShortcutBindings, id: ShortcutActionId): string {
  return keysLabel(bindings[id] ?? [])
}
