import { onBeforeUnmount, ref } from 'vue'
import { createNoticeBoard, type NoticeBoard, type NoticeBoardOptions } from '../core/notice'

/**
 * N4 的 Vue 胶水：把「刚发生了什么」的记账搬进响应式状态，
 * 界面直接绑——浮层绑 `receipt`，状态栏绑 `notice`。
 */
export function useNotices(options: NoticeBoardOptions = {}) {
  const board: NoticeBoard = createNoticeBoard(options)
  const notice = ref<string | null>(null)
  const receipt = ref<string | null>(null)
  const stop = board.subscribe((state) => {
    notice.value = state.notice
    receipt.value = state.receipt
  })

  onBeforeUnmount(() => {
    stop()
    board.destroy()
  })

  return {
    /** 这本书现在的状况（乱码 / 没存下） */
    notice,
    /** 对你刚做的那件事的回话 */
    receipt,
    setNotice: (text: string | null): void => board.setNotice(text),
    flash: (text: string): void => board.flash(text),
    clear: (): void => board.clear(),
    /** useReader 之类直接报状况的模块用 */
    board,
  }
}
