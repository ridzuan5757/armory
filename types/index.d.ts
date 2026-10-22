export type Tab = 'skills' | 'jobs' | 'memory'
export type SkillRow = { name: string; source: string; model: string; uses: number }
// session is the job's own session id; cwd its folder, ~ for home.
export type JobRow = { id: string; name: string; state: string; detail: string; session: string; cwd: string }
export type MemoryRow = { group: string; title: string; slug: string; out: number; in: number; links: string[]; size: number }
// A file or folder on the FILES hub. path is relative to the session folder,
// or starts with ~/ (home) or / for a file outside it. at is the last time a
// tool used the file (0 for one no tool used), and op says how.
export type FileOp = 'read' | 'write' | 'new'
// size is bytes on disk for a file, 0 for a folder.
export type FileRow = { path: string; kind: 'file' | 'dir'; at: number; op: FileOp | ''; size: number }
export type Touch = { at: number; op: FileOp }
// A running Claude Code session, from ~/.claude/sessions/<pid>.json. status
// is the session's own (busy, idle, shell, ...); since is when it last
// changed; self marks the session that shows the page.
export type SessionRow = { pid: number; id: string; name: string; cwd: string; status: string; since: number; self: boolean }
export type Snapshot = {
  skills: SkillRow[]
  jobs: JobRow[]
  memory: MemoryRow[]
  files: FileRow[]
  sessions: SessionRow[]
  loadedAt: number
  errors: string[]
}

declare module 'claude-code' {
  interface PluginState {
    armory: { tab: Tab; snapshot: Snapshot; cwd: string; touched: Record<string, Touch> }
  }
}
