import { describe, expect, it } from 'vitest'
import {
  createReadingViewport,
  type ChapterWindow,
  type ReadingPosition,
  type ReadingViewport,
} from '../../src/reader/viewport'
import { createFrameQueue, createReaderLayout, settle, type ReaderLayout } from '../helpers/layout'

interface Context {
  layout: ReaderLayout
  frames: ReturnType<typeof createFrameQueue>
  viewport: ReadingViewport
  positions: ReadingPosition[]
  windows: ChapterWindow[]
}

/** 测试扮演 App + Vue 的那一半：订阅窗口变化就重建 DOM、订阅位置上报告就记账 */
function openViewport(chapters = 40): Context {
  const layout = createReaderLayout({ chapters })
  const frames = createFrameQueue()
  const positions: ReadingPosition[] = []
  const windows: ChapterWindow[] = []
  const viewport = createReadingViewport({
    container: layout.container,
    chapterCount: () => layout.chapterCount,
    afterRender: async () => {},
    nextFrame: frames.nextFrame,
    cancelFrame: frames.cancelFrame,
  })
  viewport.onWindowChange((next) => {
    windows.push({ ...next })
    layout.render(next)
  })
  viewport.onPosition((next) => positions.push({ ...next }))
  return { layout, frames, viewport, positions, windows }
}

/** 把跳转 / 补偿留下的「两帧保持」放掉，回到能接受用户滚动的状态 */
function drain(context: Context): void {
  let guard = 0
  while (context.frames.pending() && guard++ < 20) context.frames.flush(1)
}

/** 读到某章开头：滚过去 → 派发 scroll → 跑节流帧 → 等 async 收敛 */
async function readTo(context: Context, chapterIndex: number): Promise<void> {
  drain(context)
  context.layout.scrollTo(context.layout.contentTopOfSection(chapterIndex))
  context.layout.scrollEvent()
  context.frames.flush(1)
  await settle()
}

/** 一路往后读，直到窗口撑到 12 章（再读一步就会裁） */
async function fillWindow(context: Context): Promise<void> {
  let guard = 0
  while (context.viewport.chapterWindow().end < 18 && guard++ < 20) {
    await readTo(context, context.viewport.chapterWindow().end + 1)
  }
  expect(context.viewport.chapterWindow()).toEqual({ start: 7, end: 18 })
}

