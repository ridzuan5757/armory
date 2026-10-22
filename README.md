# Armory

A live dashboard for Claude Code. It shows your skills, background jobs,
memory and the files that Claude works on, as a 3D scene in a split beside
the chat.

Armory has four themes:

| Theme | Look |
| --- | --- |
| `mold` | A slime-mold network. Veins grow from four hubs, carry particles and fork. At rest, pulses run along the veins, the flow turns back and forth, and thin tendrils search outward. |
| `orbit` | A solar system. Hubs are stars, items orbit their parents, and their children orbit them as moons. At rest, the bodies move under Newtonian gravity. |
| `hive` | One honeycomb. Each item is a hex cell, and the size of its body comes from its data. Bees fly to the files that tools use. At rest, bees wander and dance. |
| `caravan` | The Earth as a hex map of 120 × 47 tiles (3° each), from the [Natural Earth](https://www.naturalearthdata.com/) land outline (public domain). Fractal maps (diamond-square) give the height and the moisture, and the latitude gives the climate: ice and tundra near the poles, deserts near the tropics, jungle at the equator. It has seas, beaches, plains, grassland, forests, hills, mountains, snow peaks, rivers and 16 famous volcanoes (Fuji, Vesuvius, Krakatoa, Mauna Loa and more). Each volcano has its own cycle: dormant, growing, erupting (lava) and cooling (ash); the one nearest FILES also erupts at each file write. Earthquakes come from ten plate faults (the Ring of Fire, the Mid-Atlantic Ridge, the Alpine–Himalayan belt, the East African Rift): each fault builds stress and the longer it waits, the larger the quake. From M6.5 a quake leaves a crevasse, and larger ones new rivers, new hills or a sunken coast, for 6–48 years; an M7.8 or more wakes a dormant volcano nearby. Each colony gets a city on good land and a territory that follows the terrain. Sad red horses plan routes over the terrain with A*, take boats over water and bring a red envelope to each file that a tool uses. As in a strategy game, houses keep their tiles. A removed file leaves its tile empty, and a new file first takes an empty tile; only then does the colony take new tiles on its border, next to each other. Each change flashes, with the count (+1, −1) over the city. Time runs at 1 hour = 1 year, so each season is 15 minutes (opposite in the south), and the map changes with it. Each season brings 5–8 natural disasters for 3–6 minutes each (about two at a time): floods in spring, wildfires and droughts in summer, tropical storms in autumn, blizzards in winter. Tornadoes follow the wind: they form on plains where the westerlies meet warm tropical air (a zone that moves with the seasons), in the warm half of the year, and they move east until they reach the sea. A tile inside a disaster costs more to cross, so the horses go around it or slow down. Clouds ride the Earth's wind belts (trade winds west, westerlies east, polar easterlies west), which move north and south with the seasons; they are larger in rainy seasons, and storms and blizzards have dark clouds. |

## What it shows

- **Skills**: your user and plugin commands, with use counts from your history.
- **Jobs**: background jobs in `~/.claude/jobs`, by state.
- **Memory**: the entries in your project memory, by group, with `[[links]]`.
- **Sessions**: every Claude Code session that runs on this computer, with
  its status (busy, idle, shell). A busy session pulses.
- **Git**: every repo in the session folder (the folder itself and the
  folders one level below it), and the repos that hold the files Claude
  works on; forty at most. Each repo shows its branch, the files that are
  changed and not committed (size by changed lines), and the commits not
  pushed. A changed file that is also on FILES has a solid link to it, and
  the repo's details show how many of its changes this session made. A
  commit moves the changes out and a commit in; a push moves the commits
  out. A repo with no open work is dim. Armory runs `git status`,
  `git diff --numstat` and `git log`: every 5 s for the repos that hold the
  files Claude uses, and every 30 s (four per update) for the others.
- **MCP**: the MCP servers you use: the ones connected now, the ones in
  your config (`~/.claude.json` and the session folder's `.mcp.json`), and
  the claude.ai connectors you connected before. Default connectors that you
  never connected are left out. Each server shows its state: connected (teal, with
  its tool count), needs a log-in (amber) or not connected (red, dim). The
  MCP tools that Claude calls appear under their server and glow. Armory
  reads only each server's name, type and scope from the config, never its
  env, args, headers or URL, and it records only the tool name and time of a
  call, never its arguments.
- **Usage**: the 5-hour and 7-day rate limits (with their reset times), the
  cost of this session, and how full the context of each running session
  is, linked to that session. Green below 50 %, amber from 50 %, red from
  80 %. For other sessions Armory reads only the end of the transcript, and
  keeps only the token counts and the model name, never the text.
- **Plugins**: the installed plugins with their marketplace, scope, version
  and last update; one updated in the last hour pulses.
- **Schedule**: this session's scheduled wakeups (cron tasks, `/loop`,
  `ScheduleWakeup`) and background work (subagents, workflows, shell tasks,
  monitors), as the end of each turn reports them; running work pulses.
- **Machine**: the CPU, memory and disk of this Mac, every 5 s. Each one
  has one small tile per 5 % of use, so the colony grows and shrinks with
  the load; the five processes that use the most CPU hang under CPU (name
  only), and a temperature group: the thermal state (Apple's public API) and
  the hottest CPU, GPU and storage sensors in °C. The sensors come from a
  small Swift helper (`hooks/temp.swift`) that Armory compiles once with
  `swiftc` into `~/.claude/armory/bin`; it reads Apple's private IOKit HID
  sensor API, so a macOS update can stop it (then only the state shows).
  These changes never move the camera.
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
| `/armory view` | Shows the caravan view (flat or globe). |
| `/armory view <flat\|globe>` | Shows caravan as a flat map or a turning globe. The choice is kept for new sessions; `G` in the split also switches. |
| `/armory world <full\|simple>` | `simple` turns off the caravan time, seasons, disasters, tectonics, volcano cycles and clouds: only the map, colonies and horses stay (lighter). Kept for new sessions. |
| `/armory close` | Closes the split. |
| `/armory` | Opens the text pane in the terminal. |
| `/armory stress <hz> <seconds> <raster\|web\|both>` | Runs a speed test. |
| `/armory results` | Shows the last speed test results. |

In the split: drag to turn, pinch or scroll to zoom, put the pointer on an
item to see its details. The `caravan` map does not turn, as in a strategy
game, and it wraps around at 180° like the Earth (routes take the short way
across the Pacific); up and down, it moves until a pole edge is at the middle
of the pane: drag with the mouse or with two fingers, or use the arrow keys (or
WASD), to move the map. Pinch to zoom to the point under the pointer, or
use + and - to zoom. When work happens, the camera goes to that colony
and stays there; it never goes back to the whole map by itself. For 30 s
after you move the map, events only name themselves at the top. Home or 0
shows the whole map again. Put the pointer on a volcano, a disaster or an
earthquake to see its name, cost and time left. In the globe view the same
world wraps on a sphere: drag to turn it, pinch to zoom; an event turns its
colony to the front, and the globe turns slowly for a few minutes after it. To stay
light, the map draws at most 10 frames a second at rest, and after 30 s with
no input and no event it sleeps at 1 frame a second until something happens.

## Links beside the chat (optional, macOS)

The [link router](link-router/README.md) opens the links you click in
Ghostty as tabs in the Armory split. A rules list can keep chosen sites in
your usual browser.

## Data

Armory runs on your computer only. It sends nothing over the network.

- It runs `ps`, `vm_stat`, `sysctl` and `df` every 5 s for the MACHINE
  colony (process names only, never their arguments).
- It reads the last usage block (token counts and model name only) from the
  end of each running session's transcript.
- It reads the MCP server names, types and scopes from `~/.claude.json` and
  `.mcp.json`, and the list of tools the session has.
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
