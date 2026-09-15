import { describe, expect, it } from 'vitest'
import { parseChapters } from '../../src/core/chapterParser'
import { computeBookSpan, percentAt, positionLabel } from '../../src/core/position'

const CHAPTERS = parseChapters('第一章 开头\n' + '一'.repeat(90) + '\n第二章 结尾\n' + '二'.repeat(10) + '\n')

describe('computeBookSpan', () => {
  it('记下每章起点与全书字符量', () => {
    const span = computeBookSpan(CHAPTERS)
    expect(span.offsets).toHaveLength(2)
    expect(span.offsets[0]).toBe(0)
    expect(span.offsets[1]).toBe(CHAPTERS[0].content.length)
    expect(span.total).toBe(CHAPTERS[0].content.length + CHAPTERS[1].content.length)
  })

  it('没有章节时总量为 0', () => {
    expect(computeBookSpan([])).toEqual({ offsets: [], total: 0 })
  })
})

describe('percentAt（B6 的全书百分比）', () => {
  const span = computeBookSpan(CHAPTERS)

  it('开头 0%、最后一章读完 100%', () => {
    expect(percentAt(span, 0, 0)).toBe(0)
    expect(percentAt(span, 1, 1)).toBe(100)
  })

  it('长章过半时百分比也跟着过半（按字符量而不是按章节数）', () => {
    const percent = percentAt(span, 0, 0.5)
    expect(percent).toBeGreaterThan(40)
    expect(percent).toBeLessThan(50)
  })

  it('越界的下标与比例都夹住，不返回负数或超过 100', () => {
    expect(percentAt(span, -5, -1)).toBe(0)
    expect(percentAt(span, 99, 3)).toBe(100)
    expect(percentAt({ offsets: [], total: 0 }, 0, 1)).toBe(0)
  })
})

describe('positionLabel', () => {
  it('拼出「第 x/y 章 · 全书 z%」', () => {
    expect(positionLabel(2, 237, 18)).toBe('第 3/237 章 · 全书 18%')
  })

  it('没有章节时退回空串', () => {
    expect(positionLabel(0, 0, 0)).toBe('')
  })
})
