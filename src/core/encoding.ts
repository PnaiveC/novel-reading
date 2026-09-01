export type Encoding = 'utf-8' | 'gbk' | 'gb18030' | 'utf-16le'

export const ENCODING_LABELS: Record<Encoding, string> = {
  'utf-8': 'UTF-8',
  gbk: 'GBK',
  gb18030: 'GB18030',
  'utf-16le': 'UTF-16 LE',
}

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
 * 自动检测 TXT 文件编码：
 * BOM 优先，其次严格按 UTF-8 解码尝试，失败则回退 GBK。
 */
export function detectEncoding(bytes: Uint8Array): Encoding {
  if (hasBom(bytes, [0xef, 0xbb, 0xbf])) return 'utf-8'
  if (hasBom(bytes, [0xff, 0xfe])) return 'utf-16le'
  if (isValidUtf8(bytes)) return 'utf-8'
  return 'gbk'
}

export function decodeText(bytes: Uint8Array, encoding: Encoding): string {
  return new TextDecoder(encoding).decode(bytes)
}
