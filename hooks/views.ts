import type { JobRow, MemoryRow, SkillRow, Snapshot, Tab } from '../types'

import { C, Canvas } from './paint'

const MODEL_COLOR: Record<string, number> = {
  opus: C.purple,
  sonnet: C.blue,
  haiku: C.green,
  fable: C.orange,
}

const STATE_COLOR: Record<string, number> = {
  running: C.amber,
  done: C.green,
  failed: C.red,
  error: C.red,
}

const GROUP_COLOR: Record<string, number> = {
  project: C.accent,
  feedback: C.amber,
  user: C.green,
  reference: C.teal,
  other: C.dim,
}

const modelColor = (model: string) =>
  Object.entries(MODEL_COLOR).find(([k]) => model.toLowerCase().includes(k))?.[1] ?? C.faint

// One painted block: how many rows it takes and how to draw it at row y.
type Block = { rows: number; draw: (c: Canvas, y: number) => void }

function header(snap: Snapshot, tab: Tab): Block {
  return {
    rows: 3,
    draw: (c, y) => {
      c.card(y, 3, C.accent)
      let x = c.text(2, y + 1, 'ARMORY', C.accent, C.card)
      const running = snap.jobs.filter(j => j.state !== 'done').length
      const stats: [string, number][] = [
        [`${snap.skills.length} skills`, tab === 'skills' ? C.text : C.dim],
        [`${running}/${snap.jobs.length} jobs`, tab === 'jobs' ? C.text : C.dim],
        [`${snap.memory.length} memories`, tab === 'memory' ? C.text : C.dim],
      ]
      for (const [label, fg] of stats) {
        x = c.text(x, y + 1, '  ·  ', C.faint, C.card)
        x = c.text(x, y + 1, label, fg, C.card, c.columns - x - 2)
      }
      if (snap.loadedAt > 0) {
        const at = new Date(snap.loadedAt).toTimeString().slice(0, 5)
        if (x + at.length + 3 < c.columns) c.text(c.columns - at.length - 2, y + 1, at, C.faint, C.card)
      }
    },
  }
}

function skillsBlock(skills: SkillRow[], width: number): Block {
  const max = Math.max(1, ...skills.map(s => s.uses))
  const barW = Math.max(4, Math.min(16, Math.floor(width / 5)))
  const pillW = 8
  const nameW = Math.max(6, width - barW - pillW - 12)

  return {
    rows: skills.length + 2,
    draw: (c, y) => {
      c.card(y, skills.length + 2)
      skills.forEach((s, i) => {
        const r = y + 1 + i
        c.text(2, r, s.name, s.uses > 0 ? C.text : C.dim, C.card, nameW)
        const px = 3 + nameW
        if (s.model === '-') c.text(px + 1, r, '·', C.faint, C.card)
        else c.pill(px, r, s.model.slice(0, pillW - 2), modelColor(s.model))
        const bx = px + pillW + 1
        c.bar(bx, r, barW, s.uses / max, C.accent, C.faint)
        const n = String(s.uses)
        c.text(width - 2 - n.length, r, n, s.uses > 0 ? C.text : C.faint, C.card)
      })
      if (skills.length === 0) c.text(2, y + 1, 'No skills found.', C.dim, C.card)
    },
  }
}

function jobBlock(job: JobRow, width: number): Block {
  const rows = job.detail ? 4 : 3
  const color = STATE_COLOR[job.state] ?? C.dim

  return {
    rows,
    draw: (c, y) => {
      c.card(y, rows, color)
      const x = c.pill(2, y + 1, job.state.toUpperCase(), color)
      c.text(x + 1, y + 1, job.name, C.text, C.card, width - x - 3)
      if (job.detail) c.text(2, y + 2, job.detail, C.dim, C.card, width - 4)
    },
  }
}

function memoryBlock(group: string, items: MemoryRow[], width: number): Block {
  const color = GROUP_COLOR[group] ?? C.dim

  return {
    rows: items.length + 3,
    draw: (c, y) => {
      c.card(y, items.length + 3)
      let x = c.text(2, y + 1, '●', color, C.card)
      x = c.text(x + 1, y + 1, group.toUpperCase(), color, C.card)
      c.text(x + 1, y + 1, String(items.length), C.dim, C.card)
      items.forEach((m, i) => {
        const r = y + 2 + i
        const branch = i === items.length - 1 ? '└' : '├'
        c.text(2, r, branch, C.faint, C.card)
        const counts = `↓${m.in} ↑${m.out}`
        c.text(4, r, m.title, m.in > 0 ? C.text : C.dim, C.card, width - counts.length - 7)
        const cx = width - 2 - counts.length
        const inLen = `↓${m.in}`.length
        c.text(cx, r, `↓${m.in}`, m.in > 0 ? C.green : C.faint, C.card)
        c.text(cx + inLen + 1, r, `↑${m.out}`, m.out > 0 ? C.blue : C.faint, C.card)
      })
    },
  }
}

// Paints the whole body; returns the canvas sized to its content.
export function paint(snap: Snapshot, tab: Tab, width: number): Canvas {
  const blocks: Block[] = [header(snap, tab)]
  if (snap.loadedAt === 0) {
    blocks.push({ rows: 1, draw: (c, y) => c.text(2, y, 'Loading…', C.dim) })
  } else if (tab === 'skills') {
    blocks.push(skillsBlock(snap.skills, width))
  } else if (tab === 'jobs') {
    if (snap.jobs.length === 0) blocks.push({ rows: 1, draw: (c, y) => c.text(2, y, 'No background jobs.', C.dim) })
    for (const j of snap.jobs) blocks.push(jobBlock(j, width))
  } else {
    const groups = [...new Set(snap.memory.map(m => m.group))]
    for (const g of groups) blocks.push(memoryBlock(g, snap.memory.filter(m => m.group === g), width))
  }
  for (const err of snap.errors) blocks.push({ rows: 1, draw: (c, y) => c.text(1, y, err, C.red) })

  const rows = Math.min(256, blocks.reduce((sum, b) => sum + b.rows, 0))
  const canvas = new Canvas(width, Math.max(1, rows))
  let y = 0
  for (const b of blocks) {
    if (y + b.rows > rows) break
    b.draw(canvas, y)
    y += b.rows
  }

  return canvas
}
