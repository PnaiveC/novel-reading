import { beforeEach } from 'vitest'
import { memoryStorage } from './helpers/fakes'

/**
 * Node 25 自带一个残缺的全局 localStorage（getItem/setItem 不是函数），
 * 会盖住 jsdom 的实现。测试里统一换成内存版，行为可控、互不干扰。
 */
const store = memoryStorage()

Object.defineProperty(globalThis, 'localStorage', {
  value: store,
  configurable: true,
  writable: true,
})

beforeEach(() => {
  store.clear()
})
