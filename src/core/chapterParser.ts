export interface Chapter {
  title: string
  content: string
  /** 章节标题在原文中的起始行号（0 起） */
  startLine: number
}

/** 完全认不出章节标题时，退化分节的字符粒度 */
export const SECTION_LENGTH = 4000

/** 章节标题里可能出现的数字（含全角与中文数字） */
const NUM = '[0-9０-９零一二三四五六七八九十百千万两]'

const HEADINGS: RegExp[] = [
  // 第一章 / 第 12 章 / 第一百二十三节 / 第五卷
  new RegExp(`^第\\s*${NUM}{1,12}\\s*[章节回卷部集篇]`),
  // 卷一 / 卷 3 / 卷二 风起
  new RegExp(`^卷\\s*${NUM}{1,12}(?:\\s|$)`),
  // 楔子 / 序章 / 番外篇 / 终章 / 完本感言；后面紧跟汉字就不算（挡住“引子内容”这类正文）
  /^(?:序章|序言|序|楔子|引子|前言|引言|后记|尾声|终章|完结篇|完本感言|番外篇|番外)(?![\u4e00-\u9fa5])/,
  // Chapter 1 / CHAPTER IV / chapter 12: xxx
  /^chapter\s*[0-9ivxlcdm]{1,8}(?:\s|$|:|：)/i,
]

/**
 * 章内小标题：序号 + 短标题，例如「（一）初入山门」「一、初入山门」「1. 初见」。
 * 这些是章内的分节，不是新章（需求：目录里只出现真实章节）。
 */
const SUB_HEADINGS: RegExp[] = [
  /^[（(【\[]\s*(?:[0-9０-９]{1,4}|[一二三四五六七八九十百千]{1,6})\s*[）)】\]]/,
  /^(?:[0-9０-９]{1,4}|[一二三四五六七八九十百千]{1,6})\s*[、.．]/,
]

/** 标题行的长度与标点上界：挡住「第一章的内容是这样的……」这类正文误判 */
const TITLE_MAX_LENGTH = 40
const SENTENCE_END = /[。！？…！?]|[,，、；;：:]$/

function isHeading(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > TITLE_MAX_LENGTH) return false
  if (SUB_HEADINGS.some((pattern) => pattern.test(trimmed))) return false
  if (SENTENCE_END.test(trimmed)) return false
  return HEADINGS.some((pattern) => pattern.test(trimmed))
}

/** 比对标题时抹掉所有空白（含全角空格）：文件里同一条标题常有细微空格差别 */
export function normalizeTitle(title: string): string {
  return title.replace(/[\s\u3000]+/g, '')
}

/** 只有编号、没有副标题的标题，例如「第五百三十四章」「第七卷」 */
function isBareNumberTitle(title: string): boolean {
  return (
    new RegExp(`^第[0-9０-９零一二三四五六七八九十百千万两]{1,12}[章节回卷部集篇]$`).test(title) ||
    /^[0-9０-９]{1,4}$/.test(title)
  )
}

/**
 * 两行标题是不是同一章（正文里又抄了一遍标题行）。
 * 同一条标题重复出现时不能再切一章，否则目录里会长出重复的、空白的章节。
 */
export function isSameChapterTitle(current: string, next: string): boolean {
  const left = normalizeTitle(current)
  const right = normalizeTitle(next)
  if (!left || !right) return false
  if (left === right) return true
  const short = left.length <= right.length ? left : right
  const long = left.length <= right.length ? right : left
  // 「第五百三十四章」/「第五百三十四章 顾璨还是那个顾璨」——短的那条只有编号
  return long.startsWith(short) && isBareNumberTitle(short)
}

function splitByHeading(lines: readonly string[]): Chapter[] {
  const chapters: Chapter[] = []
  let current: Chapter | null = null

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (isHeading(lines[i])) {
      // 正文开头重抄了一遍本章标题：并进当前章，标题取更完整的那条，这一行本身不进正文
      if (current && isSameChapterTitle(current.title, trimmed)) {
        if (normalizeTitle(trimmed).length > normalizeTitle(current.title).length) {
          current.title = trimmed
        }
        continue
      }
      if (current) chapters.push(current)
      current = { title: trimmed, content: '', startLine: i }
    } else if (current) {
      current.content += `${lines[i]}\n`
    }
  }

  if (current) chapters.push(current)
  return chapters
}

/** 认不出标题时的兜底：按固定字符量分节（不拆行），短文本仍是一章 */
function sectionize(lines: readonly string[]): Chapter[] {
  const sections: Chapter[] = []
  let buffer: string[] = []
  let length = 0
  let start = 0

  const flush = (): void => {
    const content = buffer.join('\n').trim()
    if (content) sections.push({ title: '', content: `${content}\n`, startLine: start })
    buffer = []
    length = 0
  }

  for (let i = 0; i < lines.length; i++) {
    if (!buffer.length) start = i
    buffer.push(lines[i])
    length += lines[i].length
    if (length >= SECTION_LENGTH) flush()
  }
  flush()

  const text = lines.join('\n').trim()
  if (sections.length <= 1) {
    return [{ title: '全文', content: text ? `${text}\n` : '', startLine: 0 }]
  }
  return sections.map((section, index) => ({ ...section, title: `第 ${index + 1} 节` }))
}

/**
 * 按章节标题将全文切分为章节列表。
 * 认不出章节标题时不报错：按固定长度分节；短文本整篇作为单章「全文」。
 */
export function parseChapters(text: string): Chapter[] {
  const lines = text.split(/\r?\n/)
  const chapters = splitByHeading(lines)
  const longEnoughToSplit = text.trim().length > SECTION_LENGTH
  // 只认出一个标题、文件却很长，说明是误判，宁可退化成定长分节
  if (chapters.length < 2 && longEnoughToSplit) return sectionize(lines)
  if (chapters.length === 0) return sectionize(lines)

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
