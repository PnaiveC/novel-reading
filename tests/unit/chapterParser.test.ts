import { describe, expect, it } from 'vitest'
import { parseChapters, SECTION_LENGTH } from '../../src/core/chapterParser'

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

  it('支持英文 Chapter 标题', () => {
    const text = 'Chapter 1 Beginnings\nhello\n\nCHAPTER II\nThe war\n\nchapter 3: end\nbye'
    expect(parseChapters(text).map((c) => c.title)).toEqual([
      'Chapter 1 Beginnings',
      'CHAPTER II',
      'chapter 3: end',
    ])
  })

  it('支持「卷一」「第3卷」这类卷标题', () => {
    const text = '卷一 风起\n开篇\n\n卷二\n正文\n\n第3卷 归人\n结尾'
    expect(parseChapters(text).map((c) => c.title)).toEqual(['卷一 风起', '卷二', '第3卷 归人'])
  })

  it('「一节」也认，节与章混排不乱', () => {
    const text = '第一章 开始\n正文\n\n第二节 继续\n正文二'
    expect(parseChapters(text).map((c) => c.title)).toEqual(['第一章 开始', '第二节 继续'])
  })

  it('正文里的「第X章…」长句不算标题（有句末标点 / 超长）', () => {
    const text = [
      '第一章 开始',
      '正文。',
      '第一章的内容是这样的，我们后来才知道，那天晚上发生的事情远远没有结束，还有很多细节被遗漏了。',
    ].join('\n')
    expect(parseChapters(text)).toHaveLength(1)
  })

  it('认不出章节标题时按固定长度分节，而不是报错（B2 兜底）', () => {
    const text = `${'没有标题的一段正文。\n'.repeat(Math.ceil(SECTION_LENGTH / 9) + 60)}`
    const chapters = parseChapters(text)
    expect(chapters.length).toBeGreaterThan(1)
    expect(chapters[0].title).toBe('第 1 节')
    expect(chapters[1].title).toBe('第 2 节')
    expect(chapters.every((chapter) => chapter.content.trim().length > 0)).toBe(true)
  })

  it('短文本且认不出标题时仍是一章「全文」', () => {
    const chapters = parseChapters('一段没有章节标记的文本。\n第二行。')
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('全文')
  })
})
