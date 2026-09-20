import { describe, expect, it } from 'vitest'
import { anchorScrollTop, maxScrollTop, pageTurnTop } from '../../src/core/scroll'

describe('翻页（PgDn / PgUp）', () => {
  const box = { scrollTop: 1000, clientHeight: 800, scrollHeight: 20_000 }

  it('往下 / 往上一屏，留一点重叠', () => {
    expect(pageTurnTop(box, 1)).toBe(1000 + 720)
    expect(pageTurnTop(box, -1)).toBe(1000 - 720)
  })

  it('一次只翻一屏：容器再高也不会一次翻多页', () => {
    const tall = { scrollTop: 0, clientHeight: 1200, scrollHeight: 100_000 }
    const top = pageTurnTop(tall, 1)
    expect(top).toBe(1080)
    expect(top - tall.scrollTop).toBeLessThanOrEqual(tall.clientHeight)
    expect(pageTurnTop({ ...tall, scrollTop: top }, 1) - top).toBe(1080)
  })

  it('到顶 / 到底就不动了，不越界也不弹回去', () => {
    expect(pageTurnTop({ scrollTop: 0, clientHeight: 800, scrollHeight: 20_000 }, -1)).toBe(0)
    const bottom = { scrollTop: 19_200, clientHeight: 800, scrollHeight: 20_000 }
    expect(maxScrollTop(bottom)).toBe(19_200)
    expect(pageTurnTop(bottom, 1)).toBe(19_200)
  })

  it('容器比内容还高时不动', () => {
    const tiny = { scrollTop: 0, clientHeight: 900, scrollHeight: 400 }
    expect(maxScrollTop(tiny)).toBe(0)
    expect(pageTurnTop(tiny, 1)).toBe(0)
  })
})

describe('窗口在头上补 / 裁之后的视线校正', () => {
  /** 模型：锚点在内容里的位置 anchorTop，视觉偏移 = anchorTop - scrollTop */
  function visualOffset(anchorTop: number, scrollTop: number): number {
    return anchorTop - scrollTop
  }

  it('浏览器没插手时：补多少高度就把 scrollTop 加回去', () => {
    const before = visualOffset(5000, 4000)
    const scrollTop = anchorScrollTop(4000, before, visualOffset(5000 + 2200, 4000))
    expect(scrollTop).toBe(4000 + 2200)
    expect(visualOffset(7200, scrollTop)).toBe(before)
  })

  it('裁掉上面的章节时反向补齐', () => {
    const before = visualOffset(5000, 4000)
    const scrollTop = anchorScrollTop(4000, before, visualOffset(5000 - 2300, 4000))
    expect(scrollTop).toBe(4000 - 2300)
    expect(visualOffset(2700, scrollTop)).toBe(before)
  })

  it('浏览器自己的 scroll anchoring 已经补偿过：不再重复加（翻章多翻一章的根因）', () => {
    const before = visualOffset(5000, 4000)
    // 浏览器已经把 scrollTop 顶到 6200，锚点视觉位置没变
    const scrollTop = anchorScrollTop(6200, before, visualOffset(7200, 6200))
    expect(scrollTop).toBe(6200)
    expect(visualOffset(7200, scrollTop)).toBe(before)
  })

  it('量不到（NaN）或到底时不动', () => {
    expect(anchorScrollTop(500, Number.NaN, 10)).toBe(500)
    expect(anchorScrollTop(30, 0, -80)).toBe(0)
  })
})
