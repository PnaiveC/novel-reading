import { describe, expect, it } from 'vitest'
import { decodeText, detectEncoding, garbledRatio, looksGarbled } from '../../src/core/encoding'

// “第一章 测试”的 GBK（GB2312）字节序列
const GBK_CHAPTER = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xb2, 0xe2, 0xca, 0xd4])

// “你” + U+10000 的 GB18030 四字节序列（0x90 0x30 0x81 0x30）
const GB18030_SAMPLE = new Uint8Array([0xc4, 0xe3, 0x90, 0x30, 0x81, 0x30])

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

  it('含四字节序列时识别为 GB18030（GBK 的次字节不会是 ASCII 数字）', () => {
    expect(detectEncoding(GB18030_SAMPLE)).toBe('gb18030')
  })

  it('GBK 字的尾字节后跟 ASCII 数字，不能误判成 GB18030（要按配对对齐）', () => {
    // “你。1”：C4E3 你 / A1A3 。 / 31 1，最后两字节 A3 31 长得像四字节序列的开头
    const bytes = new Uint8Array([0xc4, 0xe3, 0xa1, 0xa3, 0x31])
    expect(detectEncoding(bytes)).toBe('gbk')
    expect(decodeText(bytes, 'gbk')).toBe('你。1')
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

  it('解码 GB18030 四字节字符', () => {
    expect(decodeText(GB18030_SAMPLE, 'gb18030')).toBe('你\u{10000}')
  })

  it('UTF-16LE 也能解码（B1 的手动候选之一）', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]), 'utf-16le')).toBe('A')
  })
})

describe('乱码自检（B1 提示用）', () => {
  it('正常中文不像乱码', () => {
    expect(looksGarbled('第一章 初见\n正文一。')).toBe(false)
    expect(garbledRatio('正文一。')).toBe(0)
  })

  it('解码失败的替换字符占比高就算乱码', () => {
    expect(looksGarbled('abc\uFFFD\uFFFD\uFFFD\uFFFD')).toBe(true)
  })

  it('空文本不算乱码（避免空文件误报）', () => {
    expect(garbledRatio('')).toBe(0)
    expect(looksGarbled('')).toBe(false)
  })
})
