import type { EngineInterface } from 'claude-code'

import type { Snapshot } from '../types'

export type Target = 'raster' | 'web' | 'both'

export type StressPlan = { hz: number; seconds: number; target: Target }

// One sink per target: it pushes one frame and resolves false when refused.
export type Sink = (frame: Snapshot, seq: number) => Promise<boolean>

type Series = number[]

export type StressReport = {
  plan: StressPlan
  startedAt: string
  ticks: number
  dropped: number
  intervalMs: { expected: number; mean: number; p95: number; max: number }
  sinks: Record<string, { pushes: number; refused: number; meanMs: number; p95Ms: number; maxMs: number }>
}

const p95 = (xs: Series) => {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
}
const mean = (xs: Series) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
const round = (n: number) => Math.round(n * 10) / 10

export function parsePlan(args: string): StressPlan | string {
  const [hzText = '30', secondsText = '20', target = 'both'] = args.trim().split(/\s+/).slice(1)
  const hz = Number(hzText)
  const seconds = Number(secondsText)
  if (!Number.isFinite(hz) || hz < 1 || hz > 120) return 'hz must be 1 to 120'
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300) return 'seconds must be 1 to 300'
  if (target !== 'raster' && target !== 'web' && target !== 'both') return 'target must be raster, web or both'

  return { hz, seconds, target }
}

// Fake data that changes every frame but keeps the row count, so a Raster
// blit stays the mounted size.
export function frameOf(base: Snapshot, seq: number): Snapshot {
  const wave = (i: number) => Math.round(50 + 50 * Math.sin(seq / 6 + i))
  const states = ['running', 'working', 'blocked', 'done']

  return {
    ...base,
    loadedAt: Date.now(),
    skills: base.skills.map((s, i) => ({ ...s, uses: wave(i) })),
    jobs: base.jobs.map((j, i) => ({ ...j, state: states[(seq + i) % states.length] ?? 'done' })),
    memory: base.memory.map((m, i) => ({ ...m, in: wave(i) % 9, out: wave(i + 3) % 7 })),
  }
}

export async function runStress(
  $: EngineInterface,
  plan: StressPlan,
  base: Snapshot,
  sinks: Record<string, Sink>,
): Promise<StressReport> {
  const period = 1000 / plan.hz
  const intervals: Series = []
  const timings: Record<string, Series> = {}
  const refused: Record<string, number> = {}
  for (const name of Object.keys(sinks)) {
    timings[name] = []
    refused[name] = 0
  }

  let seq = 0
  let dropped = 0
  let isBusy = false
  let last = await $.clock.now()
  const startedAt = new Date(last).toISOString()

  const tick = async () => {
    const now = await $.clock.now()
    intervals.push(now - last)
    last = now
    // A tick that comes while the last one still pushes is a dropped frame.
    if (isBusy) {
      dropped++
      return
    }
    isBusy = true
    seq++
    const frame = frameOf(base, seq)
    await Promise.all(
      Object.entries(sinks).map(async ([name, sink]) => {
        const t0 = await $.clock.now()
        const isOk = await sink(frame, seq).catch(() => false)
        timings[name]?.push((await $.clock.now()) - t0)
        if (!isOk) refused[name] = (refused[name] ?? 0) + 1
      }),
    )
    isBusy = false
  }

  const timer = $.clock.every(Math.max(1, Math.round(period)), () => void tick())
  await $.clock.sleep(plan.seconds * 1000)
  timer.cancel()

  return {
    plan,
    startedAt,
    ticks: intervals.length,
    dropped,
    intervalMs: {
      expected: round(period),
      mean: round(mean(intervals.slice(1))),
      p95: round(p95(intervals.slice(1))),
      max: round(Math.max(0, ...intervals.slice(1))),
    },
    sinks: Object.fromEntries(
      Object.entries(timings).map(([name, xs]) => [
        name,
        {
          pushes: xs.length,
          refused: refused[name] ?? 0,
          meanMs: round(mean(xs)),
          p95Ms: round(p95(xs)),
          maxMs: round(Math.max(0, ...xs)),
        },
      ]),
    ),
  }
}

export const summary = (r: StressReport) =>
  [
    `stress ${r.plan.target} ${r.plan.hz} Hz × ${r.plan.seconds} s: ${r.ticks} ticks, ${r.dropped} dropped`,
    `timer interval ${r.intervalMs.mean} ms mean / ${r.intervalMs.p95} p95 / ${r.intervalMs.max} max (expected ${r.intervalMs.expected})`,
    ...Object.entries(r.sinks).map(
      ([name, s]) => `${name}: ${s.pushes} pushes, ${s.refused} refused, ${s.meanMs} ms mean / ${s.p95Ms} p95 / ${s.maxMs} max`,
    ),
  ].join('\n')
