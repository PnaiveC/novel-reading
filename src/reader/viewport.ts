import {
  extendedWindow,
  grownWindowStart,
  trimmedWindowStart,
  visiblePosition,
  windowAround,
  type ChapterWindow,
  type ParagraphBox,
  type ReadingPosition,
} from '../core/continuous'
import { anchorScrollTop, pageTurnTop } from '../core/scroll'

export type { ChapterWindow, ReadingPosition }

export interface ReadingViewportOptions {
  /** 正文滚动区（`.reader`）。module 自己测量、自己改章节窗口、自己补偿 scrollTop */
  container: HTMLElement
  /** 章节总数。换书 / 切编码都会变，所以用 getter 而不是数字 */
  chapterCount: () => number
  /** 章节窗口变化后等界面渲染完再测量；App 传 Vue 的 nextTick */
  afterRender?: () => Promise<void>
  nextFrame?: (callback: () => void) => number
  cancelFrame?: (handle: number) => void
}

/**
 * N1：阅读视口。读懂「读到哪儿」只需要这一个 interface——
 * 它把滚动坐标算成阅读位置（章节 + 段落锚点），也把阅读位置摆成滚动坐标，
 * 中间那些测量、章节窗口、`restoring` 标记都是它自己的事。
 *
 * 三条 C4 滚动规则（见 docs/adr/0001）住在这里，别拆开：
 * 补 / 裁窗口后按锚点元素量校正 scrollTop、跳章时窗口一次摆到位、overflow-anchor 两边不抢。
 */
export interface ReadingViewport {
  /** 落位：段落锚点 0 连章节标题一起顶到顶部，> 0 就落到那一段 */
  jumpTo(chapterIndex: number, paragraphIndex: number): Promise<void>
  /** 本章开头 / 结尾（Home / End） */
  chapterStart(): void
  chapterEnd(): void
  /** 翻页：最多一屏，不越过上下边界（PgDn / PgUp） */
  turnPage(direction: 1 | -1): void
  /** 立刻按当前滚动位置同步一次（切后台 / 卸载前 flush） */
  syncPosition(): void
  /** 该渲染哪几章 */
  chapterWindow(): ChapterWindow
  onPosition(listener: (position: ReadingPosition) => void): () => void
  /** 订阅时先回调一次当前窗口，免得调用方自己再读一遍 */
  onWindowChange(listener: (window: ChapterWindow) => void): () => void
  destroy(): void
}

