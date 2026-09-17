export interface Bookmark {
  /** 书签认位置（章 + 段）：同一处重复加只更新时间，不会长出两条 */
  id: string
  chapterIndex: number
  paragraphIndex: number
  chapterTitle: string
  excerpt: string
  createdAt: number
}

export const EXCERPT_LENGTH = 36

export function bookmarkId(chapterIndex: number, paragraphIndex: number): string {
  return `${chapterIndex}:${paragraphIndex}`
}

export function makeBookmark(input: {
  chapterIndex: number
  paragraphIndex: number
  chapterTitle?: string
  text?: string
  createdAt: number
}): Bookmark {
  const chapterIndex = Number.isFinite(input.chapterIndex)
    ? Math.max(0, Math.floor(input.chapterIndex))
    : 0
  const paragraphIndex = Number.isFinite(input.paragraphIndex)
    ? Math.max(0, Math.floor(input.paragraphIndex))
    : 0
  const text = (input.text ?? '').trim()
  return {
    id: bookmarkId(chapterIndex, paragraphIndex),
    chapterIndex,
    paragraphIndex,
    chapterTitle: input.chapterTitle ?? '',
    excerpt: text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text,
    createdAt: input.createdAt,
  }
}

/** 按阅读顺序排：章节在前，同章按段落 */
export function sortBookmarks(list: readonly Bookmark[]): Bookmark[] {
  return [...list].sort(
    (a, b) =>
      a.chapterIndex - b.chapterIndex ||
      a.paragraphIndex - b.paragraphIndex ||
      a.createdAt - b.createdAt,
  )
}

export function upsertBookmark(list: readonly Bookmark[], bookmark: Bookmark): Bookmark[] {
  return sortBookmarks([...list.filter((item) => item.id !== bookmark.id), bookmark])
}

export function removeBookmark(list: readonly Bookmark[], id: string): Bookmark[] {
  return list.filter((item) => item.id !== id)
}

/** 存下来的东西不可信：字段缺、类型错都丢掉，不让列表崩掉 */
export function normalizeBookmarks(input: unknown): Bookmark[] {
  if (!Array.isArray(input)) return []
  const result: Bookmark[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Partial<Bookmark>
    if (typeof raw.chapterIndex !== 'number' || typeof raw.paragraphIndex !== 'number') continue
    const id =
      typeof raw.id === 'string' && raw.id ? raw.id : bookmarkId(raw.chapterIndex, raw.paragraphIndex)
    if (seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      chapterIndex: Math.max(0, Math.floor(raw.chapterIndex)),
      paragraphIndex: Math.max(0, Math.floor(raw.paragraphIndex)),
      chapterTitle: typeof raw.chapterTitle === 'string' ? raw.chapterTitle : '',
      excerpt: typeof raw.excerpt === 'string' ? raw.excerpt : '',
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    })
  }
  return sortBookmarks(result)
}
