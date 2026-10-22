# Armory Link Router (optional, macOS)

Opens the links you click in Ghostty as a new tab in the Armory split of
that Ghostty tab, beside the chat, not in your browser.

| Link | Opens in |
| --- | --- |
| Clicked in Ghostty, in a tab with an Armory split | a new tab in that split |
| Host on the rules list (GitHub, GitLab, sign-in pages, ...) | your usual browser |
| Clicked in any other app, or no split in that Ghostty tab | your usual browser |
| Not a web link (`mailto:`, ...) | your usual browser |

The router is a small background app that you make your default browser.
It does not change Ghostty or Claude Code.

## Logins

The split runs terminal-browser's own Chromium, with its own cookies. On a
site you open there, you log in again one time. Your browser's extensions,
such as a password manager, are not there, and passkeys or security keys
may not work. So the rules list sends sites with important logins to your
usual browser. Add your own hosts to it, such as a company GitLab.

## Install

Requires macOS, Ghostty, terminal-browser and the Armory plugin.

```
sh link-router/install.sh
```

1. The script builds `~/Applications/Armory Link Router.app`.
2. It saves your current default browser as the fallback browser.
3. It copies the rules to `~/.config/armory/link-rules`.
4. macOS asks you to confirm the change of default browser. Click the
   button for "Armory Link Router".

To give a fallback browser by bundle id: `sh link-router/install.sh org.mozilla.firefox`.

The first time a link from Ghostty arrives, macOS may ask if "Armory Link
Router" may control Ghostty. Allow it: the router asks Ghostty which
terminals are in the front tab, to find the split of that tab.

Your fallback browser is no longer the default browser, so it may ask to
become the default again. In Firefox, clear "Always check if Firefox is your
default browser" in Settings → General.

The Armory plugin writes the key and pane of each split to
`~/.claude/armory/web/<session>/split.json`. The router reads these files,
because `terminal-browser ls` lists only the browsers of the terminal that
runs it, and the router runs outside any terminal.

## Use

- Edit `~/.config/armory/link-rules`: one host per line; `*.example.com`
  matches its subdomains.
- See each decision in `~/.config/armory/link-router.log`.
- Test a link with no effect:
  `ARMORY_LINK_DRY=1 sh link-router/route.sh https://example.com`

## Uninstall

```
sh link-router/uninstall.sh
```

macOS asks you to confirm the change of default browser back to your
fallback browser. The script then removes the app.
