import { expect, mock, test } from 'claude-code/testing'

const HOME = '/home/u'

// Decodes the painted Raster back to lines of text.
async function bodyText(ui: { find: (q: { type: string; key?: string }) => Promise<unknown> }) {
  const found = (await ui.find({ type: 'Raster', key: 'body' })) as
    | { props: { columns: number; cells: string } }
    | undefined
  if (!found) return ''
  const { columns, cells } = found.props
  const bytes = Uint8Array.from(atob(cells), ch => ch.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  const lines: string[] = []
  for (let i = 0; i < words.length / 3; i += columns) {
    let line = ''
    for (let k = i; k < i + columns; k++) line += String.fromCodePoint(words[k * 3] ?? 32)
    lines.push(line)
  }
  return lines.join('\n')
}
const MEM = `${HOME}/.claude/projects/-work/memory`

const FILES: Record<string, string> = {
  [`${HOME}/.claude/history.jsonl`]: [
    '{"display":"/graphify run","project":"/work"}',
    '{"display":"/graphify","project":"/work"}',
    '{"display":"hello","project":"/work"}',
  ].join('\n'),
  [`${HOME}/.claude/skills/graphify/SKILL.md`]: '---\nname: graphify\nmodel: sonnet\n---\nbody',
  [`${HOME}/.claude/jobs/j1/state.json`]: '{"state":"running","intent":"build the thing","detail":"step 2"}',
  [`${MEM}/MEMORY.md`]: '- [Alpha](project_alpha.md) — a\n- [Beta](feedback_beta.md) — b\n',
  [`${MEM}/project_alpha.md`]: '---\nname: alpha\n---\nsee [[beta]]',
  [`${MEM}/feedback_beta.md`]: '---\nname: beta\n---\nnone',
}

const PANE = {
  plugin: 'armory',
  component: 'Pane',
  requestId: 'armory',
  props: {
    title: 'Armory',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the pane shows skills, jobs and memory', async ($, on) => {
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({
    value: [
      { name: 'graphify', description: '', source: 'user' },
      { name: 'help', description: '', source: 'builtin' },
    ],
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: HOME }))
  on('fs.list', () => ({
    value: [{ name: 'j1', kind: 'directory', size: 0, mtimeMs: 0, isLink: false }],
  }))
  on('fs.read', (_, e) => {
    const text = FILES[e.path]
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.exists', (_, e) => ({ value: e.path in FILES }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  let text = ''
  for (let i = 0; i < 50 && !text.includes('graphify'); i++) text = await bodyText(ui)
  expect(text).toMatch(/ARMORY/)
  expect(text).toMatch(/graphify\s+sonnet\s+█+\s+2\s+│/)
  expect(text).not.toMatch(/help/)

  await ui.press({ key: 'jobs' })
  expect(await bodyText(ui)).toMatch(/RUNNING\s+build the thing/)

  await ui.press({ key: 'memory' })
  const memory = await bodyText(ui)
  expect(memory).toMatch(/PROJECT 1/)
  expect(memory).toMatch(/Alpha\s+↓0 ↑1/)
  expect(memory).toMatch(/Beta\s+↓1 ↑0/)
  await ui.unmount()
})

test('other surfaces get a note in place of the raster', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /terminal only/ })).toBeDefined()
  await ui.unmount()
})

test('session end closes only the split of this session', async ($, on) => {
  const runs: string[][] = []
  on('session.id', () => ({ value: 'abc-123' }))
  on('env.get', () => ({ value: HOME }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    // The pid lookup is the one shell the hook starts; it answers a pid.
    const stdout = e.argv[0] === 'sh' ? '4242\n' : ''
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('session.end', () => ({ sessionId: 'abc-123' }))

  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'abc-123', resume: { id: 'abc-123' } })

  // The close runs detached; its script is the last argument.
  const script = runs.at(-1)?.at(-1)
  expect(script).toContain(`pkill -TERM -f "$sig$tail"`)
  expect(script).toContain(`tail='abc-123-p4242-'`)
  // The session's own page folder goes with it.
  expect(script).toContain(`rm -rf '/home/u/.claude/armory/web/abc-123-p4242'`)
})

