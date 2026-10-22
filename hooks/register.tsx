import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FileOp, FileRow, GitRepo, JobRow, McpRow, MemoryRow, SessionRow, SkillRow, Snapshot, Tab, Touch } from '../types'

import { parsePlan, runStress, summary } from './stress'
import type { Sink } from './stress'
import { paint } from './views'
import { DEFAULT_THEME, THEMES, buildOf, dataScript, pageOf } from './web'

const PANE = 'armory'
const TITLE = 'Armory'
const EMPTY: Snapshot = { skills: [], jobs: [], memory: [], files: [], sessions: [], git: [], mcp: [], loadedAt: 0, errors: [] }

const tab = atom({ plugin: 'armory', key: 'tab' } as const, 'skills' as Tab)
const snapshot = atom({ plugin: 'armory', key: 'snapshot' } as const, EMPTY)
const cwdAtom = atom({ plugin: 'armory', key: 'cwd' } as const, '')
// Files the tools of this session used, by absolute path.
const touchedAtom = atom({ plugin: 'armory', key: 'touched' } as const, {} as Record<string, Touch>)
// MCP tools this session called, by full tool name: the last time and count.
const mcpUsedAtom = atom({ plugin: 'armory', key: 'mcpUsed' } as const, {} as Record<string, { at: number; uses: number }>)


const LINK = /\[\[([^\]]+)\]\]/g
const ENTRY = /^- \[([^\]]+)\]\(([^)]+)\)/

const frontmatter = (text: string, key: string) =>
  new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(text.split(/^---$/m)[1] ?? '')?.[1]?.trim()

const groupOf = (file: string) => {
  const prefix = file.split('_')[0] ?? ''
  return ['project', 'feedback', 'user', 'reference'].includes(prefix) ? prefix : 'other'
}

// Use counts of slash commands in history.jsonl. The file grows without end
// and $.fs.read refuses one over 4 MiB, so grep, sort and uniq count it
// outside the plugin and answer one short line per command. $.fs.read is the
// fallback where those tools fail.
const COUNT = `grep -oE '"display":"/[^[:space:]"]+' "$1" | sort | uniq -c`

async function countUses($: EngineInterface, file: string, errors: string[]) {
  const uses = new Map<string, number>()
  const counted = await $.process.run(['sh', '-c', COUNT, 'count', file], { timeoutMs: 10000 }).catch(() => undefined)
  // grep answers 1 when no line matches: an empty count, not a failure.
  if (counted && (counted.exitCode === 0 || counted.stdout === '')) {
    for (const line of counted.stdout.split('\n')) {
      const m = /^\s*(\d+) "display":"\/(.+)$/.exec(line)
      if (m?.[1] && m[2]) uses.set(m[2], Number(m[1]))
    }
    return uses
  }
  try {
    const history: string = await $.fs.read(file)
    for (const line of history.split('\n')) {
      const display = /"display":"\/([^\s"]+)/.exec(line)?.[1]
      if (display) uses.set(display, (uses.get(display) ?? 0) + 1)
    }
  } catch (err) {
    errors.push(`history.jsonl: ${String(err)}`)
  }

  return uses
}

async function loadSkills($: EngineInterface, home: string, errors: string[]): Promise<SkillRow[]> {
  const commands = (await $.command.list()) as { name: string; source: string }[]
  const own = commands.filter(c => c.source === 'user' || c.source === 'plugin')

  const uses = await countUses($, `${home}/.claude/history.jsonl`, errors)

  return Promise.all(
    own.map(async c => {
      const skillFile = `${home}/.claude/skills/${c.name}/SKILL.md`
      const text: string | undefined = await $.fs.read(skillFile).catch(() => undefined)
      const model = (text && frontmatter(text, 'model')) || '-'

      return { name: c.name, source: c.source, model, uses: uses.get(c.name) ?? 0 }
    }),
  ).then(rows => rows.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)))
}

async function loadJobs($: EngineInterface, home: string, errors: string[]): Promise<JobRow[]> {
  const dir = `${home}/.claude/jobs`
  const entries = (await $.fs.list(dir).catch(() => [])) as { name: string; kind: string }[]
  const rows: JobRow[] = []
  // $.fs.list names a folder 'dir'.
  for (const entry of entries.filter(e => e.kind === 'dir' || e.kind === 'directory')) {
    // A folder with no state.json is a leftover, not a job: skip it.
    const text: string | undefined = await $.fs.read(`${dir}/${entry.name}/state.json`).catch(() => undefined)
    if (text === undefined) continue
    try {
      const state = JSON.parse(text)
      // Only these fields leave the file: it also holds the job's output and
      // provider settings.
      const cwd = typeof state.cwd === 'string' ? state.cwd : ''
      rows.push({
        id: entry.name,
        name: state.intent ?? state.name ?? entry.name,
        state: state.state ?? '?',
        detail: state.detail ?? '',
        session: typeof state.sessionId === 'string' ? state.sessionId : '',
        cwd: home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd,
      })
    } catch (err) {
      errors.push(`job ${entry.name}: ${String(err)}`)
    }
  }

  return rows
}

