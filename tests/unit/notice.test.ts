import { describe, expect, it } from 'vitest'
import { createNoticeBoard, type NoticeState, type TimerHandle } from '../../src/core/notice'

/** 手动时钟：什么时候「到点」由测试说了算 */
function fakeClock() {
  let nextId = 1
  let timers: Array<{ id: number; callback: () => void; delayMs: number }> = []
  const cancelled: TimerHandle[] = []
  return {
    schedule: (callback: () => void, delayMs: number): TimerHandle => {
      const id = nextId++
      timers.push({ id, callback, delayMs })
      return id
    },
    cancel: (handle: TimerHandle): void => {
      cancelled.push(handle)
      timers = timers.filter((timer) => timer.id !== handle)
    },
    runDue: (): void => {
      const pending = timers
      timers = []
      for (const timer of pending) timer.callback()
    },
    pending: (): number => timers.length,
    delays: (): number[] => timers.map((timer) => timer.delayMs),
    cancelled,
  }
}

describe('「刚发生了什么」收成一个记账处（N4）', () => {
  it('状况：设了就有、清掉就没，同一句话重复设不再通知', () => {
    const board = createNoticeBoard()
    const seen: NoticeState[] = []
    board.subscribe((state) => seen.push({ ...state }))

    board.setNotice('正文看着像乱码')
    board.setNotice('正文看着像乱码')
    board.setNotice(null)

    expect(seen.map((state) => state.notice)).toEqual([null, '正文看着像乱码', null])
  })

  it('回执：说一句就有，到点自己消失', () => {
    const clock = fakeClock()
    const board = createNoticeBoard({
      schedule: clock.schedule,
      cancel: clock.cancel,
      receiptTtlMs: 3000,
    })

    board.flash('已加书签')
    expect(board.state().receipt).toBe('已加书签')
    expect(clock.delays()).toEqual([3000])

    clock.runDue()
    expect(board.state().receipt).toBeNull()
  })

  it('两格互不顶替：状况不被回执顶掉，回执也不被状况顶掉', () => {
    const clock = fakeClock()
    const board = createNoticeBoard({ schedule: clock.schedule, cancel: clock.cancel })
    board.setNotice('本书没能存到本机')

    board.flash('已加书签')
    expect(board.state()).toEqual({ notice: '本书没能存到本机', receipt: '已加书签' })

    board.setNotice('正文看着像乱码')
    expect(board.state()).toEqual({ notice: '正文看着像乱码', receipt: '已加书签' })
  })

  it('换一条回执重新计时，不越堆越多', () => {
    const clock = fakeClock()
    const board = createNoticeBoard({ schedule: clock.schedule, cancel: clock.cancel })

    board.flash('第一条')
    board.flash('第二条')

    expect(clock.pending()).toBe(1)
    expect(clock.cancelled).toHaveLength(1)
    expect(board.state().receipt).toBe('第二条')
  })

  it('订阅先给一次当前状态，退订之后不再收到', () => {
    const board = createNoticeBoard()
    board.setNotice('乱码')
    const seen: Array<string | null> = []
    const stop = board.subscribe((state) => seen.push(state.notice))

    stop()
    board.setNotice(null)

    expect(seen).toEqual(['乱码'])
  })

  it('clear 两格都清；destroy 之后不再回调、定时器也不留', () => {
    const clock = fakeClock()
    const board = createNoticeBoard({ schedule: clock.schedule, cancel: clock.cancel })
    const seen: NoticeState[] = []
    board.subscribe((state) => seen.push({ ...state }))

    board.setNotice('乱码')
    board.flash('已加书签')
    board.clear()
    expect(board.state()).toEqual({ notice: null, receipt: null })
    expect(clock.pending()).toBe(0)

    board.flash('这个键被占了')
    board.destroy()
    expect(clock.pending()).toBe(0)

    const before = seen.length
    board.flash('再来一句')
    expect(seen).toHaveLength(before)
    expect(board.state().receipt).toBeNull()
  })
})