test('each session writes its page and data to its own folder', async ($, on) => {
  const written: string[] = []
  let id = 'one'
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: id }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }))
  on('fs.read', () => { throw new Error('ENOENT') })
  on('fs.list', () => ({ value: [] }))
  on('fs.write', (_, e) => (written.push(e.path), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  id = 'two'
  await $.command.run({ command: 'armory', args: 'web' })

  expect(written).toContain(`${HOME}/.claude/armory/web/one-p4242/index.html`)
  expect(written).toContain(`${HOME}/.claude/armory/web/one-p4242/data.js`)
  expect(written).toContain(`${HOME}/.claude/armory/web/two-p4242/index.html`)
  expect(written).not.toContain(`${HOME}/.claude/armory/web/data.js`)
})

test('tools light the files they use; new and removed files follow the disk', async ($, on) => {
  const clock = mock.clock(on)
  const src = new Set(['a.ts', 'bad.ts'])
  const pages: string[] = []
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }))
  on('fs.read', (_, e) => {
    const text = FILES[e.path]
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.write', (_, e) => {
    if (e.path.endsWith('data.js')) pages.push(e.text)
    return { value: undefined }
  })
  const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })
  on('fs.list', (_, e) => {
    if (e.path === '/work') return { value: [entry('src', 'dir'), entry('README.md', 'file'), entry('node_modules', 'dir')] }
    if (e.path === '/work/src') return { value: [...src].map(name => entry(name, 'file')) }
    if (e.path === `${HOME}/.claude/jobs`) return { value: [entry('j1', 'dir'), entry('leftover', 'dir')] }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('tool.call', (_, e) =>
    'file_path' in e && String(e.file_path).includes('bad') ? { result: 'no such file', isError: true } : { result: {} },
  )
  on('fs.exists', (_, e) => ({ value: src.has(e.path.slice('/work/src/'.length)) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const last = () => {
    const page = pages.at(-1) ?? ''
    return JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot as {
      files: { path: string; kind: string; op: string }[]
      jobs: { id: string }[]
      errors: string[]
    }
  }
  const files = () => Object.fromEntries(last().files.map(f => [f.path, `${f.kind}:${f.op}`]))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await clock.settle()

  await $.tool.call({ tool: 'Read', file_path: '/work/src/a.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/work/src/bad.ts' })
  await clock.advance(300)
  expect(files()).toEqual({ src: 'dir:', 'README.md': 'file:', 'src/a.ts': 'file:read' })
  // A job folder with no state.json is skipped, with no error.
  expect(last().jobs.map(j => j.id)).toEqual(['j1'])
  expect(last().errors).toEqual([])

  // b.ts appears and a.ts goes: the next load marks b.ts new and drops a.ts.
  src.add('b.ts')
  src.delete('a.ts')
  await $.tool.call({ tool: 'Edit', file_path: '/work/README.md', old_string: 'a', new_string: 'b' })
  await clock.advance(300)
  expect(files()).toEqual({ src: 'dir:', 'README.md': 'file:write', 'src/b.ts': 'file:new' })

  // A Write that creates a file is new, even in a folder listed before; one
  // that replaces a file is a write.
  await $.tool.call({ tool: 'Write', file_path: '/work/src/c.ts', content: 'x' })
  src.add('c.ts')
  await $.tool.call({ tool: 'Write', file_path: '/work/src/b.ts', content: 'y' })
  await clock.advance(300)
  expect(files()).toMatchObject({ 'src/c.ts': 'file:new', 'src/b.ts': 'file:write' })
})

test('/armory theme saves the theme and rewrites the page for it', async ($, on) => {
  mock.store(on)
  const writes = new Map<string, string>()
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }))
  on('fs.read', () => { throw new Error('ENOENT') })
  on('fs.list', () => ({ value: [] }))
  on('fs.write', (_, e) => (writes.set(e.path.split('/').pop() ?? '', e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const run = async (args: string) => ((await $.command.run({ command: 'armory', args })) as { text: string }).text

  expect(await run('web')).toMatch(/terminal-browser/)
  expect(writes.get('index.html')).toContain("const THEME = 'mold'")
  expect(await run('theme')).toMatch(/Theme: mold\. Themes: mold, orbit, hive, caravan/)
  expect(await run('theme saturn')).toMatch(/No theme named saturn/)

  expect(await run('theme orbit')).toBe('Armory theme: orbit.')
  expect(writes.get('index.html')).toContain("const THEME = 'orbit'")
  expect(writes.get('data.js')).toContain('"theme":"orbit"')
  // The data carries the build of the page on disk, so the open page reloads
  // only to that page, never in a loop.
  const build = /"build":"([a-z0-9]+)"/.exec(writes.get('data.js') ?? '')?.[1]
  expect(build).toBeDefined()
  expect(writes.get('index.html')).toContain(`BUILD = '${build}'`)
  // The store keeps it: the plain command reads it back.
  expect(await run('theme')).toMatch(/Theme: orbit\./)

  // The caravan view: flat by default, globe by the command, in the data.
  expect(await run('view')).toMatch(/View: flat\. Views: flat, globe/)
  expect(await run('view cube')).toMatch(/No view named cube/)
  expect(await run('view globe')).toBe('Armory view: globe.')
  expect(writes.get('data.js')).toContain('"view":"globe"')
  expect(await run('view')).toMatch(/View: globe\./)

  // The caravan world: full by default, simple by the command, in the data.
  expect(await run('world')).toMatch(/World: full\. Worlds: full, simple/)
  expect(await run('world simple')).toBe('Armory world: simple.')
  expect(writes.get('data.js')).toContain('"world":"simple"')
})

test('skill use counts come from grep | uniq, so history.jsonl may pass 4 MiB', async ($, on) => {
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [{ name: 'graphify', description: '', source: 'user' }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: HOME }))
  on('fs.list', () => ({ value: [] }))
  // A read of the history fails, as $.fs.read does over 4 MiB.
  on('fs.read', (_, e) => {
    if (e.path.endsWith('history.jsonl')) throw new Error('over 4 MiB')
    throw new Error(`ENOENT ${e.path}`)
  })
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: e.argv[3] === 'count' ? '   7 "display":"/graphify\n   2 "display":"/exit\n' : '', stderr: '' },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  let text = ''
  for (let i = 0; i < 50 && !/graphify.*7/.test(text); i++) text = await bodyText(ui)
  expect(text).toMatch(/graphify\s+·\s+█+\s+7\s+│/)
  expect(text).not.toMatch(/history\.jsonl/)
  await ui.unmount()
})

