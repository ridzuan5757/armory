# Armory

A live dashboard for Claude Code. It shows your skills, background jobs,
memory and the files that Claude works on, as a 3D scene in a split beside
the chat.

Armory has five themes:

| Theme | Look |
| --- | --- |
| `mold` | A slime-mold network. Veins grow from four hubs, carry particles and fork. At rest, pulses run along the veins, the flow turns back and forth, and thin tendrils search outward. |
| `orbit` | A solar system. Hubs are stars, items orbit their parents, and their children orbit them as moons. At rest, the bodies move under Newtonian gravity. |
| `hive` | One honeycomb. Each item is a hex cell, and the size of its body comes from its data. Bees fly to the files that tools use. At rest, bees wander and dance. |
| `race` | A racetrack with one lane per colony. Items are pennants along the lanes, and sad red horses gallop laps. A file use sends a horse to that post. |
| `caravan` | The Earth as a hex map, from the [Natural Earth](https://www.naturalearthdata.com/) land outline (public domain). Fractal maps (diamond-square) give the height and the moisture, and the latitude gives the climate: ice and tundra near the poles, deserts near the tropics, jungle at the equator. It has seas, beaches, plains, grassland, forests, hills, mountains, snow peaks, rivers and a volcano that erupts at each file write. Each colony gets a city on good land and a territory that follows the terrain. Sad red horses plan routes over the terrain with A*, take boats over water and bring a red envelope to each file that a tool uses. |

## What it shows

- **Skills**: your user and plugin commands, with use counts from your history.
- **Jobs**: background jobs in `~/.claude/jobs`, by state.
- **Memory**: the entries in your project memory, by group, with `[[links]]`.
- **Sessions**: every Claude Code session that runs on this computer, with
  its status (busy, idle, shell). A busy session pulses.
- **Files**: the folder where the session started. When Read, Edit, Write or
  NotebookEdit uses a file, its path opens and the file glows: cyan for a
  read, orange for a write, green for a new file. New files grow in, and
  removed files shrink out.

When something happens, the camera goes to that colony for a few seconds.

## Requirements

- Claude Code with plugin hooks modules (mods).
- [terminal-browser](https://github.com/zenbu-labs/terminal-browser) for the
  split. Without it, Armory opens the page in your default browser, or a
  text pane in the terminal.
- macOS with Ghostty, for a clean close of the split when Claude Code exits.
  On other setups the split still works, but it can stay open after exit.

## Install

In Claude Code:

```
/plugin marketplace add ridzuan5757/armory
/plugin install armory@armory
```

Then start a new session, or run `/reload-plugins`.

## Commands

| Command | What it does |
| --- | --- |
| `/armory web` | Opens the dashboard split for this session. |
| `/armory theme` | Shows the current theme and the list of themes. |
| `/armory theme <name>` | Changes the theme. The choice is kept for new sessions. |
| `/armory close` | Closes the split. |
| `/armory` | Opens the text pane in the terminal. |
| `/armory stress <hz> <seconds> <raster\|web\|both>` | Runs a speed test. |
| `/armory results` | Shows the last speed test results. |

In the split: drag to turn, pinch or scroll to zoom, put the pointer on an
item to see its details. The `caravan` map does not turn, as in a strategy
game: drag or use the arrow keys (or WASD) to move the map, and zoom to the
point under the pointer.

## Links beside the chat (optional, macOS)

The [link router](link-router/README.md) opens the links you click in
Ghostty as tabs in the Armory split. A rules list can keep chosen sites in
your usual browser.

## Data

Armory runs on your computer only. It sends nothing over the network.

- It reads `~/.claude/history.jsonl`, `~/.claude/jobs`, your project memory
  folder and the folders on the way to the files that tools use.
- It reads the name, folder and status of each session from
  `~/.claude/sessions/<pid>.json`, every 5 s. It does not read the key files
  in that folder.
- It writes the page for each session to `~/.claude/armory/web/<session>/`
  and deletes that folder when the session ends.

## Development

```
claude plugin validate .
claude plugin test .
```

The themes are in `hooks/themes/`. Each theme gives a layout (`simulate`),
a drawing (`draw`) and three flags; `hooks/web.ts` holds the shared engine.

## License

[MIT](LICENSE)