export function createReadingViewport(options: ReadingViewportOptions): ReadingViewport {
  const container = options.container
  const chapterCount = options.chapterCount
  const afterRender = options.afterRender ?? (() => Promise.resolve())
  const nextFrame = options.nextFrame ?? ((callback) => requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle))

  const positionListeners = new Set<(position: ReadingPosition) => void>()
  const windowListeners = new Set<(window: ChapterWindow) => void>()

  let window: ChapterWindow = { start: 0, end: 0 }
  let position: ReadingPosition = { chapterIndex: 0, paragraphIndex: 0 }
  /** 程序性滚动 / 补裁补偿期间不要把中间态当成用户位置写进进度 */
  let restoring = false
  /** 滚动同步的节流帧 */
  let syncFrame = 0
  /** 等布局稳定的两帧（记着才能取消，卸载后不留回调） */
  const heldFrames = new Set<number>()
  let destroyed = false

  // 补偿由这边负责，就别让浏览器再补一次（ADR-0001 第 3 条）。
  // App.vue 的 .reader 上也有同一条声明，管 JS 跑起来之前的首屏。
  container.style.setProperty('overflow-anchor', 'none')

  function scheduleFrame(callback: () => void): number {
    let handle = 0
    handle = nextFrame(() => {
      heldFrames.delete(handle)
      callback()
    })
    heldFrames.add(handle)
    return handle
  }

  /** 程序性滚动后按住两帧：等布局稳定，别把中间态当成用户位置 */
  function holdRestore(): void {
    restoring = true
    scheduleFrame(() => {
      scheduleFrame(() => {
        restoring = false
      })
    })
  }

  /** 视口里每段正文的底边坐标：段落锚点就从这里反推 */
  function paragraphBoxes(): ParagraphBox[] {
    const boxes: ParagraphBox[] = []
    container.querySelectorAll<HTMLElement>('[data-p]').forEach((node) => {
      const section = node.closest<HTMLElement>('[data-chapter]')
      if (!section) return
      boxes.push({
        chapterIndex: Number(section.dataset.chapter ?? 0),
        paragraphIndex: Number(node.dataset.p ?? 0),
        bottom: node.getBoundingClientRect().bottom,
      })
    })
    return boxes
  }

  function sectionOf(chapterIndex: number): HTMLElement | null {
    return container.querySelector<HTMLElement>(`[data-chapter="${chapterIndex}"]`)
  }

  /** 章节顶边在内容坐标里的位置（跳章 / 章首章末落位都用它） */
  function sectionTop(section: HTMLElement): number {
    return (
      section.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    )
  }

  /** 视口顶部第一个还看得见的元素（章节标题或段落）：拿它当锚点校正滚动 */
  function pickAnchor(): HTMLElement | null {
    const top = container.getBoundingClientRect().top
    for (const node of container.querySelectorAll<HTMLElement>('[data-chapter] > *')) {
      if (node.getBoundingClientRect().bottom > top) return node
    }
    return null
  }

  function anchorOffset(node: HTMLElement): number {
    return node.getBoundingClientRect().top - container.getBoundingClientRect().top
  }

  function reportPosition(next: ReadingPosition): void {
    if (next.chapterIndex === position.chapterIndex && next.paragraphIndex === position.paragraphIndex) {
      return
    }
    position = next
    for (const listener of positionListeners) listener(next)
  }

  function setWindow(next: ChapterWindow): void {
    if (next.start === window.start && next.end === window.end) return
    window = next
    for (const listener of windowListeners) listener(next)
  }

  /**
   * 在窗口头上补 / 裁章节。按锚点元素把视线钉回原处：
   * 浏览器自己的 scroll anchoring 先动过手时不重复加，没动手时正好补齐（ADR-0001 第 1 条）。
   */
  async function moveWindowStart(nextStart: number): Promise<void> {
    if (nextStart === window.start) return
    const anchor = pickAnchor()
    const offsetBefore = anchor ? anchorOffset(anchor) : 0
    setWindow({ ...window, start: nextStart })
    await afterRender()
    if (anchor?.isConnected) {
      container.scrollTop = anchorScrollTop(container.scrollTop, offsetBefore, anchorOffset(anchor))
    }
    holdRestore()
  }

  /**
   * 按当前章把渲染窗口补到两头——往后长保证滚到章末直接接上下一章，
   * 往前长保证往回滚不会撞到「窗口头」。
   */
  async function ensureWindow(anchor: number): Promise<void> {
    const total = chapterCount()
    if (!total) return
    const extended = extendedWindow(window, anchor, total)
    if (extended.end !== window.end) setWindow({ ...window, end: extended.end })
    const backStart = grownWindowStart(window, anchor, total)
    if (backStart < window.start) await moveWindowStart(backStart)
    const trimStart = trimmedWindowStart(window, anchor, total)
    if (trimStart > window.start) await moveWindowStart(trimStart)
  }

  /** 落位：段落锚点 0 时连章节标题一起顶到顶部，> 0 时把那一段顶到顶部 */
  function placeAt(chapterIndex: number, paragraphIndex: number): void {
    const section = sectionOf(chapterIndex)
    const node =
      paragraphIndex > 0
        ? section?.querySelectorAll<HTMLElement>('[data-p]')[paragraphIndex]
        : null
    container.scrollTop = node ? sectionTop(node) : section ? sectionTop(section) : 0
  }

  function syncPosition(): void {
    if (restoring || destroyed) return
    if (!container.clientHeight) return
    const next = visiblePosition(paragraphBoxes(), container.getBoundingClientRect().top)
    if (!next) return
    reportPosition(next)
    void ensureWindow(next.chapterIndex)
  }

  function onScroll(): void {
    if (restoring || syncFrame) return
    syncFrame = nextFrame(() => {
      syncFrame = 0
      syncPosition()
    })
  }

  async function jumpTo(chapterIndex: number, paragraphIndex: number): Promise<void> {
    position = { chapterIndex, paragraphIndex }
    setWindow(windowAround(chapterIndex, chapterCount()))
    await afterRender()
    placeAt(chapterIndex, paragraphIndex)
    holdRestore()
    await ensureWindow(chapterIndex)
  }

  function chapterStart(): void {
    const section = sectionOf(position.chapterIndex)
    if (!section) return
    container.scrollTop = sectionTop(section)
    holdRestore()
  }

  function chapterEnd(): void {
    const next = sectionOf(position.chapterIndex + 1)
    if (!next) {
      container.scrollTop = container.scrollHeight
      holdRestore()
      return
    }
    container.scrollTop = Math.max(0, sectionTop(next) - 1)
    holdRestore()
  }

  function turnPage(direction: 1 | -1): void {
    container.scrollTop = pageTurnTop(
      {
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
      },
      direction,
    )
    syncPosition()
  }

  container.addEventListener('scroll', onScroll, { passive: true })

  return {
    jumpTo,
    chapterStart,
    chapterEnd,
    turnPage,
    syncPosition,
    chapterWindow: () => ({ ...window }),
    onPosition(listener) {
      positionListeners.add(listener)
      return () => positionListeners.delete(listener)
    },
    onWindowChange(listener) {
      windowListeners.add(listener)
      listener({ ...window })
      return () => windowListeners.delete(listener)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      container.removeEventListener('scroll', onScroll)
      if (syncFrame) cancelFrame(syncFrame)
      syncFrame = 0
      for (const handle of heldFrames) cancelFrame(handle)
      heldFrames.clear()
      positionListeners.clear()
      windowListeners.clear()
    },
  }
}
