import type { Chapter } from './chapterParser'

/** 全书字符量分布：offsets[i] 是第 i 章之前的字符数，total 是全书字符数 */
export interface BookSpan {
  offsets: number[]
  total: number
}

export function computeBookSpan(chapters: readonly Chapter[]): BookSpan {
  const offsets: number[] = []
  let total = 0
  for (const chapter of chapters) {
    offsets.push(total)
    total += chapter.content.length
  }
  return { offsets, total }
}

/**
 * B6 的「全书 z%」：按字符量算，而不是按章节数——章有长有短，
 * 按章节数算会出现「读了一半还是 3%」。
 */
export function percentAt(span: BookSpan, chapterIndex: number, ratioInChapter: number): number {
  if (span.total <= 0 || !span.offsets.length) return 0
  const index = Math.min(Math.max(Math.floor(chapterIndex), 0), span.offsets.length - 1)
  const ratio = Math.min(Math.max(ratioInChapter, 0), 1)
  const chapterLength = (span.offsets[index + 1] ?? span.total) - span.offsets[index]
  const read = span.offsets[index] + chapterLength * ratio
  return Math.min(100, Math.max(0, Math.round((read / span.total) * 100)))
}

/** 底部位置提示（B6）：「第 12/237 章 · 全书 18%」 */
export function positionLabel(
  chapterIndex: number,
  chapterCount: number,
  percent: number,
  fallback = '',
): string {
  if (!chapterCount) return fallback
  return `第 ${chapterIndex + 1}/${chapterCount} 章 · 全书 ${percent}%`
}
