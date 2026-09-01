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
    saveProgress(key, { chapterIndex: 3, updatedAt: 111 })
    expect(loadProgress(key)).toEqual({ chapterIndex: 3, updatedAt: 111 })
    expect(loadProgress('missing')).toBeNull()
  })

  it('设置保存与读取', () => {
    const settings = { fontSize: 20, lineHeight: 2, maxWidth: 40, theme: 'dark' as const }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
  })

  it('fileKey 稳定且能区分不同文件', () => {
    expect(fileKey('a.txt', 10)).toBe(fileKey('a.txt', 10))
    expect(fileKey('a.txt', 10)).not.toBe(fileKey('a.txt', 11))
  })
})
