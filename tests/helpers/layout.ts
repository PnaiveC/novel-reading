import type { ChapterWindow } from '../../src/core/continuous'

/**
 * N1 的「可测量的假容器」：jsdom 有 DOM 但没有布局（rect 全是 0），
 * 这里给一棵真 DOM 树按表填几何——每章一个标题行 + N 个段落行，行高固定，
 * rect 由「内容坐标 − scrollTop」算出来，scrollTop 是容器上的普通属性。
 * 测试扮演 Vue 的那一半：订阅 onWindowChange 后按窗口重建 DOM（render）。
 */

export interface ReaderRow {
  chapterIndex: number
  /** null = 章节标题那一行 */
  paragraphIndex: number | null
}

export interface ReaderLayoutOptions {
  chapters?: number
  paragraphsPerChapter?: number
  titleHeight?: number
  paragraphHeight?: number
  viewportHeight?: number
}

export interface ReaderLayout {
  container: HTMLElement
  chapterCount: number
  chapterHeight: number
  viewportHeight: number
  /** 测试扮演的渲染：按窗口重建 DOM 与几何 */
  render(window: ChapterWindow): void
  rendered(): ChapterWindow
  contentTopOfSection(chapterIndex: number): number
  contentTopOf(chapterIndex: number, paragraphIndex: number): number
  visualTop(row: ReaderRow): number
  /** 视口顶部第一个还看得见的行（和 module 挑锚点的规则一致） */
  topRow(): ReaderRow | null
  scrollTop(): number
  scrollTo(top: number): void
  scrollEvent(): void
  /**
   * 模拟浏览器自带的 scroll anchoring：一直开着，之后每次渲染都把这一行的
   * 视觉位置钉住（像 Chrome 那样自己把 scrollTop 调好）。
   */
  armBrowserAnchoring(row: ReaderRow): void
  disarmBrowserAnchoring(): void
}

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

