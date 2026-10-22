#!/bin/sh
# Builds "Armory Link Router.app" in ~/Applications and makes it the default
# browser. macOS asks you to confirm the change of default browser.
#
#   sh install.sh [fallback bundle id]
#
# The fallback browser (default: the current default browser) gets every link
# that does not go to the Armory split. Undo with uninstall.sh.
set -e
here=$(cd "$(dirname "$0")" && pwd)
app="$HOME/Applications/Armory Link Router.app"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/armory"
id=dev.armory.link-router
mkdir -p "$HOME/Applications" "$conf"

# The fallback browser: the argument, else the current handler of https.
current=$(defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers 2>/dev/null |
  awk '/LSHandlerRoleAll/ { role = $3 } /LSHandlerURLScheme = https;/ { gsub(/[";]/, "", role); print role; exit }')
fallback=${1:-$current}
if [ -z "$fallback" ] || [ "$fallback" = "$id" ]; then fallback=$(cat "$conf/link-fallback" 2>/dev/null || echo com.apple.Safari); fi
echo "$fallback" > "$conf/link-fallback"
[ -f "$conf/link-rules" ] || cp "$here/rules.example" "$conf/link-rules"

rm -rf "$app"
osacompile -o "$app" "$here/LinkRouter.applescript"
cp "$here/route.sh" "$app/Contents/Resources/route.sh"

# A background app that macOS lists as a web browser.
plist="$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $id" "$plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $id" "$plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Armory Link Router" "$plist"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string Web link" "$plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string http" "$plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:1 string https" "$plist"
codesign --force --deep --sign - "$app" 2> /dev/null
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"

echo "Built $app (fallback browser: $fallback)."
echo "Rules: $conf/link-rules. Log: $conf/link-router.log"
echo "Confirm the change of default browser in the dialog that macOS shows."
swift "$here/set-default.swift" "$app"