async function loadMemory($: EngineInterface, home: string, cwd: string, errors: string[]): Promise<MemoryRow[]> {
  const dir = `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/memory`
  // A project with no memory yet has no MEMORY.md: an empty colony, not an error.
  if (!(await $.fs.exists(`${dir}/MEMORY.md`).catch(() => false))) return []
  let index: string
  try {
    index = await $.fs.read(`${dir}/MEMORY.md`)
  } catch (err) {
    errors.push(`MEMORY.md: ${String(err)}`)
    return []
  }

  const rows = await Promise.all(
    index
      .split('\n')
      .map(line => ENTRY.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(async ([, title = '', file = '']) => {
        const text: string = await $.fs.read(`${dir}/${file}`).catch(() => '')
        const slug = frontmatter(text, 'name') ?? file.replace(/\.md$/, '')
        const links = [...text.matchAll(LINK)].map(m => m[1] ?? '')

        return { row: { group: groupOf(file), title, slug, out: links.length, in: 0, links, size: text.length }, links }
      }),
  )

  const inbound = new Map<string, number>()
  for (const { links } of rows) for (const l of links) inbound.set(l, (inbound.get(l) ?? 0) + 1)

  return rows.map(({ row }) => ({ ...row, in: inbound.get(row.slug) ?? 0 }))
}

// The FILES hub shows the top level of the session folder, folded, and opens
// only the folders on the way to a file a tool used. Each open folder is
// listed again on every load: a file that appears in it is new, and a used
// file that is gone from it is removed.
const HIDDEN = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.DS_Store', '.next', '.cache'])
const MAX_TOUCHED = 120
const known = new Map<string, Set<string>>()

const dirname = (path: string) => path.slice(0, Math.max(1, path.lastIndexOf('/')))
const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function shown(path: string, cwd: string, home: string) {
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`
  return path
}

async function loadFiles($: EngineInterface, home: string, cwd: string): Promise<FileRow[]> {
  const touched = { ...(await read($, touchedAtom)) }
  const now = Date.now()
  // Sizes of the files in the folders listed below, from the same listings.
  const sizes = new Map<string, number>()

  // The folders on the way to each used file, below the session folder or home.
  const open = new Set<string>()
  for (const path of Object.keys(touched)) {
    for (let dir = dirname(path); dir !== cwd && dir !== home && dir.length > 1; dir = dirname(dir)) open.add(dir)
    open.add(dirname(path))
  }
  open.add(cwd)

  for (const dir of open) {
    const entries = await $.fs.list(dir).catch(() => undefined)
    if (!entries) {
      for (const path of Object.keys(touched)) if (path.startsWith(`${dir}/`)) delete touched[path]
      known.delete(dir)
      continue
    }
    const names = new Set(entries.filter(e => !HIDDEN.has(e.name)).map(e => e.name))
    for (const e of entries) if (e.kind === 'file') sizes.set(`${dir}/${e.name}`, e.size)
    const before = known.get(dir)
    if (before && dir !== cwd) {
      for (const e of entries) {
        // Only a file no tool used: a tool's own use says what it did.
        const path = `${dir}/${e.name}`
        if (e.kind === 'file' && names.has(e.name) && !before.has(e.name) && !touched[path]) touched[path] = { at: now, op: 'new' }
      }
    }
    known.set(dir, names)
    for (const path of Object.keys(touched)) if (dirname(path) === dir && !names.has(basename(path))) delete touched[path]
  }

  const kept = Object.entries(touched).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_TOUCHED)
  await update($, touchedAtom, () => Object.fromEntries(kept))

  const rows = new Map<string, FileRow>()
  const top = await $.fs.list(cwd).catch(() => [])
  for (const e of top) {
    if (e.name.startsWith('.') || HIDDEN.has(e.name)) continue
    rows.set(e.name, { path: e.name, kind: e.kind === 'dir' ? 'dir' : 'file', at: 0, op: '', size: e.kind === 'file' ? e.size : 0 })
  }
  for (const [path, t] of kept) {
    rows.set(shown(path, cwd, home), { path: shown(path, cwd, home), kind: 'file', at: t.at, op: t.op, size: sizes.get(path) ?? 0 })
  }

  return [...rows.values()]
}

// The GIT colony: the repo that holds the session folder, the repos in the
// folders one level below it, and the repos that hold the files this
// session used; forty at most. One shell run per repo gives the branch line,
// the changes, their line counts and the commits not pushed. A repo that
// holds a used file is read at each load; the others when their last read is
// older than STALE_MS, a few per load, so a large folder costs little.
const GIT = `cd "$1" || exit 1
git status --porcelain=v1 -b -uall 2>/dev/null | head -121
echo @@
git diff --numstat HEAD 2>/dev/null | head -300
echo @@
git log --format='%h %s' '@{u}..' 2>/dev/null | head -20`
const MAX_REPOS = 40
const MAX_CHANGES = 60
const STALE_MS = 30000
const STALE_PER_LOAD = 4
const repoOf = new Map<string, string>()
const gitCache = new Map<string, { at: number; repo: GitRepo | undefined }>()
let scan = { at: 0, cwd: '', roots: [] as string[] }

async function gitRoot($: EngineInterface, dir: string) {
  const known = repoOf.get(dir)
  if (known !== undefined) return known
  const out = await $.process.run(['git', '-C', dir, 'rev-parse', '--show-toplevel'], { timeoutMs: 3000 }).catch(() => undefined)
  const root = out && out.exitCode === 0 ? out.stdout.trim() : ''
  repoOf.set(dir, root)
  return root
}

// The repo that holds the session folder, and the repos one level below it
// (by a .git entry); the scan runs again after STALE_MS.
async function scanRepos($: EngineInterface, cwd: string) {
  if (scan.cwd === cwd && Date.now() - scan.at < STALE_MS) return scan.roots
  const roots: string[] = []
  const own = await gitRoot($, cwd)
  if (own) roots.push(own)
  const entries = await $.fs.list(cwd).catch(() => [])
  for (const e of entries) {
    if (e.kind !== 'dir' || e.name.startsWith('.') || HIDDEN.has(e.name)) continue
    const dir = `${cwd}/${e.name}`
    if (!roots.includes(dir) && (await $.fs.exists(`${dir}/.git`).catch(() => false))) roots.push(dir)
  }
  scan = { at: Date.now(), cwd, roots }
  return roots
}

async function loadGit($: EngineInterface, home: string, cwd: string): Promise<GitRepo[]> {
  const touched = await read($, touchedAtom)
  const dirs = [...new Set(Object.entries(touched).sort((a, b) => b[1].at - a[1].at).map(([path]) => dirname(path)))]
  const hot: string[] = []
  for (const dir of dirs) {
    if (hot.length >= MAX_REPOS) break
    const root = await gitRoot($, dir)
    if (root && !hot.includes(root)) hot.push(root)
  }
  const roots = [...hot, ...(await scanRepos($, cwd)).filter(r => !hot.includes(r))].slice(0, MAX_REPOS)
  const now = Date.now()
  // A repo never read is read now; of the others, the oldest few.
  const cold = roots.filter(r => !hot.includes(r))
  const never = cold.filter(r => !gitCache.has(r))
  const stale = cold.filter(r => gitCache.has(r) && now - gitCache.get(r)!.at > STALE_MS)
    .sort((a, b) => gitCache.get(a)!.at - gitCache.get(b)!.at).slice(0, STALE_PER_LOAD)
  await Promise.all([...hot, ...never, ...stale].map(async root => {
    const out = await $.process.run(['sh', '-c', GIT, 'git', root], { timeoutMs: 5000 }).catch(() => undefined)
    const repo = out && out.exitCode === 0 ? parseGit(out.stdout, root, path => shown(path, cwd, home)) : undefined
    gitCache.set(root, { at: now, repo })
  }))
  return roots.flatMap(root => {
    const repo = gitCache.get(root)?.repo
    return repo ? [repo] : []
  })
}

export function parseGit(text: string, root: string, show: (path: string) => string): GitRepo {
  const [status = '', numstat = '', log = ''] = text.split(/^@@$/m)
  const lines = status.split('\n').filter(Boolean)
  const head = lines[0]?.startsWith('## ') ? lines.shift()!.slice(3) : ''
  // "main...origin/main [ahead 2, behind 1]", "No commits yet on main", "HEAD (no branch)".
  const branch = /^No commits yet on (.+)$/.exec(head)?.[1] ?? head.split('...')[0]?.split(' ')[0] ?? ''
  const counts = new Map<string, { add: number; del: number }>()
  for (const line of numstat.split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (m?.[3]) counts.set(m[3], { add: m[1] === '-' ? 0 : Number(m[1]), del: m[2] === '-' ? 0 : Number(m[2]) })
  }
  const changes = lines.slice(0, MAX_CHANGES).map(line => {
    const xy = line.slice(0, 2)
    const path = line.slice(3).split(' -> ').pop() ?? ''
    const state = xy === '??' ? '?' : (xy.replace(/ /g, '')[0] ?? 'M')
    const c = counts.get(path) ?? { add: 0, del: 0 }
    return { path, file: show(`${root}/${path}`), state, add: c.add, del: c.del }
  })
  const commits = log.split('\n').filter(Boolean).map(line => ({ hash: line.slice(0, line.indexOf(' ')), subject: line.slice(line.indexOf(' ') + 1) }))
  return {
    root: show(root),
    name: basename(root),
    branch,
    upstream: head.includes('...'),
    ahead: Number(/ahead (\d+)/.exec(head)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(head)?.[1] ?? 0),
    changes,
    commits,
  }
}

// The MCP colony. The config files give the servers that should be there:
// ~/.claude.json (user scope, and the local scope of the session folder) and
// <folder>/.mcp.json (project scope). Only each server's name, transport type
// and scope are read; env, args, headers and url can hold secrets and stay
// in the file. The tools the model has now give the servers that connected
// (mcp__<server>__<tool>; a server name in a tool name has each character
// outside [A-Za-z0-9_-] as _). A server with only its log-in tools needs a
// log-in; a configured server with no tools did not connect. The colony
// shows only servers you use: the connected ones, the ones in your config,
// and the claude.ai connectors you connected before (claudeAiMcpEverConnected
// in ~/.claude.json); a default connector you never connected is left out.
const mcpKey = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, '_')
const AUTH_TOOL = /^(authenticate|complete_authentication)$/

async function loadMcp($: EngineInterface, home: string, cwd: string): Promise<McpRow[]> {
  const names = (o: unknown) => Object.entries((o ?? {}) as Record<string, { type?: unknown }>)
    .map(([name, v]) => ({ name, type: typeof v?.type === 'string' ? v.type : 'stdio' }))
  const configured: { name: string; scope: string; type: string }[] = []
  let ever: string[] = []
  try {
    const user = JSON.parse(await $.fs.read(`${home}/.claude.json`)) as {
      mcpServers?: unknown; projects?: Record<string, { mcpServers?: unknown }>; claudeAiMcpEverConnected?: unknown }
    for (const s of names(user.mcpServers)) configured.push({ ...s, scope: 'user' })
    for (const s of names(user.projects?.[cwd]?.mcpServers)) configured.push({ ...s, scope: 'local' })
    if (Array.isArray(user.claudeAiMcpEverConnected)) ever = user.claudeAiMcpEverConnected.filter((n): n is string => typeof n === 'string')
  } catch {
    // No user config: only the project file and the live tools.
  }
  try {
    const project = JSON.parse(await $.fs.read(`${cwd}/.mcp.json`)) as { mcpServers?: unknown }
    for (const s of names(project.mcpServers)) configured.push({ ...s, scope: 'project' })
  } catch {
    // No project file.
  }
  const tools = new Map<string, string[]>()
  for (const t of await $.tool.list().catch(() => [])) {
    const m = /^mcp__(.+?)__(.+)$/.exec(t.name)
    if (!t.mcp || !m?.[1] || !m[2]) continue
    tools.set(m[1], [...(tools.get(m[1]) ?? []), m[2]])
  }
  const used = await read($, mcpUsedAtom)
  const rows = new Map<string, McpRow>()
  const row = (key: string, name: string, scope: string, type: string): McpRow => {
    const list = tools.get(key) ?? []
    const real = list.filter(t => !AUTH_TOOL.test(t))
    return {
      name, scope, type,
      status: real.length ? 'connected' : list.length ? 'auth' : 'off',
      tools: real.length,
      used: Object.entries(used).filter(([tool]) => tool.startsWith(`mcp__${key}__`))
        .map(([tool, u]) => ({ tool: tool.slice(`mcp__${key}__`.length), at: u.at, uses: u.uses }))
        .sort((a, b) => b.at - a.at).slice(0, 12),
    }
  }
  for (const c of configured) if (!rows.has(mcpKey(c.name))) rows.set(mcpKey(c.name), row(mcpKey(c.name), c.name, c.scope, c.type))
  // The claude.ai connectors connected before, even when gone or logged out.
  for (const name of ever) if (!rows.has(mcpKey(name))) rows.set(mcpKey(name), row(mcpKey(name), name, 'claude.ai', 'http'))
  // Other connected servers: claude.ai connectors and plugins. One with only
  // its log-in tools that was never connected is a default: left out.
  for (const key of tools.keys()) {
    if (rows.has(key)) continue
    const name = key.startsWith('claude_ai_') ? `claude.ai ${key.slice(10).replace(/_/g, ' ')}` : key.startsWith('plugin_') ? key.slice(7) : key
    const r = row(key, name, key.startsWith('claude_ai_') ? 'claude.ai' : key.startsWith('plugin_') ? 'plugin' : 'other', 'http')
    if (r.status === 'connected') rows.set(key, r)
  }
  return [...rows.values()]
}

// Records an MCP tool call (its name and time; never the arguments), then
// loads the MCP colony again soon. Calls in one burst share one load.
let mcpPending = false
async function usedMcp($: EngineInterface, tool: string) {
  await update($, mcpUsedAtom, u => ({ ...u, [tool]: { at: Date.now(), uses: (u[tool]?.uses ?? 0) + 1 } }))
  if (mcpPending) return
  mcpPending = true
  await $.clock.sleep(300)
  mcpPending = false
  const home = (await $.env.get('HOME')) ?? ''
  const mcp = await loadMcp($, home, await read($, cwdAtom))
  const next = await update($, snapshot, s => ({ ...s, mcp }))
  if (web.isOn) await writeData($, next, 1000)
}

// Passes a tool's result on and, when the call ran without error, lights its
// file. A refused or failed call lights nothing.
function lit<R extends { deny?: string; isError?: boolean }>($: EngineInterface, ran: R, path: unknown, op: FileOp) {
  if (typeof path === 'string' && ran.deny === undefined && !ran.isError) void touch($, path, op).catch(() => undefined)

  return ran
}

// The running sessions. Each Claude Code process keeps ~/.claude/sessions/
// <pid>.json; a file whose process is gone is skipped. Only the fields below
// are read: the folder also holds key files and messaging sockets, which
// Armory never touches.
async function loadSessions($: EngineInterface, home: string): Promise<SessionRow[]> {
  const dir = `${home}/.claude/sessions`
  const entries = await $.fs.list(dir).catch(() => [])
  const rows: SessionRow[] = []
  for (const e of entries) {
    if (e.kind !== 'file' || !/^\d+\.json$/.test(e.name)) continue
    try {
      const d = JSON.parse(await $.fs.read(`${dir}/${e.name}`)) as Record<string, unknown>
      if (typeof d.pid !== 'number' || typeof d.sessionId !== 'string') continue
      const cwd = typeof d.cwd === 'string' ? d.cwd : ''
      rows.push({
        pid: d.pid,
        id: d.sessionId,
        name: typeof d.name === 'string' && d.name ? d.name : d.sessionId.slice(0, 8),
        cwd: home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd,
        status: typeof d.status === 'string' ? d.status : '?',
        since: typeof d.statusUpdatedAt === 'number' ? d.statusUpdatedAt : 0,
        self: false,
      })
    } catch {
      // A file in the middle of a write: the next check reads it.
    }
  }
  if (rows.length === 0) return rows
  // One ps call tells which processes still run.
  const ps = await $.process.run(['ps', '-o', 'pid=', '-p', rows.map(r => r.pid).join(',')]).catch(() => undefined)
  const alive = new Set((ps?.stdout ?? '').split(/\s+/).filter(Boolean).map(Number))
  const self = Number(await claudePidOf($))

  return rows
    .filter(r => alive.has(r.pid))
    .map(r => ({ ...r, self: r.pid === self }))
    .sort((a, b) => a.pid - b.pid)
}

// Other sessions, git and MCP servers change while this one is idle (a
// commit runs in Bash, which lights no file; a server connects late), so a
// timer checks them and writes the page data only when something changed.
let sessionTimer: { cancel: () => void } | undefined
async function checkSessions($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  const cwd = await read($, cwdAtom)
  const [sessions, git, mcp] = await Promise.all([
    loadSessions($, home), loadGit($, home, cwd).catch(() => undefined), loadMcp($, home, cwd).catch(() => undefined)])
  const before = await read($, snapshot)
  const same = JSON.stringify(before.sessions) === JSON.stringify(sessions)
  const sameGit = !git || JSON.stringify(before.git) === JSON.stringify(git)
  const sameMcp = !mcp || JSON.stringify(before.mcp) === JSON.stringify(mcp)
  if (same && sameGit && sameMcp) return
  const next = await update($, snapshot, s => ({ ...s, sessions, git: git ?? s.git, mcp: mcp ?? s.mcp }))
  if (web.isOn) await writeData($, next, 1000)
}

// Records a file a tool used, then loads the FILES hub again soon. Calls in
// one burst share one load.
let filesPending = false
async function touch($: EngineInterface, path: string, op: FileOp) {
  const cwd = await read($, cwdAtom)
  const abs = path.startsWith('/') ? path : `${cwd}/${path}`
  await update($, touchedAtom, t => ({ ...t, [abs]: { at: Date.now(), op } }))
  if (filesPending) return
  filesPending = true
  await $.clock.sleep(300)
  filesPending = false
  const home = (await $.env.get('HOME')) ?? ''
  const [files, git] = await Promise.all([loadFiles($, home, cwd), loadGit($, home, cwd).catch(() => undefined)])
  const next = await update($, snapshot, s => ({ ...s, files, git: git ?? s.git }))
  if (web.isOn) await writeData($, next, 1000)
}

// The folder the session started in, from its file in ~/.claude/sessions.
// The engine reports the current folder, which a cd moves; memory and the
// FILES colony belong to the start folder.
async function startDir($: EngineInterface, home: string, fallback: string) {
  const pid = await claudePidOf($)
  const text = await $.fs.read(`${home}/.claude/sessions/${pid}.json`).catch(() => '')
  try {
    const cwd = (JSON.parse(text) as { cwd?: unknown }).cwd
    return typeof cwd === 'string' && cwd.startsWith('/') ? cwd : fallback
  } catch {
    return fallback
  }
}

async function refresh($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  const cwd = await read($, cwdAtom)
  const errors: string[] = []
  const [skills, jobs, memory, files, sessions, git, mcp] = await Promise.all([
    loadSkills($, home, errors).catch(err => (errors.push(`skills: ${String(err)}`), [])),
    loadJobs($, home, errors),
    loadMemory($, home, cwd, errors),
    loadFiles($, home, cwd).catch(err => (errors.push(`files: ${String(err)}`), [])),
    loadSessions($, home).catch(err => (errors.push(`sessions: ${String(err)}`), [])),
    loadGit($, home, cwd).catch(err => (errors.push(`git: ${String(err)}`), [])),
    loadMcp($, home, cwd).catch(err => (errors.push(`mcp: ${String(err)}`), [])),
  ])
  const next = { skills, jobs, memory, files, sessions, git, mcp, loadedAt: Date.now(), errors }
  await update($, snapshot, () => next)
  if (web.isOn) await writeData($, next, 1000)
}

// The web page and the last Raster size live only in this process; a reload
// starts them over, and /armory web turns the page on again.
const web = { isOn: false, dir: '', seq: 0, pane: undefined as string | undefined, theme: DEFAULT_THEME, page: '' }
let mounted: { columns: number; rows: number; tab: Tab } | undefined

async function writeData($: EngineInterface, snap: Snapshot, pollMs: number) {
  // The page reloads when the data's build differs from its own, so the page
  // on disk must be the current one first, or it would reload without end.
  if (web.page !== buildOf(web.theme)) await writePage($)
  web.seq++
  await $.fs.write(`${web.dir}/data.js`, dataScript(snap, web.seq, pollMs, web.theme))
}

// Each session has its own folder for the page and its data, named like the
// split's signature, so two sessions never overwrite each other. The close
// step deletes it; folders that crashed sessions left are pruned after 2 days.
async function sessionDir($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  const base = `${home}/.claude/armory/web`

  return { base, dir: `${base}/${(await signatureTail($)).replace(/-$/, '')}` }
}

async function openWeb($: EngineInterface, isFallbackOk = true) {
  const { base, dir } = await sessionDir($)
  if (base.startsWith('/') && base.endsWith('/.claude/armory/web')) {
    await $.process.run(['find', base, '-mindepth', '1', '-maxdepth', '1', '-type', 'd', '-mtime', '+2', '-exec', 'rm', '-rf', '{}', '+'])
      .catch(() => undefined)
  }
  web.dir = dir
  web.theme = await themeOf($)
  await writePage($)
  web.isOn = true
  await writeData($, await read($, snapshot), 1000)
  const page = `${web.dir}/index.html`

  // Prefer a terminal-browser split beside the chat, one per session: the
  // URL carries the session id, which session.end matches to close it. The
  // page polls data.js, so a split that already shows it needs nothing more.
  const signature = await signatureOf($)
  const listed = await $.process.run(['terminal-browser', 'ls', '--json']).catch(() => undefined)
  if (listed?.exitCode === 0) {
    if (listed.stdout.includes(`${page}?${signature}`)) {
      await watchSession($).catch(() => undefined)
      return `${page} (already open in terminal-browser)`
    }
    // A split of this session that shows another page (the shared page of an
    // older version) closes first; the new split replaces it.
    if (listed.stdout.includes(signature)) {
      const tail = await signatureTail($)
      await $.process.run(['pkill', '-f', `armory-watch-${tail}`]).catch(() => undefined)
      await $.process.run(['sh', '-c', closeScript(tail, await paneOf($), undefined)], { timeoutMs: 4000 })
    }
    const url = `file://${page}?${signature}`
    const opened = await $.process.run(['terminal-browser', 'open', url, '--split', 'right', '--size', '0.4', '--no-merge'])
    if (opened.exitCode === 0) {
      await watchSession($).catch(() => undefined)
      return `${page} (terminal-browser split)`
    }
  }
  if (!isFallbackOk) {
    web.isOn = false
    return undefined
  }
  await $.process.run(['open', page])

  return `${page} (default browser)`
}

