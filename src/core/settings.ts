export type FontId = 'song' | 'hei' | 'kai' | 'system'

/** 阅读排版设置（B4）：全部落在 CSS 变量上，改一个数字立刻见效 */
export interface ReadingSettings {
  /** 正文字号（px） */
  fontSize: number
  /** 行距倍数 */
  lineHeight: number
  /** 正文页宽（em） */
  maxWidth: number
  /** 段间距（em） */
  paragraphSpacing: number
  /** 首行缩进字符数 */
  indent: 0 | 2
  fontFamily: FontId
  theme: 'light' | 'sepia' | 'dark'
}

export const FONT_STACKS: Record<FontId, string> = {
  song: "'Noto Serif CJK SC', 'Source Han Serif SC', 'Songti SC', SimSun, Georgia, serif",
  hei: "'Noto Sans CJK SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  kai: "KaiTi, STKaiti, 'Kaiti SC', 'Noto Serif CJK SC', serif",
  system: "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif",
}

export const FONT_OPTIONS: { value: FontId; label: string }[] = [
  { value: 'song', label: '宋体 / 衬线' },
  { value: 'hei', label: '黑体 / 无衬线' },
  { value: 'kai', label: '楷体' },
  { value: 'system', label: '系统默认' },
]

export const DEFAULT_SETTINGS: ReadingSettings = {
  fontSize: 18,
  lineHeight: 1.9,
  maxWidth: 36,
  paragraphSpacing: 0.55,
  indent: 2,
  fontFamily: 'song',
  theme: 'light',
}

const RANGES = {
  fontSize: [14, 30],
  lineHeight: [1.3, 2.6],
  maxWidth: [24, 60],
  paragraphSpacing: [0, 2],
} as const

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * 把存下来的 / 用户改的设置收进合法范围：坏数据、旧版本缺字段、手滑的极端值都不该把界面搞崩。
 */
export function normalizeSettings(input: Partial<ReadingSettings> | null | undefined): ReadingSettings {
  const source = input ?? {}
  return {
    fontSize: round(clamp(Number(source.fontSize), RANGES.fontSize[0], RANGES.fontSize[1], DEFAULT_SETTINGS.fontSize), 1),
    lineHeight: round(
      clamp(Number(source.lineHeight), RANGES.lineHeight[0], RANGES.lineHeight[1], DEFAULT_SETTINGS.lineHeight),
      2,
    ),
    maxWidth: round(clamp(Number(source.maxWidth), RANGES.maxWidth[0], RANGES.maxWidth[1], DEFAULT_SETTINGS.maxWidth), 0),
    paragraphSpacing: round(
      clamp(
        Number(source.paragraphSpacing),
        RANGES.paragraphSpacing[0],
        RANGES.paragraphSpacing[1],
        DEFAULT_SETTINGS.paragraphSpacing,
      ),
      2,
    ),
    indent: source.indent === 0 ? 0 : DEFAULT_SETTINGS.indent,
    fontFamily: source.fontFamily && source.fontFamily in FONT_STACKS ? source.fontFamily : DEFAULT_SETTINGS.fontFamily,
    theme: source.theme === 'sepia' || source.theme === 'dark' ? source.theme : 'light',
  }
}
