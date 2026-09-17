/**
 * C4 连续阅读：同一根滚动条里连着放几章，滚到章末自然接下一章。
 * 这里只放纯计算，DOM 由界面按窗口渲染——窗口往后长不会改变上面的高度，
 * 所以滚动条不跳；裁掉上面的老章节时界面要自己补偿 scrollTop。
 */
export interface ChapterWindow {
  /** 起始章（含） */
  start: number
  /** 结束章（含） */
  end: number
}

/** 当前章后面永远留一章垫着，滚到底就能接上 */
export const WINDOW_AHEAD = 2
/** 跳转时当前章前面留一章，往回滚不空 */
export const WINDOW_BACK = 1
/** 连续读下去时最多同时渲染多少章，超过就把上面老的裁掉 */
export const WINDOW_MAX = 12
/** 裁的时候当前章前面至少留几章 */
export const WINDOW_KEEP_BACK = 3

function clampIndex(index: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.max(Math.floor(index), 0), total - 1)
}

function normalizeWindow(window: ChapterWindow, total: number): ChapterWindow {
  if (total <= 0) return { start: 0, end: 0 }
  const start = clampIndex(window.start, total)
  return { start, end: Math.max(start, clampIndex(window.end, total)) }
}

/** 跳章 / 打开书时把窗口重新摆到目标章附近 */
export function windowAround(current: number, total: number): ChapterWindow {
  const index = clampIndex(current, total)
  return normalizeWindow({ start: index - WINDOW_BACK, end: index + WINDOW_AHEAD }, total)
}

/** 读到 current 章时往后补窗口；只往后长，上面不动，所以不跳 */
export function extendedWindow(window: ChapterWindow, current: number, total: number): ChapterWindow {
  const base = normalizeWindow(window, total)
  const index = clampIndex(current, total)
  return { start: base.start, end: Math.max(base.end, Math.min(total - 1, index + WINDOW_AHEAD)) }
}

/** 窗口太长时该从哪一章开始（界面负责把上面的裁掉并补偿滚动位置） */
export function trimmedWindowStart(window: ChapterWindow, current: number, total: number): number {
  const base = normalizeWindow(window, total)
  if (base.end - base.start + 1 <= WINDOW_MAX) return base.start
  return Math.max(base.start, clampIndex(current - WINDOW_KEEP_BACK, total))
}

/** 往回读撞到窗口头时要往前补到哪一章（不用补就还是原来的 start） */
export function grownWindowStart(window: ChapterWindow, current: number, total: number): number {
  const base = normalizeWindow(window, total)
  const index = clampIndex(current, total)
  return Math.min(base.start, Math.max(0, index - WINDOW_KEEP_BACK))
}

export function isInWindow(window: ChapterWindow, index: number): boolean {
  return index >= window.start && index <= window.end
}

/** 渲染出来的段落：属于哪一章、章内第几段、底边坐标 */
export interface ParagraphBox {
  chapterIndex: number
  paragraphIndex: number
  bottom: number
}

export interface ReadingPosition {
  chapterIndex: number
  paragraphIndex: number
}

/**
 * 视口顶部第一个还看得见的段落就是当前位置（和 A4 的锚点规则一致）。
 * 一个都取不到（滚过头 / 还没布局）就退回最后一段。
 */
export function visiblePosition(
  boxes: readonly ParagraphBox[],
  viewportTop: number,
): ReadingPosition | null {
  if (!boxes.length) return null
  for (const box of boxes) {
    if (box.bottom > viewportTop) {
      return { chapterIndex: box.chapterIndex, paragraphIndex: box.paragraphIndex }
    }
  }
  const last = boxes[boxes.length - 1]!
  return { chapterIndex: last.chapterIndex, paragraphIndex: last.paragraphIndex }
}
