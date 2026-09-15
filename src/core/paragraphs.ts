/**
 * 章节正文 → 段落列表。中文小说基本一行一段，空行忽略。
 * 段落下标就是 A4 的「段落锚点」，必须稳定：同一段文本每次都落在同一下标。
 */
export function splitParagraphs(content: string): string[] {
  const paragraphs: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed) paragraphs.push(trimmed)
  }
  return paragraphs
}