async function writePage($: EngineInterface) {
  await $.fs.write(`${web.dir}/index.html`, pageOf(web.theme))
  web.page = buildOf(web.theme)
}

// The theme the person chose last, kept across sessions in the plugin's store.
async function themeOf($: EngineInterface) {
  const saved = await $.store.get('theme').catch(() => undefined)

  return typeof saved === 'string' && saved in THEMES ? saved : DEFAULT_THEME
}

// Saves the theme and rewrites the page. An open split sees the new theme
// name in data.js and reloads itself.
async function setTheme($: EngineInterface, name: string) {
  const names = Object.keys(THEMES)
  if (!name) return `Theme: ${await themeOf($)}. Themes: ${names.join(', ')}. Change it with /armory theme <name>.`
  if (!names.includes(name)) return `No theme named ${name}. Themes: ${names.join(', ')}.`
  await $.store.set('theme', name)
  web.theme = name
  if (web.isOn) {
    await writePage($)
    await writeData($, await read($, snapshot), 1000)
  }

  return `Armory theme: ${name}.`
}

// The pid of this Claude Code process: the nearest ancestor named claude of a
// shell the engine starts. Cached, as it does not change in one process.
let claudePid: string | undefined
async function claudePidOf($: EngineInterface) {
  if (claudePid) return claudePid
  const walk = [
    'p=$PPID',
    `while [ "$p" -gt 1 ]; do case "$(ps -o comm= -p "$p")" in *claude) echo "$p"; exit 0;; esac; p=$(ps -o ppid= -p "$p" | tr -d ' '); done`,
  ].join('\n')
  const found = await $.process.run(['sh', '-c', walk], { timeoutMs: 3000 }).catch(() => undefined)
  const pid = found?.stdout.trim()
  if (pid && /^\d+$/.test(pid)) claudePid = pid

  return claudePid ?? '0'
}