test('the sessions colony lists live sessions only, with safe fields', async ($, on) => {
  const pages: string[] = []
  const session = (pid: number, status: string) =>
    JSON.stringify({ pid, sessionId: `s-${pid}`, cwd: `${HOME}/work/${pid}`, name: `work-${pid}`, status, statusUpdatedAt: 1000, messagingSocketPath: '/tmp/x.sock' })
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('fs.list', (_, e) => ({
    value: e.path === `${HOME}/.claude/sessions`
      ? ['4242.json', '5000.json', '6000.json', '4242.secret.key'].map(name => ({ name, kind: 'file', size: 0, mtimeMs: 0, isLink: false }))
      : [],
  }))
  on('fs.read', (_, e) => {
    if (e.path.endsWith('/4242.json')) return { value: session(4242, 'busy') }
    if (e.path.endsWith('/5000.json')) return { value: session(5000, 'idle') }
    if (e.path.endsWith('/6000.json')) return { value: session(6000, 'idle') }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.write', (_, e) => (e.path.endsWith('data.js') && pages.push(e.text), { value: undefined }))
  // The pid walk answers 4242 (this session); ps says 6000 is gone.
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : e.argv[0] === 'ps' ? ' 4242\n 5000\n' : '', stderr: '' },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  const page = pages.at(-1) ?? ''
  const sessions = JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot.sessions
  expect(sessions).toEqual([
    { pid: 4242, id: 's-4242', name: 'work-4242', cwd: '~/work/4242', status: 'busy', since: 1000, self: true },
    { pid: 5000, id: 's-5000', name: 'work-5000', cwd: '~/work/5000', status: 'idle', since: 1000, self: false },
  ])
  expect(page).not.toContain('sock')
})

test('the start folder comes from the session file, and no memory is no error', async ($, on) => {
  const pages: string[] = []
  const listed: string[] = []
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }))
  on('fs.read', (_, e) => {
    if (e.path === `${HOME}/.claude/sessions/4242.json`) return { value: JSON.stringify({ pid: 4242, cwd: '/work' }) }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.exists', () => ({ value: false }))
  on('fs.list', (_, e) => (listed.push(e.path), { value: [] }))
  on('fs.write', (_, e) => (e.path.endsWith('data.js') && pages.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  // The engine reports the folder a cd moved to; the session file has the start.
  await $.session.start({ cwd: '/work/armory', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  const page = pages.at(-1) ?? ''
  const snap = JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot
  expect(listed).toContain('/work')
  expect(listed).not.toContain('/work/armory')
  expect(snap.memory).toEqual([])
  expect(snap.errors).toEqual([])
})

test('jobs send their session and folder, and nothing else from the job file', async ($, on) => {
  const pages: string[] = []
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }))
  on('fs.list', (_, e) => ({
    value: e.path === `${HOME}/.claude/jobs` ? [{ name: 'j9', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] : [],
  }))
  on('fs.read', (_, e) => {
    if (e.path.endsWith('/j9/state.json')) {
      return { value: JSON.stringify({ state: 'running', intent: 'build', sessionId: 'job-session', cwd: `${HOME}/work`, output: 'SECRET-OUTPUT', providerEnv: { KEY: 'SECRET-KEY' } }) }
    }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_, e) => (e.path.endsWith('data.js') && pages.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  const page = pages.at(-1) ?? ''
  const jobs = JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot.jobs
  expect(jobs).toEqual([{ id: 'j9', name: 'build', state: 'running', detail: '', session: 'job-session', cwd: '~/work' }])
  expect(page).not.toContain('SECRET')
})

test('the git colony reads the session folder repo and the repos below it', async ($, on) => {
  const pages: string[] = []
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  const status = [
    '## main...origin/main [ahead 1, behind 2]',
    ' M src/app.ts',
    'A  src/new.ts',
    '?? notes.md',
    'R  old.ts -> lib/moved.ts',
    '@@',
    '12\t3\tsrc/app.ts',
    '5\t0\tsrc/new.ts',
    '-\t-\tlib/moved.ts',
    '@@',
    'abc1234 Add the app',
  ].join('\n')
  on('process.run', (_, e) => {
    if (e.argv[0] === 'git' && e.argv.includes('rev-parse')) return { value: { exitCode: e.argv[2] === '/work' ? 0 : 128, stdout: '/work\n', stderr: '' } }
    if (e.argv[0] === 'sh' && e.argv[3] === 'git') return { value: { exitCode: 0, stdout: e.argv[4] === '/work' ? status : '## dev\n@@\n@@\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }
  })
  // /work/lib is a repo one level below; /work/docs is a plain folder.
  on('fs.list', (_, e) => ({
    value: e.path === '/work' ? ['lib', 'docs'].map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })) : [],
  }))
  on('fs.read', (_, e) => { throw new Error(`ENOENT ${e.path}`) })
  on('fs.exists', (_, e) => ({ value: e.path === '/work/lib/.git' }))
  on('fs.write', (_, e) => (e.path.endsWith('data.js') && pages.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  const page = pages.at(-1) ?? ''
  const git = JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot.git
  expect(git).toEqual([{
    root: '/work', name: 'work', branch: 'main', upstream: true, ahead: 1, behind: 2,
    changes: [
      { path: 'src/app.ts', file: 'src/app.ts', state: 'M', add: 12, del: 3 },
      { path: 'src/new.ts', file: 'src/new.ts', state: 'A', add: 5, del: 0 },
      { path: 'notes.md', file: 'notes.md', state: '?', add: 0, del: 0 },
      { path: 'lib/moved.ts', file: 'lib/moved.ts', state: 'R', add: 0, del: 0 },
    ],
    commits: [{ hash: 'abc1234', subject: 'Add the app' }],
  }, { root: 'lib', name: 'lib', branch: 'dev', upstream: false, ahead: 0, behind: 0, changes: [], commits: [] }])
})

test('the mcp colony shows used servers only, and keeps secrets out', async ($, on) => {
  const clock = mock.clock(on)
  const pages: string[] = []
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }))
  on('fs.read', (_, e) => {
    if (e.path === `${HOME}/.claude.json`) {
      return { value: JSON.stringify({
        mcpServers: { lab: { type: 'stdio', command: 'lab', env: { TOKEN: 'SECRET-TOKEN' } }, down: { type: 'http', url: 'https://SECRET-URL' } },
        projects: { '/work': { mcpServers: { local1: { command: 'x', args: ['SECRET-ARG'] } } } },
        claudeAiMcpEverConnected: ['claude.ai Slack'],
      }) }
    }
    if (e.path === '/work/.mcp.json') return { value: JSON.stringify({ mcpServers: { 'team.docs': { type: 'sse', headers: { Authorization: 'SECRET-HEADER' } } } }) }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_, e) => (e.path.endsWith('data.js') && pages.push(e.text), { value: undefined }))
  on('tool.list', () => ({ value: [
    { name: 'Read', description: '', mcp: false },
    { name: 'mcp__lab__run', description: '', mcp: true },
    { name: 'mcp__lab__stop', description: '', mcp: true },
    { name: 'mcp__team_docs__authenticate', description: '', mcp: true },
    { name: 'mcp__claude_ai_Gmail__create_draft', description: '', mcp: true },
    // Connected before, logged out now: needs a log-in. Never connected: left out.
    { name: 'mcp__claude_ai_Slack__authenticate', description: '', mcp: true },
    { name: 'mcp__claude_ai_Asana__authenticate', description: '', mcp: true },
    { name: 'mcp__claude_ai_Asana__complete_authentication', description: '', mcp: true },
  ] }))
  on('tool.call', () => ({ result: {} }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  await $.tool.call({ tool: 'mcp__lab__run', job: 'SECRET-ARGUMENT' })
  await clock.advance(300)
  const page = pages.at(-1) ?? ''
  const mcp = JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot.mcp
  expect(mcp.map((m: { name: string; scope: string; type: string; status: string; tools: number }) => [m.name, m.scope, m.type, m.status, m.tools])).toEqual([
    ['lab', 'user', 'stdio', 'connected', 2],
    ['down', 'user', 'http', 'off', 0],
    ['local1', 'local', 'stdio', 'off', 0],
    ['team.docs', 'project', 'sse', 'auth', 0],
    ['claude.ai Slack', 'claude.ai', 'http', 'auth', 0],
    ['claude.ai Gmail', 'claude.ai', 'http', 'connected', 1],
  ])
  expect(mcp[0].used.map((u: { tool: string; uses: number }) => [u.tool, u.uses])).toEqual([['run', 1]])
  expect(page).not.toContain('SECRET')
})

test('the usage colony reads limits, cost and each session context, and no transcript text', async ($, on) => {
  const pages: string[] = []
  const session = (pid: number, status: string) =>
    JSON.stringify({ pid, sessionId: `s-${pid}`, cwd: `${HOME}/work`, name: `work-${pid}`, status, statusUpdatedAt: 1000 })
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('session.usage', () => ({ value: {
    startedAt: 0, context: { tokens: 120000, window: 1000000, percent: 12 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-22T21:00:00Z' }, { kind: 'seven_day', percentUsed: 81 }],
    cost: { usd: 12.345 },
  } }))
  on('fs.list', (_, e) => ({
    value: e.path === `${HOME}/.claude/sessions` ? ['4242.json', '5000.json'].map(name => ({ name, kind: 'file', size: 0, mtimeMs: 0, isLink: false })) : [],
  }))
  on('fs.read', (_, e) => {
    if (e.path.endsWith('/4242.json')) return { value: session(4242, 'busy') }
    if (e.path.endsWith('/5000.json')) return { value: session(5000, 'idle') }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_, e) => (e.path.endsWith('data.js') && pages.push(e.text), { value: undefined }))
  const tails: string[] = []
  on('process.run', (_, e) => {
    if (e.argv[0] === 'tail') {
      tails.push(String(e.argv[3]))
      return { value: { exitCode: 0, stdout: [
        'cut line',
        JSON.stringify({ message: { model: 'claude-opus-5-5', usage: { input_tokens: 2, cache_read_input_tokens: 300000, cache_creation_input_tokens: 998 }, content: 'SECRET-TEXT' } }),
        JSON.stringify({ type: 'user', message: { content: 'SECRET-PROMPT' } }),
      ].join('\n'), stderr: '' } }
    }
    return { value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : e.argv[0] === 'ps' ? ' 4242\n 5000\n' : '', stderr: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  const page = pages.at(-1) ?? ''
  const usage = JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot.usage
  expect(usage).toEqual({
    limits: [{ kind: 'five_hour', percent: 23.5, resetsAt: '2026-10-22T21:00:00Z' }, { kind: 'seven_day', percent: 81, resetsAt: '' }],
    cost: 12.35,
    contexts: [
      { pid: 4242, name: 'work-4242', tokens: 120000, window: 1000000, percent: 12, model: 'this session', self: true },
      { pid: 5000, name: 'work-5000', tokens: 301000, window: 1000000, percent: 30, model: 'claude-opus-5-5', self: false },
    ],
  })
  expect(tails).toEqual([`${HOME}/.claude/projects/-home-u-work/s-5000.jsonl`])
  expect(page).not.toContain('SECRET')
})

test('plugins come from the install list, and the schedule from the end of a turn', async ($, on) => {
  const pages: string[] = []
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }))
  on('fs.read', (_, e) => {
    if (e.path === `${HOME}/.claude/plugins/installed_plugins.json`) {
      return { value: JSON.stringify({ version: 2, plugins: {
        'armory@armory': [{ scope: 'user', version: '0.39.0', lastUpdated: '2026-10-22T11:00:00.000Z', installPath: '/SECRET-PATH/armory' }],
        'skins@mods': [{ scope: 'user', version: '0.5.14', installedAt: '2026-10-14T23:08:22.383Z', installPath: '/SECRET-PATH/skins' }],
      } }) }
    }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_, e) => (e.path.endsWith('data.js') && pages.push(e.text), { value: undefined }))
  on('classic.Stop', () => ({}))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  await $.classic.Stop({
    stop_hook_active: false,
    session_crons: [{ id: 'c1', schedule: '*/5 * * * *', recurring: true, prompt: 'check   the\ndeploy' }],
    background_tasks: [
      { id: 't1', type: 'subagent', status: 'running', description: 'review the diff', agent_type: 'Explore' },
      { id: 't2', type: 'workflow', status: 'completed', description: 'x', name: 'review-changes' },
    ],
  })
  const snap = () => { const page = pages.at(-1) ?? ''; return JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot }
  expect(snap().plugins).toEqual([
    { name: 'armory', marketplace: 'armory', scope: 'user', version: '0.39.0', updated: Date.parse('2026-10-22T11:00:00.000Z'), self: true },
    { name: 'skins', marketplace: 'mods', scope: 'user', version: '0.5.14', updated: Date.parse('2026-10-14T23:08:22.383Z'), self: false },
  ])
  expect(snap().schedule.crons).toEqual([{ id: 'c1', schedule: '*/5 * * * *', recurring: true, prompt: 'check the deploy' }])
  expect(snap().schedule.tasks).toEqual([
    { id: 't1', type: 'subagent', status: 'running', description: 'Explore \u00b7 review the diff' },
    { id: 't2', type: 'workflow', status: 'completed', description: 'review-changes \u00b7 x' },
  ])
  expect(pages.at(-1)).not.toContain('SECRET')
})

test('the machine colony reads cpu, memory, disk, the top processes and temperatures', async ($, on) => {
  const clock = mock.clock(on)
  const pages: string[] = []
  on('command.register', () => ({ value: { command: 'armory' } }))
  on('command.list', () => ({ value: [] }))
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'abc-123' }))
  const out = [
    '10', '34359738368', '@@',
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                                    43845.',
    'Pages active:                                 800000.',
    'Pages wired down:                             200000.',
    'Pages occupied by compressor:                 100000.',
    '@@',
    '/dev/disk3s1   482797652 342654376 111296236    76% 4206852 1112962360    0%   /System/Volumes/Data',
    '@@',
    ' 42.7 142992 /System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer',
    '150.0 1234992 /Users/u/.local/bin/claude',
    '  0.0   1024 /sbin/launchd',
    ' 12.3  51200 ghostty',
  ].join('\n')
  const temp = JSON.stringify({ state: 'fair', sensors: [
    { name: 'PMU tdie4', c: 56 }, { name: 'PMU tdie4', c: 55.9 }, { name: 'PMU tdie1', c: 53.2 },
    { name: 'PMU TP3g', c: 61.5 }, { name: 'NAND CH0 temp', c: 41 }, { name: 'PMU tcal', c: 52 },
  ] })
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: String(e.argv[0]).includes('/armory-temp-') ? temp
    : e.argv[0] === 'sh' && e.argv[3] === 'machine' ? out : e.argv[0] === 'sh' ? '4242\n' : '', stderr: '' } }))
  on('fs.read', (_, e) => {
    if (e.path.endsWith('/hooks/temp.swift')) return { value: 'print(1)' }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.list', () => ({ value: [] }))
  // The compiled helper is there already: no swiftc run.
  on('fs.exists', (_, e) => ({ value: e.path.includes('/armory-temp-') }))
  on('fs.write', (_, e) => (e.path.endsWith('data.js') && pages.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'armory', args: 'web' })
  // The helper is found in the background; the next 5 s check reads it.
  await clock.advance(5000)
  const page = pages.at(-1) ?? ''
  const machine = JSON.parse(page.slice(page.indexOf('(') + 1, page.lastIndexOf(')'))).snapshot.machine
  expect(machine.temp).toEqual({
    state: 'fair', cpu: 56, gpu: 61.5, ssd: 41, max: 61.5,
    top: [{ name: 'PMU TP3g', c: 61.5 }, { name: 'PMU tdie4', c: 56 }, { name: 'PMU tdie1', c: 53.2 }, { name: 'PMU tcal', c: 52 }],
  })
  delete machine.temp
  expect(machine).toEqual({
    cpu: 21, cores: 10,
    memory: { used: 1100000 * 16384, total: 34359738368 },
    disk: { used: 342654376 * 1024, total: 482797652 * 1024 },
    top: [
      { name: 'claude', cpu: 150, mem: 1234992 * 1024 },
      { name: 'WindowServer', cpu: 43, mem: 142992 * 1024 },
      { name: 'ghostty', cpu: 12, mem: 51200 * 1024 },
      { name: 'launchd', cpu: 0, mem: 1024 * 1024 },
    ],
  })
})

