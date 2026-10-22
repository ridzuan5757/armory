#!/bin/sh
# Gives the default browser back to the fallback browser and removes the app.
# macOS asks you to confirm the change. The rules in ~/.config/armory stay.
set -e
here=$(cd "$(dirname "$0")" && pwd)
app="$HOME/Applications/Armory Link Router.app"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/armory"
fallback=$(cat "$conf/link-fallback" 2>/dev/null || echo org.mozilla.firefox)

echo "Confirm the change of default browser back to $fallback in the dialog that macOS shows."
swift "$here/set-default.swift" "$fallback"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$app" 2> /dev/null || true
rm -rf "$app"
echo "Removed $app."