// Session id and process id: a resumed session keeps its id, so the pid keeps
// the old process's split apart from the new one. The trailing dash ends the
// match, so pid 42 never matches pid 421.
const signatureTail = async ($: EngineInterface) =>
  `${(await $.session.id()).replace(/[^A-Za-z0-9-]/g, '')}-p${await claudePidOf($)}-`
const signatureOf = async ($: EngineInterface) => `armory-session=${await signatureTail($)}`

// The Ghostty pane that shows this session's split, from terminal-browser ls.
// Pane ids are uppercase hex and dashes, so they are safe in a shell script.
async function paneOf($: EngineInterface) {
  const signature = await signatureOf($)
  const listed = await $.process.run(['terminal-browser', 'ls', '--json']).catch(() => undefined)
  if (listed?.exitCode !== 0) return undefined
  try {
    const { browsers = [] } = JSON.parse(listed.stdout) as {
      browsers?: { key?: string; pane?: { pane?: string }; tabs?: { url?: string }[] }[]
    }
    const split = browsers.find(b => b.tabs?.some(t => t.url?.includes(signature)))
    const pane = split?.pane?.pane
    if (!pane || !/^[A-F0-9-]+$/i.test(pane)) return undefined
    // The link router reads this to open links in this split. It runs
    // outside the terminal, where terminal-browser ls does not list it.
    if (web.dir && split?.key) await $.fs.write(`${web.dir}/split.json`, `${JSON.stringify({ key: split.key, pane })}\n`)

    return pane
  } catch {
    return undefined
  }
}

