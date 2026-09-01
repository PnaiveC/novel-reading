export interface Chapter {
  title: string
  content: string
  /** 章节标题在原文中的起始行号（0 起） */
  startLine: number
}

const CHAPTER_HEADING =
  /^(第\s*[0-9０-９零一二三四五六七八九十百千万两]+\s*[章节回卷部集篇]|(?:序章|序言|楔子|引子|前言|引言|后记|尾声|番外|终章|完结篇)(?![\u4e00-\u9fa5]))/

/**
 * 按章节标题将全文切分为章节列表。
 * 无任何章节标题时，整篇作为单章“全文”返回。
 */
export function parseChapters(text: string): Chapter[] {
  const lines = text.split(/\r?\n/)
  const chapters: Chapter[] = []
  let current: Chapter | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (CHAPTER_HEADING.test(trimmed)) {
      if (current) chapters.push(current)
      current = { title: trimmed, content: '', startLine: i }
    } else if (current) {
      current.content += `${line}\n`
    }
  }

  if (current) chapters.push(current)
  if (chapters.length === 0) {
    return [{ title: '全文', content: `${text.trim()}\n`, startLine: 0 }]
  }

  // 正文开头若在第一个章节标题之前还有内容，归为“开篇”
  const leading = lines
    .slice(0, chapters[0].startLine)
    .join('\n')
    .trim()
  if (leading) {
    chapters.unshift({ title: '开篇', content: `${leading}\n`, startLine: 0 })
  }

  return chapters
}
