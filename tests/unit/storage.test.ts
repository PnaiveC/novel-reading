import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStorage,
  fileKey,
  loadBookmarks,
  loadShortcuts,
  loadProgress,
  loadSettings,
  loadUiPrefs,
  removeBookmarks,
  saveBookmarks,
  saveProgress,
  saveShortcuts,
  saveSettings,
  saveUiPrefs,
} from '../../src/core/storage'

beforeEach(() => {
  clearStorage()
})

describe('storage', () => {
  it('进度保存与读取', () => {
    const key = fileKey('novel.txt', 12345)
    saveProgress(key, { chapterIndex: 3, paragraphIndex: 8, updatedAt: 111 })
    expect(loadProgress(key)).toEqual({ chapterIndex: 3, paragraphIndex: 8, updatedAt: 111 })
    expect(loadProgress('missing')).toBeNull()
  })

  it('v1 老记录（没有段落锚点）读出来补 0', () => {
    const key = fileKey('v1.txt', 1)
    window.localStorage.setItem(
      `novel-reading:progress:${key}`,
      JSON.stringify({ chapterIndex: 5, updatedAt: 1 }),
    )
    expect(loadProgress(key)).toEqual({ chapterIndex: 5, paragraphIndex: 0, updatedAt: 1 })
  })

  it('设置保存与读取', () => {
    const settings = {
      fontSize: 20,
      lineHeight: 2,
      maxWidth: 40,
      paragraphSpacing: 0.8,
      indent: 0 as const,
      fontFamily: 'kai' as const,
      theme: 'dark' as const,
    }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
  })

  it('v1 留下的旧设置（缺新字段）读出来补齐默认值', () => {
    window.localStorage.setItem('novel-reading:settings', JSON.stringify({ fontSize: 20, theme: 'dark' }))
    expect(loadSettings()).toMatchObject({
      fontSize: 20,
      theme: 'dark',
      fontFamily: 'song',
      indent: 2,
      paragraphSpacing: 0.55,
    })
  })

  it('设置里的坏 JSON 当作没设置过', () => {
    window.localStorage.setItem('novel-reading:settings', '{不是 JSON')
    expect(loadSettings()).toBeNull()
  })

  it('进度带上章节总数与百分比（C5 最近列表要显示）', () => {
    saveProgress('book-1', { chapterIndex: 2, paragraphIndex: 4, updatedAt: 5, chapterCount: 30, percent: 12 })
    expect(loadProgress('book-1')).toEqual({
      chapterIndex: 2,
      paragraphIndex: 4,
      updatedAt: 5,
      chapterCount: 30,
      percent: 12,
    })
  })

  it('快捷键：存一套改过的，读回来还是那套；坏 JSON 退回默认', () => {
    saveShortcuts({ ...loadShortcuts(), toc: ['k'] })
    expect(loadShortcuts().toc).toEqual(['k'])
    window.localStorage.setItem('novel-reading:shortcuts', '{坏 JSON')
    expect(loadShortcuts().toc).toEqual(['d'])
  })

  it('书签按书存、按书删，坏 JSON 当作没有', () => {
    saveBookmarks('book-1', [{ id: '1:2', chapterIndex: 1, paragraphIndex: 2, chapterTitle: '第二章', excerpt: '正文', createdAt: 3 }])
    expect(loadBookmarks('book-1')).toHaveLength(1)
    expect(loadBookmarks('book-2')).toEqual([])
    window.localStorage.setItem('novel-reading:bookmarks:book-3', '{坏 JSON')
    expect(loadBookmarks('book-3')).toEqual([])
    removeBookmarks('book-1')
    expect(loadBookmarks('book-1')).toEqual([])
  })

  it('界面偏好（沉浸模式）存得住', () => {
    expect(loadUiPrefs().immersive).toBe(false)
    saveUiPrefs({ immersive: true })
    expect(loadUiPrefs().immersive).toBe(true)
    window.localStorage.setItem('novel-reading:ui', '{坏 JSON')
    expect(loadUiPrefs().immersive).toBe(false)
  })

  it('fileKey 稳定且能区分不同文件', () => {
    expect(fileKey('a.txt', 10)).toBe(fileKey('a.txt', 10))
    expect(fileKey('a.txt', 10)).not.toBe(fileKey('a.txt', 11))
  })
})
