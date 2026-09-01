import { describe, expect, it } from 'vitest'
import { parseChapters } from '../../src/core/chapterParser'

describe('parseChapters', () => {
  it('按“第X章”分割章节', () => {
    const text = '第一章 初见\n正文一\n\n第二章 重逢\n正文二'
    const chapters = parseChapters(text)
    expect(chapters.map((c) => c.title)).toEqual(['第一章 初见', '第二章 重逢'])
    expect(chapters[0].content).toContain('正文一')
    expect(chapters[1].content).toContain('正文二')
  })

  it('支持楔子、番外等标题', () => {
    const text = '楔子\n引子内容\n\n第一章 开始\n内容\n\n番外 小故事\n番外内容'
    expect(parseChapters(text).map((c) => c.title)).toEqual(['楔子', '第一章 开始', '番外 小故事'])
  })

  it('无章节标题时整篇视为“全文”', () => {
    const text = '一段没有章节标记的文本。\n第二行。'
    const chapters = parseChapters(text)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('全文')
  })

  it('首个章节标题前的文本归为“开篇”', () => {
    const text = '本书简介\n\n第一章 开始\n内容'
    const chapters = parseChapters(text)
    expect(chapters[0].title).toBe('开篇')
    expect(chapters[1].title).toBe('第一章 开始')
  })
})
