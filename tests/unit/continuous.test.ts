import { describe, expect, it } from 'vitest'
import {
  extendedWindow,
  grownWindowStart,
  isInWindow,
  trimmedWindowStart,
  visiblePosition,
  windowAround,
} from '../../src/core/continuous'

describe('连续阅读窗口（C4）', () => {
  it('跳章时当前章前后各留一点，翻页不空', () => {
    expect(windowAround(0, 10)).toEqual({ start: 0, end: 2 })
    expect(windowAround(5, 10)).toEqual({ start: 4, end: 7 })
    expect(windowAround(9, 10)).toEqual({ start: 8, end: 9 })
  })

  it('往后读只补后面，上面不动——滚动条因此不跳', () => {
    const current = windowAround(0, 20)
    const next = extendedWindow(current, 3, 20)
    expect(next.start).toBe(current.start)
    expect(next.end).toBe(5)
  })

  it('窗口太长时给出该裁到哪一章', () => {
    const window = { start: 0, end: 12 }
    expect(trimmedWindowStart(window, 10, 30)).toBe(7)
    expect(trimmedWindowStart({ start: 5, end: 8 }, 6, 30)).toBe(5)
  })

  it('往回读撞到窗口头时往前补，不补就原样', () => {
    expect(grownWindowStart({ start: 5, end: 8 }, 6, 30)).toBe(3)
    expect(grownWindowStart({ start: 0, end: 3 }, 1, 30)).toBe(0)
    expect(grownWindowStart({ start: 12, end: 15 }, 14, 30)).toBe(11)
  })

  it('视口顶部第一个还看得见的段落就是当前位置', () => {
    const boxes = [
      { chapterIndex: 1, paragraphIndex: 0, bottom: -10 },
      { chapterIndex: 1, paragraphIndex: 1, bottom: 20 },
      { chapterIndex: 2, paragraphIndex: 0, bottom: 120 },
    ]
    expect(visiblePosition(boxes, 0)).toEqual({ chapterIndex: 1, paragraphIndex: 1 })
    expect(visiblePosition(boxes, 100)).toEqual({ chapterIndex: 2, paragraphIndex: 0 })
    // 滚过头就停在最后一段，不返回空
    expect(visiblePosition(boxes, 999)).toEqual({ chapterIndex: 2, paragraphIndex: 0 })
    expect(visiblePosition([], 0)).toBeNull()
  })

  it('isInWindow 判断跳转目标要不要重摆窗口', () => {
    const window = { start: 4, end: 7 }
    expect(isInWindow(window, 4)).toBe(true)
    expect(isInWindow(window, 8)).toBe(false)
  })
})
