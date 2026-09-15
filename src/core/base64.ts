const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const DECODE = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i
  return table
})()

/**
 * 字节 → base64。localStorage 只能存字符串，用它把原始字节（B1 手动切编码要用）
 * 一起存下来。手写而非 btoa：Node 与浏览器行为一致，大文件也不会爆调用栈。
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  let chunk = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1] ?? 0
    const b2 = bytes[i + 2] ?? 0
    const triple = (b0 << 16) | (b1 << 8) | b2
    chunk +=
      ALPHABET[(triple >> 18) & 0x3f] +
      ALPHABET[(triple >> 12) & 0x3f] +
      (i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 0x3f] : '=') +
      (i + 2 < bytes.length ? ALPHABET[triple & 0x3f] : '=')
    // 分批拼接：一次性 += 会让长字符串退化成 O(n²)
    if (chunk.length >= 8192) {
      out += chunk
      chunk = ''
    }
  }
  return out + chunk
}

export function base64ToBytes(text: string): Uint8Array {
  const codes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 128) continue
    const value = DECODE[code]
    if (value >= 0) codes.push(value)
  }

  const bytes = new Uint8Array(Math.floor((codes.length * 3) / 4))
  let at = 0
  for (let i = 0; i < codes.length; i += 4) {
    const quad =
      (codes[i] << 18) | ((codes[i + 1] ?? 0) << 12) | ((codes[i + 2] ?? 0) << 6) | (codes[i + 3] ?? 0)
    if (at < bytes.length) bytes[at++] = (quad >> 16) & 0xff
    if (at < bytes.length) bytes[at++] = (quad >> 8) & 0xff
    if (at < bytes.length) bytes[at++] = quad & 0xff
  }
  return bytes
}