describe('阅读视口：窗口与滚动补偿（C4 + ADR-0001）', () => {
  it('订阅窗口变化时先拿到当前窗口', () => {
    const layout = createReaderLayout()
    const viewport = createReadingViewport({
      container: layout.container,
      chapterCount: () => layout.chapterCount,
    })
    const seen: ChapterWindow[] = []
    viewport.onWindowChange((next) => seen.push({ ...next }))
    expect(seen).toEqual([{ start: 0, end: 0 }])
    viewport.destroy()
  })

  it('跳到某章：窗口一次摆到位，紧接着的同步不会再动窗口头', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(10, 0)
    expect(context.viewport.chapterWindow()).toEqual({ start: 7, end: 12 })
    expect(context.layout.visualTop({ chapterIndex: 10, paragraphIndex: null })).toBe(0)

    await readTo(context, 10)
    // 「跳章后又往窗口头补一章」正是翻章多翻一章的根因，这里必须一动不动
    expect(context.viewport.chapterWindow()).toEqual({ start: 7, end: 12 })
    expect(context.layout.scrollTop()).toBe(context.layout.contentTopOfSection(10))
  })

  it('往后读只补后面：上面的高度不变，scrollTop 一动不动', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(2, 0)
    drain(context)
    const target = context.layout.contentTopOfSection(3)

    await readTo(context, 3)
    expect(context.viewport.chapterWindow()).toEqual({ start: 0, end: 5 })
    expect(context.layout.scrollTop()).toBe(target)
  })

  it('往回滚撞到窗口头：把前面补回来，视线钉在原处', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(10, 0)
    drain(context)

    const row = { chapterIndex: 8, paragraphIndex: 0 }
    context.layout.scrollTo(context.layout.contentTopOfSection(8))
    const visualBefore = context.layout.visualTop(row)
    const scrollBefore = context.layout.scrollTop()

    context.layout.scrollEvent()
    context.frames.flush(1)
    await settle()

    expect(context.viewport.chapterWindow().start).toBe(5)
    expect(context.layout.scrollTop()).toBe(scrollBefore + 2 * context.layout.chapterHeight)
    expect(context.layout.visualTop(row)).toBe(visualBefore)
  })

  it('裁掉上面的老章节：按锚点元素量补 scrollTop，视线不动', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(10, 0)
    drain(context)
    await fillWindow(context)

    // 先把视口滚到底（12 章满窗），再走一步同步：这一步会把窗口撑到 13 章 → 触发裁
    context.layout.scrollTo(Number.MAX_SAFE_INTEGER)
    const row = context.layout.topRow()!
    const visualBefore = context.layout.visualTop(row)
    const scrollBefore = context.layout.scrollTop()

    context.layout.scrollEvent()
    context.frames.flush(1)
    await settle()
    expect(context.viewport.chapterWindow().start).toBe(14)
    expect(context.layout.scrollTop()).toBe(scrollBefore - 7 * context.layout.chapterHeight)
    expect(context.layout.visualTop(row)).toBe(visualBefore)
  })

  it('浏览器自己已经补过（scroll anchoring 开着）：这里不再补第二次', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(10, 0)
    drain(context)
    await fillWindow(context)

    context.layout.scrollTo(Number.MAX_SAFE_INTEGER)
    const row = context.layout.topRow()!
    const visualBefore = context.layout.visualTop(row)
    const scrollBefore = context.layout.scrollTop()
    context.layout.armBrowserAnchoring(row)
    try {
      context.layout.scrollEvent()
      context.frames.flush(1)
      await settle()
    } finally {
      context.layout.disarmBrowserAnchoring()
    }

    // 浏览器补过一次就到位；再补第二次就会把视线顶跑（翻章多翻一章的老 bug）
    expect(context.viewport.chapterWindow().start).toBe(14)
    expect(context.layout.scrollTop()).toBe(scrollBefore - 7 * context.layout.chapterHeight)
    expect(context.layout.visualTop(row)).toBe(visualBefore)
  })

  it('落位：段落锚点 0 连章节标题一起顶到顶部，> 0 就落到那一段', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(3, 0)
    expect(context.layout.visualTop({ chapterIndex: 3, paragraphIndex: null })).toBe(0)
    expect(context.layout.visualTop({ chapterIndex: 3, paragraphIndex: 0 })).toBeGreaterThan(0)

    await context.viewport.jumpTo(3, 4)
    expect(context.layout.visualTop({ chapterIndex: 3, paragraphIndex: 4 })).toBe(0)
    expect(context.layout.visualTop({ chapterIndex: 3, paragraphIndex: null })).toBeLessThan(0)
  })

  it('翻页一次一屏，往回一屏回到原处', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(10, 0)
    drain(context)
    await fillWindow(context)
    context.layout.scrollTo(context.layout.contentTopOfSection(12))
    const height = context.layout.viewportHeight
    const from = context.layout.scrollTop()

    context.viewport.turnPage(1)
    const down = context.layout.scrollTop()
    expect(down - from).toBe(Math.round(height * 0.9))
    expect(down - from).toBeLessThanOrEqual(height)

    context.viewport.turnPage(-1)
    expect(context.layout.scrollTop()).toBe(from)
  })

  it('到顶 / 到底翻页就不动了，不越界也不弹回去', async () => {
    // 只有 4 章：窗口一次就把全书装下，翻到底不会再把窗口撑大
    const context = openViewport(4)
    await context.viewport.jumpTo(3, 0)
    drain(context)

    const bottom = context.layout.scrollTop()
    context.viewport.turnPage(1)
    expect(context.layout.scrollTop()).toBe(bottom)

    context.layout.scrollTo(0)
    context.viewport.turnPage(-1)
    expect(context.layout.scrollTop()).toBe(0)
    await settle()
  })

  it('程序性滚动的中间态不上报位置，稳定之后才报，且同一个位置只报一次', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(6, 0)

    // 落位后两帧之内：浏览器派发的 scroll 不算用户位置（否则会把中间态写进进度）
    context.layout.scrollEvent()
    context.frames.flush(1)
    await settle()
    expect(context.positions).toEqual([])
    context.frames.flush(1)
    await settle()
    expect(context.positions).toEqual([])

    // 稳定之后滚到别处才上报（落位本身不上报：调用方本来就知道跳到哪）
    context.layout.scrollTo(context.layout.contentTopOfSection(7))
    context.layout.scrollEvent()
    context.frames.flush(1)
    await settle()
    expect(context.positions).toEqual([{ chapterIndex: 7, paragraphIndex: 0 }])

    context.layout.scrollEvent()
    context.frames.flush(1)
    await settle()
    expect(context.positions).toHaveLength(1)
  })

  it('destroy 之后：滚动不再被听见，没跑的帧也不留', async () => {
    const context = openViewport()
    await context.viewport.jumpTo(6, 0)
    context.viewport.destroy()
    expect(context.frames.pending()).toBe(0)

    context.layout.scrollEvent()
    context.frames.flush(2)
    await settle()
    expect(context.positions).toEqual([])
    expect(context.viewport.chapterWindow()).toEqual({ start: 3, end: 8 })
    expect(() => context.viewport.destroy()).not.toThrow()
  })
})
