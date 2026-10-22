-- Armory Link Router: macOS sends web links here when this app is the default
-- browser. Each link goes to route.sh in the app's Resources folder.
on open location theURL
	set router to quoted form of (POSIX path of (path to resource "route.sh"))
	do shell script "/bin/sh " & router & " " & quoted form of theURL & " > /dev/null 2>&1 &"
end open location

-- Opened by itself (not with a link): say what it is.
on run
	display dialog "Armory Link Router opens links from Ghostty in the Armory split. Make it your default browser with install.sh." buttons {"OK"} default button 1
end run
