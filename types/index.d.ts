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
// A file that git reports as changed and not committed. path is relative to
// the repo; file is the same file as a FILES path (see FileRow), so the two
// colonies can join on it. state: M changed, A added, D deleted, R renamed,
// ? untracked. add and del count lines (0 for an untracked or binary file).
export type GitChange = { path: string; file: string; state: string; add: number; del: number }
// A repo that holds a file this session used, or the session folder. root is
// shown like a FILES path; ahead and behind count commits against upstream;
// commits are the ones ahead (not pushed), newest first.
export type GitRepo = {
  root: string
  name: string
  branch: string
  upstream: boolean
  ahead: number
  behind: number
  changes: GitChange[]
  commits: { hash: string; subject: string }[]
}
// An MCP server: from the config files (name, transport type and scope only;
// never env, args, headers or url) and from the tools the model has now.
// status: connected (it has tools), auth (only its log-in tools), off (in the
// config, but no tools: it did not connect). used lists the tools this
// session called, with the last time; never their arguments.
export type McpRow = {
  name: string
  scope: string
  type: string
  status: 'connected' | 'auth' | 'off'
  tools: number
  used: { tool: string; at: number; uses: number }[]
}
// The USAGE colony: the rate-limit windows and cost of this session (from the
// engine), and the context fill of each running session. A context comes from
// the engine for this session, and for the others from the last usage block
// in their transcript: only numbers and the model name, never text.
export type UsageRow = {
  limits: { kind: string; percent: number; resetsAt: string }[]
  cost: number
  contexts: { pid: number; name: string; tokens: number; window: number; percent: number; model: string; self: boolean }[]
}
export type Snapshot = {
  skills: SkillRow[]
  jobs: JobRow[]
  memory: MemoryRow[]
  files: FileRow[]
  sessions: SessionRow[]
  git: GitRepo[]
  mcp: McpRow[]
  usage: UsageRow
  loadedAt: number
  errors: string[]
}

declare module 'claude-code' {
  interface PluginState {
    armory: { tab: Tab; snapshot: Snapshot; cwd: string; touched: Record<string, Touch>; mcpUsed: Record<string, { at: number; uses: number }> }
  }
}
