import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStorage,
  loadSettings,
  loadShortcuts,
  loadUiPrefs,
  saveSettings,
  saveShortcuts,
  saveUiPrefs,
} from '../../src/core/storage'

beforeEach(() => {
  clearStorage()
})

// 进度与书签是「哪本书」的东西，测试搬去了 library.test.ts（N2）
describe('storage：全局偏好', () => {
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

  it('快捷键：存一套改过的，读回来还是那套；坏 JSON 退回默认', () => {
    saveShortcuts({ ...loadShortcuts(), toc: ['k'] })
    expect(loadShortcuts().toc).toEqual(['k'])
    window.localStorage.setItem('novel-reading:shortcuts', '{坏 JSON')
    expect(loadShortcuts().toc).toEqual(['d'])
  })

  it('界面偏好（沉浸模式 / 目录宽度）存得住', () => {
    expect(loadUiPrefs().immersive).toBe(false)
    expect(loadUiPrefs().tocWidth).toBe(260)
    saveUiPrefs({ immersive: true, tocWidth: 400 })
    expect(loadUiPrefs().immersive).toBe(true)
    expect(loadUiPrefs().tocWidth).toBe(400)
    window.localStorage.setItem('novel-reading:ui', '{坏 JSON')
    expect(loadUiPrefs().immersive).toBe(false)
    expect(loadUiPrefs().tocWidth).toBe(260)
  })
})
