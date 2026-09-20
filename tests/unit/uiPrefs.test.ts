import { describe, expect, it } from 'vitest'
import {
  clampTocWidth,
  DEFAULT_UI_PREFS,
  normalizeUiPrefs,
  TOC_WIDTH_DEFAULT,
  TOC_WIDTH_MAX,
  TOC_WIDTH_MIN,
} from '../../src/core/uiPrefs'

describe('界面偏好（C2）', () => {
  it('沉浸模式默认关，只有 true 才算开', () => {
    expect(normalizeUiPrefs(null)).toEqual(DEFAULT_UI_PREFS)
    expect(normalizeUiPrefs({ immersive: 'yes' }).immersive).toBe(false)
    expect(normalizeUiPrefs({ immersive: true }).immersive).toBe(true)
  })

  it('目录宽度：默认值、区间收口、坏数据都能读', () => {
    expect(normalizeUiPrefs({}).tocWidth).toBe(TOC_WIDTH_DEFAULT)
    expect(clampTocWidth(380)).toBe(380)
    expect(clampTocWidth(20)).toBe(TOC_WIDTH_MIN)
    expect(clampTocWidth(9999)).toBe(TOC_WIDTH_MAX)
    expect(clampTocWidth(320.6)).toBe(321)
    expect(clampTocWidth('宽')).toBe(TOC_WIDTH_DEFAULT)
    expect(clampTocWidth(Number.NaN)).toBe(TOC_WIDTH_DEFAULT)
    expect(normalizeUiPrefs({ tocWidth: 9999 }).tocWidth).toBe(TOC_WIDTH_MAX)
  })
})
