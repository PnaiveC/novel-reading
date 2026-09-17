import { describe, expect, it } from 'vitest'
import {
  bookmarkId,
  makeBookmark,
  normalizeBookmarks,
  removeBookmark,
  sortBookmarks,
  upsertBookmark,
} from '../../src/core/bookmarks'

describe('书签（C7）', () => {
  it('记的是章 + 段，摘录超长截断', () => {
    const bookmark = makeBookmark({
      chapterIndex: 2,
      paragraphIndex: 7,
      chapterTitle: '第三章 远行',
      text: '甲'.repeat(50),
      createdAt: 100,
    })
    expect(bookmark.id).toBe(bookmarkId(2, 7))
    expect(bookmark.chapterTitle).toBe('第三章 远行')
    expect(bookmark.excerpt).toHaveLength(37)
    expect(bookmark.excerpt.endsWith('…')).toBe(true)
  })

  it('同一个位置重复加只更新那一条，不重复长', () => {
    const first = makeBookmark({ chapterIndex: 1, paragraphIndex: 3, text: '旧', createdAt: 1 })
    const again = makeBookmark({ chapterIndex: 1, paragraphIndex: 3, text: '新', createdAt: 9 })
    const list = upsertBookmark([first], again)
    expect(list).toHaveLength(1)
    expect(list[0]?.excerpt).toBe('新')
    expect(list[0]?.createdAt).toBe(9)
  })

  it('按阅读顺序排，删掉指定的一条', () => {
    const list = [
      makeBookmark({ chapterIndex: 3, paragraphIndex: 1, createdAt: 1 }),
      makeBookmark({ chapterIndex: 1, paragraphIndex: 9, createdAt: 1 }),
      makeBookmark({ chapterIndex: 1, paragraphIndex: 2, createdAt: 1 }),
    ]
    expect(sortBookmarks(list).map((item) => item.id)).toEqual(['1:2', '1:9', '3:1'])
    expect(removeBookmark(list, '1:9')).toHaveLength(2)
  })

  it('坏数据丢掉，不让列表崩掉', () => {
    expect(normalizeBookmarks(null)).toEqual([])
    expect(normalizeBookmarks([{ id: 'x' }, 42, { chapterIndex: 1, paragraphIndex: 2 }])).toHaveLength(1)
  })
})
