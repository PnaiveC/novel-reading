import { describe, expect, it } from 'vitest'
import {
  actionForKey,
  defaultShortcuts,
  keyLabel,
  keysLabel,
  normalizeKey,
  normalizeShortcuts,
  rebindShortcut,
} from '../../src/core/shortcuts'

describe('快捷键（C3）', () => {
  it('默认键位就是清单里那套：目录 d、排版 w、书签 a、最近 r', () => {
    const bindings = defaultShortcuts()
    expect(bindings.toc).toEqual(['d'])
    expect(bindings.settings).toEqual(['w'])
    expect(bindings.bookmark).toEqual(['a'])
    expect(bindings.recent).toEqual(['r'])
    expect(bindings.nextChapter).toEqual(['ArrowRight'])
    expect(bindings.pageDown).toEqual([' ', 'PageDown'])
  })

  it('键名归一化与显示：字母不分大小写，空格显示成「空格」', () => {
    expect(normalizeKey('D')).toBe('d')
    expect(normalizeKey('Spacebar')).toBe(' ')
    expect(normalizeKey('ArrowLeft')).toBe('ArrowLeft')
    expect(keyLabel('d')).toBe('D')
    expect(keyLabel('ArrowLeft')).toBe('←')
    expect(keysLabel([' ', 'PageDown'])).toBe('空格 / PgDn')
  })

  it('按事件里的键找到功能', () => {
    const bindings = defaultShortcuts()
    expect(actionForKey(bindings, 'd')).toBe('toc')
    expect(actionForKey(bindings, 'D')).toBe('toc')
    expect(actionForKey(bindings, 'PageDown')).toBe('pageDown')
    expect(actionForKey(bindings, 'q')).toBeNull()
  })

  it('改键：旧键让位给新键', () => {
    const result = rebindShortcut(defaultShortcuts(), 'toc', 'k')
    expect(result.ok).toBe(true)
    expect(result.bindings.toc).toEqual(['k'])
    expect(actionForKey(result.bindings, 'k')).toBe('toc')
    expect(actionForKey(result.bindings, 'd')).toBeNull()
  })

  it('改键撞上别人用的键就拒绝，并说清是谁占着', () => {
    const result = rebindShortcut(defaultShortcuts(), 'toc', 'w')
    expect(result.ok).toBe(false)
    expect(result.conflictLabel).toBe('排版与设置')
    expect(result.bindings.toc).toEqual(['d'])
  })

  it('存下来的坏数据 / 未知功能 / 重复键都收干净', () => {
    const bindings = normalizeShortcuts({
      toc: ['k'],
      settings: ['k'],
      unknown: ['x'],
      bookmark: 'a',
      pageDown: [' ', 'PageDown', ' '],
    })
    expect(bindings.toc).toEqual(['k'])
    // settings 自定义的 k 被 toc 占了，退回默认 w
    expect(bindings.settings).toEqual(['w'])
    expect(bindings.bookmark).toEqual(['a'])
    expect(bindings.pageDown).toEqual([' ', 'PageDown'])
    expect(Object.keys(bindings)).not.toContain('unknown')
  })
})
