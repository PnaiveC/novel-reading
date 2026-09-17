import { describe, expect, it } from 'vitest'
import { THEME_OPTIONS, isThemeId, nextTheme, resolveTheme } from '../../src/core/theme'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/core/settings'

describe('主题（C1）', () => {
  it('只认四个主题，坏数据退回默认日间', () => {
    expect(isThemeId('sepia')).toBe(true)
    expect(isThemeId('neon')).toBe(false)
    expect(normalizeSettings({ theme: 'neon' as never }).theme).toBe(DEFAULT_SETTINGS.theme)
    expect(normalizeSettings({ theme: 'auto' }).theme).toBe('auto')
  })

  it('t 键循环：日间 → 护眼 → 夜间 → 跟随系统 → 日间', () => {
    expect(THEME_OPTIONS.map((item) => item.value)).toEqual(['light', 'sepia', 'dark', 'auto'])
    expect(nextTheme('light')).toBe('sepia')
    expect(nextTheme('sepia')).toBe('dark')
    expect(nextTheme('dark')).toBe('auto')
    expect(nextTheme('auto')).toBe('light')
  })

  it('跟随系统按系统深浅解析，其余原样', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
    expect(resolveTheme('sepia', true)).toBe('sepia')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
