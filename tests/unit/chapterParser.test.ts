import { describe, expect, it } from 'vitest'
import {
  isSameChapterTitle,
  normalizeTitle,
  parseChapters,
  SECTION_LENGTH,
} from '../../src/core/chapterParser'

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

describe('parseChapters：章内重复标题行不算新章（目录只出现真实章节）', () => {
  it('正文开头重抄一遍本章标题：合成一章，标题行不进正文', () => {
    const text = [
      '第十二章 初见',
      '    第十二章 初见',
      '正文一。',
      '',
      '第十三章 重逢',
      '正文二。',
    ].join('\n')
    const chapters = parseChapters(text)
    expect(chapters.map((c) => c.title)).toEqual(['第十二章 初见', '第十三章 重逢'])
    expect(chapters[0].content).toContain('正文一。')
    expect(chapters[0].content).not.toContain('第十二章')
  })

  it('标题写法有出入（多空格、只有编号）也算同一章', () => {
    const text = [
      ' 第53章 请神 ',
      '',
      '    第53章 请神',
      '',
      '正文一。',
      '',
      '第五百三十四章 顾璨还是那个顾璨',
      '    第五百三十四章',
      '正文二。',
    ].join('\n')
    const chapters = parseChapters(text)
    expect(chapters.map((c) => c.title)).toEqual([
      '第53章 请神',
      '第五百三十四章 顾璨还是那个顾璨',
    ])
    expect(chapters[1].content).toBe('正文二。\n')
  })

  it('同一章里正文重复了一整块（抄袭式重复）也只算一章', () => {
    const text = [
      '第八百四十一章 新剑修',
      '正文甲。',
      '第八百四十一章 新剑修',
      '正文甲。',
      '第八百四十二章 后面',
      '正文乙。',
    ].join('\n')
    expect(parseChapters(text).map((c) => c.title)).toEqual([
      '第八百四十一章 新剑修',
      '第八百四十二章 后面',
    ])
  })

  it('不同章之间的同名标题照旧各算一章', () => {
    const text = '第一章 起\n正文一。\n第二章 转\n正文二。\n第一章 起\n正文三。'
    expect(parseChapters(text).map((c) => c.title)).toEqual([
      '第一章 起',
      '第二章 转',
      '第一章 起',
    ])
  })

  it('章内小标题不算章节，留在正文里', () => {
    const text = [
      '第十二章 初见',
      '一、初入山门',
      '（一）山门前的石阶',
      '【二】山门里的规矩',
      '1. 拜师',
      '正文。',
      '第十三章 下山',
      '正文二。',
    ].join('\n')
    const chapters = parseChapters(text)
    expect(chapters.map((c) => c.title)).toEqual(['第十二章 初见', '第十三章 下山'])
    expect(chapters[0].content).toContain('一、初入山门')
    expect(chapters[0].content).toContain('（一）山门前的石阶')
    expect(chapters[0].content).toContain('1. 拜师')
  })

  it('isSameChapterTitle / normalizeTitle 的边界', () => {
    expect(normalizeTitle(' 第五百三十四章　请神 ')).toBe('第五百三十四章请神')
    expect(isSameChapterTitle('第53章 请神', ' 第53章 请神 ')).toBe(true)
    expect(isSameChapterTitle('第五百三十四章 顾璨还是那个顾璨', '第五百三十四章')).toBe(true)
    expect(isSameChapterTitle('第五百三十四章 顾璨还是那个顾璨', '第五百三十四章 请神')).toBe(false)
    expect(isSameChapterTitle('第一章 起', '第三章 起')).toBe(false)
    expect(isSameChapterTitle('', '')).toBe(false)
  })
})
