import { describe, expect, it } from 'vitest'
import { decodeText, detectEncoding } from '../../src/core/encoding'

// “第一章 测试”的 GBK（GB2312）字节序列
const GBK_CHAPTER = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xb2, 0xe2, 0xca, 0xd4])

describe('detectEncoding', () => {
  it('识别带 BOM 的 UTF-8', () => {
    const body = new TextEncoder().encode('第一章 测试')
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body])
    expect(detectEncoding(bytes)).toBe('utf-8')
  })

  it('识别无 BOM 的 UTF-8', () => {
    expect(detectEncoding(new TextEncoder().encode('hello 世界'))).toBe('utf-8')
  })

  it('UTF-8 解码失败时回退为 GBK', () => {
    expect(detectEncoding(GBK_CHAPTER)).toBe('gbk')
  })

  it('识别带 BOM 的 UTF-16LE', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00])
    expect(detectEncoding(bytes)).toBe('utf-16le')
  })
})

describe('decodeText', () => {
  it('正确解码 GBK 字节', () => {
    expect(decodeText(GBK_CHAPTER, 'gbk')).toBe('第一章 测试')
  })

  it('解码 UTF-8 并去除 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('你好')])
    expect(decodeText(bytes, 'utf-8')).toBe('你好')
  })
})
