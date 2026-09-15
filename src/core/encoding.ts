export type Encoding = 'utf-8' | 'gbk' | 'gb18030' | 'utf-16le'

export const ENCODING_LABELS: Record<Encoding, string> = {
  'utf-8': 'UTF-8',
  gbk: 'GBK',
  gb18030: 'GB18030',
  'utf-16le': 'UTF-16 LE',
}

/** 手动切换用的候选（B1），顺序即「常见程度」 */
export const ENCODING_OPTIONS: { value: Encoding; label: string }[] = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK' },
  { value: 'gb18030', label: 'GB18030' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
]

function hasBom(bytes: Uint8Array, bom: readonly number[]): boolean {
  return bom.every((value, index) => bytes[index] === value)
}

export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

/**
 * GB18030 的四字节序列是「首字节 0x81–0xFE + 次字节 0x30–0x39」。
 * GBK 的次字节不可能是 ASCII 数字，所以出现这种组合就一定是 GB18030。
 * 必须按 GBK 的双字节配对往后走：上一条的尾字节也可能落在 0x81–0xFE，
 * 不按配对对齐的话，`…A1 31…`（GBK 字 + ASCII 数字）会被误判成四字节序列。
 */
function hasGb18030Quad(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const lead = bytes[i]
    if (lead < 0x81 || lead > 0xfe) continue
    const next = bytes[i + 1]
    if (next === undefined) break
    if (next >= 0x30 && next <= 0x39) return true
    // 合法 GBK 双字节：整体跳过，保持配对对齐
    if (next >= 0x40 && next !== 0x7f && next <= 0xfe) i++
  }
  return false
}

/**
 * 自动检测 TXT 文件编码：
 * BOM 优先，其次严格按 UTF-8 解码尝试，失败则按 GB18030 / GBK 区分。
 */
export function detectEncoding(bytes: Uint8Array): Encoding {
  if (hasBom(bytes, [0xef, 0xbb, 0xbf])) return 'utf-8'
  if (hasBom(bytes, [0xff, 0xfe])) return 'utf-16le'
  if (isValidUtf8(bytes)) return 'utf-8'
  return hasGb18030Quad(bytes) ? 'gb18030' : 'gbk'
}

export function decodeText(bytes: Uint8Array, encoding: Encoding): string {
  return new TextDecoder(encoding).decode(bytes)
}

/**
 * 乱码自检：解码后若满是替换字符（U+FFFD），多半是编码猜错了，
 * 界面上据此提示用户去手动切换（B1）。
 */
export function garbledRatio(text: string): number {
  if (!text.length) return 0
  let bad = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xfffd) bad++
  }
  return bad / text.length
}

export function looksGarbled(text: string, threshold = 0.002): boolean {
  return garbledRatio(text) > threshold
}
