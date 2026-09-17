import { describe, expect, it } from 'vitest'
import { formatStamp } from '../../src/core/time'

describe('时间显示（C5 / C7 列表用）', () => {
  const now = new Date(2026, 8, 17, 20, 5).getTime()

  it('今天只给时分，昨天给「昨天」，更早给日期', () => {
    expect(formatStamp(new Date(2026, 8, 17, 8, 3).getTime(), now)).toBe('08:03')
    expect(formatStamp(new Date(2026, 8, 16, 22, 0).getTime(), now)).toBe('昨天')
    expect(formatStamp(new Date(2026, 8, 10, 9, 0).getTime(), now)).toBe('09-10')
    expect(formatStamp(new Date(2025, 11, 31, 9, 0).getTime(), now)).toBe('2025-12-31')
  })

  it('没有时间戳就不显示，不显示 1970', () => {
    expect(formatStamp(0, now)).toBe('')
    expect(formatStamp(Number.NaN, now)).toBe('')
  })
})
