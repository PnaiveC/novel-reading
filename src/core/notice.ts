/**
 * N4：「刚发生了什么」只有这一处记账，界面一处取一格。
 *
 * 两格，互不顶替（以前靠两处 `if (!notice.value)` 手工维持，还各有一个落点）：
 * - 状况 `notice`：这本书现在的样子——正文看着像乱码、本书没能存到本机。
 *   停在那儿，直到状况变了或被清掉。
 * - 回执 `receipt`：对你刚做的一件事回一句话——已加书签、主题：夜间、这个键被占了。
 *   一会儿自己消失。
 *
 * 不在这里的东西：「打开空态 / 正在打开 / 打不开这个文件」是阅读器的状态（整页都换），
 * 归 useReader；重开这本书时该不该清状况，由调用方说了算（换书就得清）。
 */
export interface NoticeState {
  notice: string | null
  receipt: string | null
}

/** 定时器句柄：浏览器里是 number，Node 里是对象——这里只当不透明的值传递 */
export type TimerHandle = ReturnType<typeof setTimeout> | number

export interface NoticeBoardOptions {
  /** 回执活多久（毫秒）。默认 2400，跟原来的浮层提示一致 */
  receiptTtlMs?: number
  schedule?: (callback: () => void, delayMs: number) => TimerHandle
  cancel?: (handle: TimerHandle) => void
}

export interface NoticeBoard {
  /** 报告这本书现在的状况；null = 没事了 */
  setNotice(text: string | null): void
  /** 回一句话：对你刚做的那件事 */
  flash(text: string): void
  state(): NoticeState
  /** 订阅时先回调一次当前状态，免得调用方自己再读一遍 */
  subscribe(listener: (state: NoticeState) => void): () => void
  clear(): void
  destroy(): void
}

export function createNoticeBoard(options: NoticeBoardOptions = {}): NoticeBoard {
  const ttl = options.receiptTtlMs ?? 2400
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle))

  const listeners = new Set<(state: NoticeState) => void>()
  let notice: string | null = null
  let receipt: string | null = null
  let timer: TimerHandle | null = null
  let destroyed = false

  function state(): NoticeState {
    return { notice, receipt }
  }

  function emit(): void {
    const current = state()
    for (const listener of listeners) listener(current)
  }

  function setNotice(text: string | null): void {
    const next = text && text.trim() ? text : null
    if (next === notice) return
    notice = next
    emit()
  }

  function flash(text: string): void {
    if (destroyed) return
    receipt = text
    if (timer) cancel(timer)
    timer = schedule(() => {
      timer = null
      receipt = null
      emit()
    }, ttl)
    emit()
  }

  return {
    setNotice,
    flash,
    state,
    subscribe(listener) {
      listeners.add(listener)
      listener(state())
      return () => {
        listeners.delete(listener)
      }
    },
    clear() {
      if (timer) {
        cancel(timer)
        timer = null
      }
      if (notice === null && receipt === null) return
      notice = null
      receipt = null
      emit()
    },
    destroy() {
      destroyed = true
      if (timer) {
        cancel(timer)
        timer = null
      }
      listeners.clear()
      notice = null
      receipt = null
    },
  }
}
