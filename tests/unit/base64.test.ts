import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64 } from '../../src/core/base64'

function roundTrip(bytes: Uint8Array): Uint8Array {
  return base64ToBytes(bytesToBase64(bytes))
}

describe('base64（localStorage 兜底存原始字节用）', () => {
  it('已知向量对得上', () => {
    const encoder = new TextEncoder()
    expect(bytesToBase64(encoder.encode('Man'))).toBe('TWFu')
    expect(bytesToBase64(encoder.encode('Ma'))).toBe('TWE=')
    expect(bytesToBase64(encoder.encode('M'))).toBe('TQ==')
    expect(new TextDecoder().decode(base64ToBytes('TWFu'))).toBe('Man')
  })

  it('各种长度都能原样回环', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 256, 4097]) {
      const bytes = new Uint8Array(length)
      for (let i = 0; i < length; i++) bytes[i] = (i * 37 + length) % 256
      expect(Array.from(roundTrip(bytes))).toEqual(Array.from(bytes))
    }
  })

  it('整本小说的字节也不丢（分批拼接不留尾巴）', () => {
    const bytes = new Uint8Array(200000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
    expect(roundTrip(bytes)).toEqual(bytes)
  })

  it('空白与非法字符忽略掉', () => {
    expect(Array.from(base64ToBytes('TW\nFu'))).toEqual([0x4d, 0x61, 0x6e])
    expect(Array.from(base64ToBytes(''))).toEqual([])
  })
})
