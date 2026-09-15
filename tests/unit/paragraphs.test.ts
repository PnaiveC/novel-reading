import { describe, expect, it } from 'vitest'
import { splitParagraphs } from '../../src/core/paragraphs'

describe('splitParagraphs', () => {
  it('一行一段，去掉空行与行首行尾空白', () => {
    expect(splitParagraphs('第一段\n\n  第二段  \r\n第三段\n')).toEqual(['第一段', '第二段', '第三段'])
  })

  it('段落顺序稳定（锚点依赖下标）', () => {
    const content = 'A\nB\nC\n'
    expect(splitParagraphs(content)).toEqual(['A', 'B', 'C'])
    expect(splitParagraphs(content)[1]).toBe('B')
  })

  it('空正文得到空列表', () => {
    expect(splitParagraphs('   \n\n')).toEqual([])
  })
})