// Shell lines that close the split. A killed client leaves Ghostty's "Process
// exited" notice in the pane, so the script then closes the pane itself.
// It also deletes the session's page folder, when it is given one.
const closeScript = (tail: string, pane: string | undefined, dir: string | undefined) =>
  [
    `sig='armory-session='; tail='${tail}'`,
    `pkill -TERM -f "$sig$tail"`,
    ...(pane ? [`sleep 0.5`, `osascript -e 'tell application "Ghostty" to close terminal id "${pane}"'`] : []),
    ...(dir && /\/\.claude\/armory\/web\/[A-Za-z0-9-]+$/.test(dir) ? [`rm -rf '${dir}'`] : []),
  ].join('; ')

// Runs a script in a new session, apart from the process group of Claude Code:
// the exit of Claude Code stops its whole group, which stopped the watcher.
const detach = ($: EngineInterface, script: string) =>
  $.process.run(
    ['sh', '-c', `/usr/bin/perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' /bin/sh -c "$0" </dev/null >/dev/null 2>&1 &`, script],
    { timeoutMs: 3000 },
  )

// A detached shell that waits for this Claude Code process to exit, for any
// reason, then closes the split. The script spells the signature in two parts
// so that its own command line never matches it, and carries an armory-watch
// marker so a second start does not add a second watcher.
async function watchSession($: EngineInterface) {
  const pid = await claudePidOf($)
  if (pid === '0') return
  const tail = await signatureTail($)
  const marker = `armory-watch-${tail}`
  web.pane = await paneOf($)
  const found = await $.process.run(['pgrep', '-f', marker]).catch(() => undefined)
  if (found?.exitCode === 0) return
  const wait = `while kill -0 ${pid} 2>/dev/null; do sleep 2; done`
  const { dir } = await sessionDir($)
  await detach($, `: ${marker}; trap '' HUP; ${wait}; ${closeScript(tail, web.pane, dir)}`)
}

