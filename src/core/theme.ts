export type ThemeId = 'light' | 'sepia' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'sepia' | 'dark'

export const THEME_OPTIONS: { value: ThemeId; label: string }[] = [
  { value: 'light', label: '日间' },
  { value: 'sepia', label: '护眼（纸色）' },
  { value: 'dark', label: '夜间' },
  { value: 'auto', label: '跟随系统' },
]

/** C3 的 t 键循环顺序：日间 → 护眼 → 夜间 → 跟随系统 */
export const THEME_CYCLE: ThemeId[] = ['light', 'sepia', 'dark', 'auto']

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_CYCLE.includes(value as ThemeId)
}

export function nextTheme(current: ThemeId): ThemeId {
  const index = THEME_CYCLE.indexOf(current)
  return index >= 0 ? THEME_CYCLE[(index + 1) % THEME_CYCLE.length]! : 'light'
}

/**
 * 系统是不是深色。老浏览器 / jsdom 没有 matchMedia，拿不到就当浅色，
 * 不能让「跟随系统」把界面搞崩。
 */
export function systemPrefersDark(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/** 订阅系统配色变化，返回取消订阅函数 */
export function watchSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  if (typeof query.addEventListener !== 'function') return () => {}
  const handler = (event: MediaQueryListEvent) => onChange(event.matches)
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}

export function resolveTheme(theme: ThemeId, prefersDark = false): ResolvedTheme {
  if (theme === 'auto') return prefersDark ? 'dark' : 'light'
  return theme
}
