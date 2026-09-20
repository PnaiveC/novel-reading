/**
 * 滚动相关的纯计算：翻页步长、窗口在头上补 / 裁之后的视线校正。
 * 只做数字，不碰 DOM，方便单测把「浏览器自己的 scroll anchoring」也模拟进来。
 */

export interface ScrollMetrics {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

/** 一屏翻页留一点重叠，越过章末时还能看见上一页的最后一行 */
export const PAGE_OVERLAP = 0.9
/** 容器再矮也至少挪这么多，免得「按了没反应」 */
export const PAGE_MIN_STEP = 80

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function maxScrollTop(metrics: ScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight)
}

/**
 * 翻一页：最多一屏（不会一次翻多页），不越过顶部 / 底部。
 */
export function pageTurnTop(
  metrics: ScrollMetrics,
  direction: 1 | -1,
  ratio = PAGE_OVERLAP,
): number {
  const step = Math.max(PAGE_MIN_STEP, Math.round(metrics.clientHeight * ratio))
  return clamp(metrics.scrollTop + direction * step, 0, maxScrollTop(metrics))
}

/**
 * 窗口在头上补 / 裁章节之后，把视线钉回原处的 scrollTop。
 *
 * `offset` 是锚点元素相对容器上沿的位置（getBoundingClientRect().top 之差）。
 * 浏览器自己的 scroll anchoring 先动过手时 after ≈ before，这里就不再重复加，
 * 不会出现「补一次章节、视线跳一章」。
 */
export function anchorScrollTop(
  scrollTop: number,
  offsetBefore: number,
  offsetAfter: number,
): number {
  if (!Number.isFinite(offsetBefore) || !Number.isFinite(offsetAfter)) return scrollTop
  return Math.max(0, scrollTop + (offsetAfter - offsetBefore))
}
