/**
 * 拿浏览器 localStorage，但只认功能齐备的那一份。
 * 背景：Node 25 会挂一个残缺的全局 localStorage 占位（缺 setItem/removeItem），
 * 直接拿来用会在写进度时崩。拿不到就返回 null，由调用方走内存兜底。
 */
export function usableLocalStorage(): Storage | null {
  try {
    const store = typeof window !== 'undefined' ? window.localStorage : undefined
    if (
      store &&
      typeof store.getItem === 'function' &&
      typeof store.setItem === 'function' &&
      typeof store.removeItem === 'function'
    ) {
      return store
    }
  } catch {
    // 隐私模式等情况下访问本身会抛
  }
  return null
}