export function createReaderLayout(options: ReaderLayoutOptions = {}): ReaderLayout {
  const chapterCount = options.chapters ?? 40
  const paragraphsPerChapter = options.paragraphsPerChapter ?? 10
  const titleHeight = options.titleHeight ?? 40
  const paragraphHeight = options.paragraphHeight ?? 30
  const viewportHeight = options.viewportHeight ?? 600
  const chapterHeight = titleHeight + paragraphsPerChapter * paragraphHeight

  const container = document.createElement('div')
  container.className = 'reader'
  document.body.appendChild(container)

  let window: ChapterWindow = { start: 0, end: 0 }
  let scrollTop = 0
  let anchored: { row: ReaderRow; visual: number } | null = null
  const nodes = new Map<number, { section: HTMLElement; title: HTMLElement; paragraphs: HTMLElement[] }>()

  const contentHeight = (): number =>
    Math.max(viewportHeight, (window.end - window.start + 1) * chapterHeight)
  const maxScrollTop = (): number => Math.max(0, contentHeight() - viewportHeight)
  const baseOf = (chapterIndex: number): number => (chapterIndex - window.start) * chapterHeight

  function contentTopOf(row: ReaderRow): number {
    const base = baseOf(row.chapterIndex)
    return row.paragraphIndex === null
      ? base
      : base + titleHeight + row.paragraphIndex * paragraphHeight
  }

  function visualTop(row: ReaderRow): number {
    return contentTopOf(row) - scrollTop
  }

  function place(node: HTMLElement, top: number, height: number): void {
    node.getBoundingClientRect = () => rect(top - scrollTop, height)
  }

  function nodesFor(index: number): { section: HTMLElement; title: HTMLElement; paragraphs: HTMLElement[] } {
    const existing = nodes.get(index)
    if (existing) return existing
    const section = document.createElement('section')
    section.className = 'chapter'
    section.dataset.chapter = String(index)
    const title = document.createElement('h1')
    title.className = 'chapter-title'
    title.textContent = `第 ${index + 1} 章`
    section.appendChild(title)
    const paragraphs: HTMLElement[] = []
    for (let paragraph = 0; paragraph < paragraphsPerChapter; paragraph++) {
      const para = document.createElement('p')
      para.className = 'para'
      para.dataset.p = String(paragraph)
      para.textContent = `第 ${index + 1} 章第 ${paragraph + 1} 段`
      section.appendChild(para)
      paragraphs.push(para)
    }
    const created = { section, title, paragraphs }
    nodes.set(index, created)
    return created
  }

  function render(next: ChapterWindow): void {
    window = next
    // 和 Vue 的 :key 一样：还留在窗口里的章节复用原来的节点，
    // 不然锚点元素每帧都被换掉，补偿逻辑就没得可测了
    for (const index of [...nodes.keys()]) {
      if (index < window.start || index > window.end) nodes.delete(index)
    }
    const sections: HTMLElement[] = []
    for (let index = window.start; index <= window.end; index++) {
      const item = nodesFor(index)
      place(item.section, baseOf(index), chapterHeight)
      place(item.title, baseOf(index), titleHeight)
      item.paragraphs.forEach((para, paragraph) => {
        place(para, baseOf(index) + titleHeight + paragraph * paragraphHeight, paragraphHeight)
      })
      sections.push(item.section)
    }
    container.replaceChildren(...sections)
    // 浏览器自带 anchoring 一直开着：渲染完自己把记下的那一行钉住
    if (anchored) scrollTop = clamp(contentTopOf(anchored.row) - anchored.visual)
    // 内容变短时浏览器也会把 scrollTop 夹回合法范围
    scrollTop = clamp(scrollTop)
  }

  function clamp(value: number): number {
    return Math.max(0, Math.min(value, maxScrollTop()))
  }

  Object.defineProperty(container, 'clientHeight', { get: () => viewportHeight, configurable: true })
  Object.defineProperty(container, 'scrollHeight', { get: contentHeight, configurable: true })
  Object.defineProperty(container, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = clamp(value)
    },
    configurable: true,
  })
  container.getBoundingClientRect = () => rect(0, viewportHeight)

  function topRow(): ReaderRow | null {
    for (let index = window.start; index <= window.end; index++) {
      const title: ReaderRow = { chapterIndex: index, paragraphIndex: null }
      if (contentTopOf(title) + titleHeight - scrollTop > 0) return title
      for (let paragraph = 0; paragraph < paragraphsPerChapter; paragraph++) {
        const row: ReaderRow = { chapterIndex: index, paragraphIndex: paragraph }
        if (contentTopOf(row) + paragraphHeight - scrollTop > 0) return row
      }
    }
    return null
  }

  render({ start: 0, end: 0 })

  return {
    container,
    chapterCount,
    chapterHeight,
    viewportHeight,
    render,
    rendered: () => ({ ...window }),
    contentTopOfSection: (chapterIndex) => contentTopOf({ chapterIndex, paragraphIndex: null }),
    contentTopOf: (chapterIndex, paragraphIndex) => contentTopOf({ chapterIndex, paragraphIndex }),
    visualTop,
    topRow,
    scrollTop: () => scrollTop,
    scrollTo: (top) => {
      scrollTop = clamp(top)
    },
    scrollEvent: () => {
      container.dispatchEvent(new Event('scroll'))
    },
    armBrowserAnchoring: (row) => {
      anchored = { row, visual: visualTop(row) }
    },
    disarmBrowserAnchoring: () => {
      anchored = null
    },
  }
}

export interface FrameQueue {
  nextFrame(callback: () => void): number
  cancelFrame(handle: number): void
  /** 跑一轮当前排队的回调（这一轮新排的留到下一轮） */
  flush(rounds?: number): void
  pending(): number
}

/** 手动时钟：替掉 rAF，测试自己决定什么时候跑（才能看「两帧之内」的状态） */
export function createFrameQueue(): FrameQueue {
  let nextId = 1
  let queue: Array<{ id: number; callback: () => void }> = []
  return {
    nextFrame(callback) {
      const id = nextId++
      queue.push({ id, callback })
      return id
    },
    cancelFrame(handle) {
      queue = queue.filter((item) => item.id !== handle)
    },
    flush(rounds = 1) {
      for (let round = 0; round < rounds; round++) {
        const pending = queue
        queue = []
        for (const item of pending) item.callback()
      }
    },
    pending: () => queue.length,
  }
}

/** 跑完所有排队的微任务（module 里的 afterRender / moveWindowStart 都是 async） */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
