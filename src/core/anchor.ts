/**
 * 从「每段底边在视口里的坐标」挑出锚点：视口顶部第一个还看得见的段落。
 * 取不到就退回最后一段，保证返回值永远是合法下标（0 ≤ index < bottoms.length）。
 */
export function pickAnchorIndex(bottoms: readonly number[], viewportTop: number): number {
  for (let i = 0; i < bottoms.length; i++) {
    if (bottoms[i] > viewportTop) return i
  }
  return Math.max(0, bottoms.length - 1)
}
