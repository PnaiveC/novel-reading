import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStorage,
  fileKey,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
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

  it('fileKey 稳定且能区分不同文件', () => {
    expect(fileKey('a.txt', 10)).toBe(fileKey('a.txt', 10))
    expect(fileKey('a.txt', 10)).not.toBe(fileKey('a.txt', 11))
  })
})
