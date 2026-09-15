import { parseChapters, type Chapter } from './chapterParser'
import { decodeText, detectEncoding, type Encoding } from './encoding'

/** 一本已解码、已切章的书；`id` 是内容哈希，用来关联本地存储与阅读进度 */
export interface LoadedBook {
  id: string
  name: string
  size: number
  encoding: Encoding
  text: string
  chapters: Chapter[]
  /** 原始字节：手动切换编码（B1）要重新解码它；没有字节就切不了 */
  bytes?: Uint8Array
}

export interface BookTextInput {
  id: string
  name: string
  size: number
  encoding: Encoding
  text: string
}

/** FNV-1a（可换种子），纯 JS 实现：不依赖 crypto，离线与单测都省事 */
function fnv1a(bytes: Uint8Array, seed: number): number {
  let hash = seed >>> 0
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * 按内容算书号：同名不同内容不会串进度，改文件名也不丢进度。
 * 两个不同种子拼成 64 位，长度一并编码进去，降低碰撞概率。
 */
export function computeBookId(bytes: Uint8Array): string {
  const head = fnv1a(bytes, 0x811c9dc5)
  const tail = fnv1a(bytes, 0x9e3779b9)
  return `${bytes.length.toString(36)}-${head.toString(36)}${tail.toString(36)}`
}

/** 已解码文本 → 书（切章）。解码与切章分离，方便从本地存储直接恢复。 */
export function bookFromText(input: BookTextInput, bytes?: Uint8Array): LoadedBook {
  const text = input.text.replace(/^\uFEFF/, '')
  return {
    id: input.id,
    name: input.name,
    size: input.size,
    encoding: input.encoding,
    text,
    chapters: parseChapters(text),
    bytes,
  }
}

/**
 * 原始字节 → 书：自动识别编码后解码并切章。
 * 传了 `encoding` 就用它（手动切换编码 / 沿用上次的手动选择）。
 */
export function loadBookFromBytes(name: string, bytes: Uint8Array, encoding?: Encoding): LoadedBook {
  const chosen = encoding ?? detectEncoding(bytes)
  return bookFromText(
    {
      id: computeBookId(bytes),
      name,
      size: bytes.length,
      encoding: chosen,
      text: decodeText(bytes, chosen),
    },
    bytes,
  )
}
