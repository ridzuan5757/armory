#!/bin/sh
# Opens one link. A link clicked in Ghostty opens as a new tab in the Armory
# split of the front Ghostty tab; every other link opens in the fallback
# browser, as do links whose host is on the rules list (sites that need your
# usual logins and password manager).
#
#   route.sh <url>
#
# Config, in ~/.config/armory/:
#   link-rules     one host pattern per line, '#' for a comment;
#                  '*.example.com' matches its subdomains
#   link-fallback  the bundle id of the fallback browser (org.mozilla.firefox)
#
# ARMORY_LINK_DRY=1 prints the decision ("split <key>" or "browser") and
# opens nothing. ARMORY_LINK_FRONT and ARMORY_LINK_PANES stand in for the
# front app and the front tab's Ghostty terminal ids, for tests.

url="$1"
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
conf="${XDG_CONFIG_HOME:-$HOME/.config}/armory"
fallback=$(cat "$conf/link-fallback" 2>/dev/null || echo org.mozilla.firefox)
log="$conf/link-router.log"
mkdir -p "$conf"

browser() {
  echo "$(date '+%F %T') browser ($1) $url" >> "$log"
  if [ -n "$ARMORY_LINK_DRY" ]; then echo "browser ($1)"; exit 0; fi
  # open -b names the app, so the link never comes back to this router.
  open -b "$fallback" "$url"
  exit 0
}

case "$url" in
  http://* | https://*) ;;
  *) browser "not a web link" ;;
esac

host=$(printf '%s' "$url" | sed -E 's#^[A-Za-z]+://([^/:?#@]*@)?([^/:?#]+).*#\2#' | tr 'A-Z' 'a-z')
if [ -f "$conf/link-rules" ]; then
  while IFS= read -r rule || [ -n "$rule" ]; do
    rule=$(printf '%s' "$rule" | sed -e 's/#.*//' -e 's/[[:space:]]//g')
    [ -n "$rule" ] || continue
    # shellcheck disable=SC2254 # the rule is a glob on purpose
    case "$host" in $rule) browser "rule $rule" ;; esac
  done < "$conf/link-rules"
fi

front=${ARMORY_LINK_FRONT:-$(lsappinfo info -only bundleid "$(lsappinfo front)" 2>/dev/null | sed -E 's/.*"([^"]*)"[^"]*$/\1/')}
[ "$front" = com.mitchellh.ghostty ] || browser "clicked in $front"

panes=${ARMORY_LINK_PANES:-$(osascript -e 'tell application "Ghostty" to get id of every terminal of selected tab of front window' 2>/dev/null)}
key=$(terminal-browser ls --json 2>/dev/null | PANES="$panes" /usr/bin/python3 -c '
import json, os, sys
panes = {p.strip() for p in os.environ["PANES"].split(",") if p.strip()}
for b in json.load(sys.stdin).get("browsers", []):
    if (b.get("pane") or {}).get("pane") in panes and any("armory-session=" in (t.get("url") or "") for t in b.get("tabs", [])):
        print(b["key"]); break
' 2>/dev/null)
[ -n "$key" ] || browser "no Armory split in this Ghostty tab"

echo "$(date '+%F %T') split $key $url" >> "$log"
if [ -n "$ARMORY_LINK_DRY" ]; then echo "split $key"; exit 0; fi
terminal-browser new-tab --browser "$key" "$url" > /dev/null 2>&1 || browser "terminal-browser failed"
