// A cell grid for the Raster element: each cell is [codePoint, fg, bg].
export const DEFAULT = 0x01000000

export const C = {
  card: 0x161a22,
  cardEdge: 0x2a303c,
  text: 0xe6e9ef,
  dim: 0x8a93a6,
  faint: 0x4a5162,
  accent: 0x7aa2ff,
  green: 0x5fd38d,
  amber: 0xf5b94a,
  red: 0xff6b6b,
  purple: 0xb48cff,
  blue: 0x5ab0ff,
  teal: 0x4fd6c8,
  orange: 0xff9a4d,
  pillText: 0x0d0f14,
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

// Raster takes only width-1 BMP characters; anything else becomes a dot.
const safe = (ch: string) => {
  const code = ch.codePointAt(0) ?? 0x20
  const isNarrow = code >= 0x20 && code < 0x1100 && code !== 0x7f
  const isGlyph = (code >= 0x2190 && code <= 0x25ff) || code === 0x2026 || code === 0x00b7
  return isNarrow || isGlyph ? code : 0x00b7
}

export class Canvas {
  readonly words: Uint32Array

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    this.words = new Uint32Array(columns * rows * 3)
    for (let i = 0; i < columns * rows; i++) this.words.set([0x20, DEFAULT, DEFAULT], i * 3)
  }

  cell(x: number, y: number, code: number, fg: number, bg?: number) {
    if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) return
    const i = (y * this.columns + x) * 3
    this.words[i] = code
    this.words[i + 1] = fg
    if (bg !== undefined) this.words[i + 2] = bg
  }

  // Writes text from x; returns the column after the last character.
  text(x: number, y: number, text: string, fg: number, bg?: number, max = Infinity) {
    const chars = [...text]
    const room = Math.min(max, this.columns - x)
    const shown = chars.length > room ? [...chars.slice(0, Math.max(0, room - 1)), '…'] : chars
    shown.forEach((ch, k) => this.cell(x + k, y, safe(ch), fg, bg))
    return x + shown.length
  }

  fill(x: number, y: number, w: number, h: number, bg: number) {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) this.cell(c, r, 0x20, DEFAULT, bg)
  }

  // A rounded card from row y, h rows tall, across the full width.
  card(y: number, h: number, edge = C.cardEdge) {
    const w = this.columns
    this.fill(1, y + 1, w - 2, h - 2, C.card)
    this.text(0, y, `╭${'─'.repeat(w - 2)}╮`, edge)
    this.text(0, y + h - 1, `╰${'─'.repeat(w - 2)}╯`, edge)
    for (let r = y + 1; r < y + h - 1; r++) {
      this.cell(0, r, 0x2502, edge)
      this.cell(w - 1, r, 0x2502, edge)
    }
  }

  // A pill: text on a colored background with one space each side.
  pill(x: number, y: number, label: string, bg: number) {
    return this.text(x, y, ` ${label} `, C.pillText, bg)
  }

  // A horizontal bar w cells wide, filled to ratio with eighth blocks.
  bar(x: number, y: number, w: number, ratio: number, fg: number, track: number) {
    const eighths = Math.round(Math.max(0, Math.min(1, ratio)) * w * 8)
    for (let k = 0; k < w; k++) {
      const left = eighths - k * 8
      const glyph = left >= 8 ? '█' : left > 0 ? EIGHTHS[left] ?? '' : ''
      this.cell(x + k, y, glyph ? safe(glyph) : 0x2500, glyph ? fg : track, C.card)
    }
  }

  toBase64() {
    // toBase64 is in the engine's runtime (ES2025); TypeScript 5.7 does not type it yet.
    const bytes = new Uint8Array(this.words.buffer) as Uint8Array & { toBase64(): string }
    return bytes.toBase64()
  }
}
