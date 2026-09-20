/** 界面偏好（C2）：和排版设置分开存，免得读版式的旧数据里混进界面状态 */
export interface UiPrefs {
  /** 沉浸模式：平时只剩正文，鼠标靠近顶部 / 底部才露工具栏 */
  immersive: boolean
  /** 目录栏宽度（像素）：较长章节名看得全，可鼠标拖拽 */
  tocWidth: number
}

export const TOC_WIDTH_MIN = 180
export const TOC_WIDTH_MAX = 560
export const TOC_WIDTH_DEFAULT = 260

export const DEFAULT_UI_PREFS: UiPrefs = { immersive: false, tocWidth: TOC_WIDTH_DEFAULT }

/** 目录宽度收进合法区间：拖出来的值不可信，存坏了的也要能读 */
export function clampTocWidth(width: unknown): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) return TOC_WIDTH_DEFAULT
  return Math.min(Math.max(Math.round(width), TOC_WIDTH_MIN), TOC_WIDTH_MAX)
}

export function normalizeUiPrefs(input: unknown): UiPrefs {
  const source = (input ?? {}) as Partial<UiPrefs>
  return { immersive: source.immersive === true, tocWidth: clampTocWidth(source.tocWidth) }
}
