import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/core/settings'

describe('normalizeSettings（B4）', () => {
  it('什么都没有时给默认值', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('合法值原样保留', () => {
    expect(
      normalizeSettings({ fontSize: 22, lineHeight: 2.2, maxWidth: 44, paragraphSpacing: 1, indent: 0 }),
    ).toMatchObject({ fontSize: 22, lineHeight: 2.2, maxWidth: 44, paragraphSpacing: 1, indent: 0 })
  })

  it('超出范围的数值收进可用区间', () => {
    const settings = normalizeSettings({ fontSize: 200, lineHeight: 0.1, maxWidth: 4, paragraphSpacing: -3 })
    expect(settings.fontSize).toBe(30)
    expect(settings.lineHeight).toBe(1.3)
    expect(settings.maxWidth).toBe(24)
    expect(settings.paragraphSpacing).toBe(0)
  })

  it('坏数据（NaN / 未知字体 / 缩进异常）退回默认', () => {
    const settings = normalizeSettings({
      fontSize: Number.NaN,
      fontFamily: 'comic' as never,
      indent: 5 as never,
      theme: 'neon' as never,
    })
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('小数位收敛，避免滑块抖出 1.9000000000000001', () => {
    expect(normalizeSettings({ lineHeight: 1.87654 }).lineHeight).toBe(1.88)
    expect(normalizeSettings({ paragraphSpacing: 0.33333 }).paragraphSpacing).toBe(0.33)
  })
})