// Closes the split. session.end gets little time, so this uses the pane id
// that watchSession saved and does not wait for the close to finish.
async function closeWeb($: EngineInterface) {
  await detach($, closeScript(await signatureTail($), web.pane, (await sessionDir($)).dir))
}

// One line per run in outcomes.log: when, what was asked, and the summary.
async function keepOutcome($: EngineInterface, args: string, text: string) {
  const home = (await $.env.get('HOME')) ?? ''
  const file = `${home}/.claude/armory/stress/outcomes.log`
  const old = await $.fs.read(file).catch(() => '')
  const entry = `## ${new Date().toISOString()}  /armory ${args.trim()}\n${text}\n\n`
  await $.fs.write(file, (old + entry).slice(-200_000))
}

async function results($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  const log: string = await $.fs.read(`${home}/.claude/armory/stress/outcomes.log`).catch(() => '')
  const runs = log.split(/^(?=## )/m).filter(Boolean)
  if (runs.length === 0) return 'No stress results yet.'

  return runs.slice(-6).join('').trim()
}

async function stress($: EngineInterface, args: string) {
  const plan = parsePlan(args)
  if (typeof plan === 'string') return `Usage: /armory stress <hz> <seconds> <raster|web|both> (${plan})`

  const base = await read($, snapshot)
  const pollMs = Math.max(8, Math.round(1000 / plan.hz))
  const sinks: Record<string, Sink> = {}
  if (plan.target !== 'web') {
    if (!mounted) {
      const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })
      if (!isPlaced) return 'raster: the Armory pane is not on screen (the terminal is too narrow for it). Widen the window or close the split, then run /armory to open it.'
      for (let i = 0; i < 20 && !mounted; i++) await $.clock.sleep(50)
    }
    const size = mounted as { columns: number; rows: number; tab: Tab } | undefined
    if (!size) return 'raster: the Armory pane did not draw within 1 s.'
    sinks.raster = async frame => {
      const canvas = paint(frame, size.tab, size.columns)
      if (canvas.rows !== size.rows) return false
      const result = await $.ui.blit({ requestId: PANE, key: 'body', cells: canvas.toBase64() })
      return !('deny' in result)
    }
  }
  if (plan.target !== 'raster') {
    if (!web.isOn) await openWeb($)
    sinks.web = async frame => (await writeData($, frame, pollMs), true)
  }

  await $.ui.status(`armory: stress ${plan.target} ${plan.hz} Hz…`)
  const report = await runStress($, plan, base, sinks)
  await $.ui.status(undefined)
  const home = (await $.env.get('HOME')) ?? ''
  const file = `${home}/.claude/armory/stress/${report.startedAt.replace(/[:.]/g, '-')}.json`
  await $.fs.write(file, `${JSON.stringify(report, null, 2)}\n`)
  // Put the real data back on both targets.
  await update($, snapshot, s => ({ ...s, loadedAt: Date.now() }))
  if (web.isOn) await writeData($, base, 1000)

  return `${summary(report)}\nsaved ${file}`
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
    const cwd = await startDir($, home, e.cwd).catch(() => e.cwd)
    await update($, cwdAtom, () => cwd)
    await $.command.register({
      name: 'armory',
      description: 'Open the Armory pane (skills, jobs, memory)',
    })
    // An interactive terminal session opens the web page in a terminal-browser
    // split; without terminal-browser, the Raster pane opens in its place.
    // Background and headless sessions open nothing.
    sessionTimer?.cancel()
    sessionTimer = $.clock.every(5000, () => void checkSessions($).catch(() => undefined))
    if (e.isInteractive && e.surface === 'terminal') {
      void (async () => {
        await refresh($)
        const page = await openWeb($, false).catch(() => undefined)
        if (!page) await $.ui.open({ id: PANE, title: TITLE })
      })().catch(() => undefined)
    } else {
      void refresh($)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await closeWeb($).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'armory' }, async ($, e) => {
    const verb = e.args.trim().split(/\s+/)[0] ?? ''
    if (verb === 'web') return { text: `Armory web page opened: ${(await openWeb($)) ?? ''}` }
    if (verb === 'stress') {
      // The run outlives the hook's time budget, so it reports by toast and
      // keeps every outcome, a refusal or a failure too, for /armory results.
      void stress($, e.args)
        .catch(err => `armory stress failed: ${String(err)}`)
        .then(async text => {
          await keepOutcome($, e.args, text)
          await $.ui.toast(text.split('\n')[0] ?? text)
        })
      return { text: 'Armory stress test started. Run /armory results when it ends.' }
    }
    if (verb === 'results') return { text: await results($) }
    if (verb === 'theme') return { text: await setTheme($, e.args.trim().split(/\s+/)[1] ?? '') }
    if (verb === 'close') {
      await closeWeb($)
      web.isOn = false
      return { text: 'Armory web split closed.' }
    }

    await $.ui.open({ id: PANE, title: TITLE })
    await refresh($)

    return { text: 'Armory pane opened. Also: /armory web, /armory theme <name>, /armory stress <hz> <seconds> <raster|web|both>' }
  })

  // A tool that read or changed a file lights it on the FILES hub. Armory
  // only watches: if a hook fails, the call goes on as if it were not there
  // (a next(e) that already ran replays its result; the tool never runs twice).
  on('tool.call', { tool: 'Read' }, async ($, e, next) => lit($, await next(e), e.file_path, 'read')).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => lit($, await next(e), e.file_path, 'write')).catch(($, e, next) => next(e))
  // A Write that creates its file is new; one that replaces a file is a write.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const existed = await $.fs.exists(e.file_path).catch(() => true)

    return lit($, await next(e), e.file_path, existed ? 'write' : 'new')
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => lit($, await next(e), e.notebook_path, 'write')).catch(($, e, next) => next(e))
  // Every MCP tool call lights its server and tool on the MCP colony.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    if (tool.startsWith('mcp__') && ran.deny === undefined) void usedMcp($, tool).catch(() => undefined)

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    void refresh($)

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const current = await read($, tab)
    const snap = await read($, snapshot)
    const width = Math.min(512, Math.max(24, e.props.bodyColumns ?? 40))
    const canvas = paint(snap, current, width)
    mounted = e.surface === 'terminal' ? { columns: canvas.columns, rows: canvas.rows, tab: current } : undefined
    // Raster is a terminal-only element; other surfaces get a note.
    const body =
      e.surface === 'terminal' ? (
        (() => {
          const { Raster } = $.ui.resolve(e)
          return <Raster key="body" columns={canvas.columns} rows={canvas.rows} cells={canvas.toBase64()} />
        })()
      ) : (
        <Text dimColor>Armory draws its dashboard in the terminal only.</Text>
      )

    const tabs: [Tab, string, string][] = [
      ['skills', 'Skills', 's'],
      ['jobs', 'Jobs', 'j'],
      ['memory', 'Memory', 'm'],
    ]

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {tabs.map(([id, label, key]) => (
            <Button
              key={id}
              hotkey={key}
              variant={id === current ? 'primary' : 'secondary'}
              onPress={() => void update($, tab, () => id)}
            >
              {label}
            </Button>
          ))}
          <Button key="refresh" hotkey="r" plain onPress={() => void refresh($)}>
            ↻
          </Button>
        </Box>
        {body}
      </Box>
    )
  })
}
