import { describe, expect, it } from 'vitest'
import { pickAnchorIndex } from '../../src/core/anchor'

describe('pickAnchorIndex', () => {
  it('取视口顶部第一个还看得见的段落', () => {
    // 段落底边：10 / 40 / 70；视口顶部在 30 → 第一个底边 > 30 的是下标 1
    expect(pickAnchorIndex([10, 40, 70], 30)).toBe(1)
  })

  it('滚到最底部取最后一段', () => {
    expect(pickAnchorIndex([10, 40, 70], 1000)).toBe(2)
  })

  it('刚到段尾（只差一点就滚过去）仍算这一段', () => {
    expect(pickAnchorIndex([10, 40, 70], 37)).toBe(1)
  })

  it('在顶部时取第 0 段', () => {
    expect(pickAnchorIndex([10, 40, 70], 0)).toBe(0)
  })

  it('没有段落时返回 0', () => {
    expect(pickAnchorIndex([], 0)).toBe(0)
  })
})
