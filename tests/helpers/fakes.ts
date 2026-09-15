/** 与浏览器无关的内存 Storage，测试里当 localStorage 用（互不干扰） */
export function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, String(value))
    },
  }
}

/** 模拟拖进来的文件：useReader 只要求 name + arrayBuffer */
export function fileOf(name: string, bytes: Uint8Array) {
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
  }
}
