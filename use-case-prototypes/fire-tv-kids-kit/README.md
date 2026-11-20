# Fire TV Kids Kit

A home dashboard (runs on a Mac) plus small Fire TV apps for controlling what a child watches:

- **Kids Videos**: plays only the videos and channels you approve. No recommendations, no autoplay.
- **Kids Quiz**: maths and English quiz that pops up over any app every few minutes of watching.
- **TV Message**: shows (and reads aloud) a message on the TV.
- **Parent Remote**: Android phone app for the dashboard. Finds the Mac on your Wi-Fi by itself.

Ready-built APKs are in `apks/`. Source for everything is in `src/`.

## Install on your TV

You need a Fire TV, a Mac on the same Wi-Fi, and an Android phone (optional).

1. **Turn on ADB debugging on the Fire TV.**
   Settings → My Fire TV → About → click the device name 7 times (turns on Developer Options).
   Then Settings → My Fire TV → Developer Options → **ADB debugging: ON**.
   Find the TV's IP: Settings → My Fire TV → About → Network.
2. **Install adb on the Mac:** `brew install android-platform-tools`
3. **Connect and install the TV apps** (replace `TV_IP`; accept the "Allow USB debugging" prompt on the TV):
   ```bash
   adb connect TV_IP:5555
   adb -s TV_IP:5555 install -r apks/kids-videos.apk
   adb -s TV_IP:5555 install -r apks/tv-message.apk
   ```
4. **Turn on the quiz guard and remote button** (lets Kids Quiz appear over other apps):
   ```bash
   adb -s TV_IP:5555 shell settings put secure enabled_accessibility_services com.home.adyatube/com.home.adyatube.KeyService
   adb -s TV_IP:5555 shell settings put secure accessibility_enabled 1
   ```
5. **Start the dashboard on the Mac** (Python 3, no extra packages):
   ```bash
   cd src
   python3 server.py          # first run creates config.json
   ```
   Stop it (Ctrl+C), set `"device": "TV_IP:5555"` in `src/config.json`, and start it again.
   It prints two links with your PIN. Open the "On your phone" one on any phone or laptop on the Wi-Fi.
6. **Phone app (optional):** install `apks/parent-remote.apk` on an Android phone
   (allow "install unknown apps" for your browser or file manager).
   Open it. It searches the Wi-Fi for the Mac, then asks for the PIN (the part after `?t=` in the link).
7. **Add videos:** open `/kids` on the dashboard, paste YouTube video, playlist or channel links. They appear
   in Kids Videos on the TV within a few seconds.

Keep the dashboard link private: the PIN in it gives full control of the TV.

## What it does

| Feature | How |
|---|---|
| Watching now + screenshot | `dumpsys media_session`, `screencap`; Kids Videos reports via `now.json` |
| Play a link | YouTube / Netflix / Hotstar deep links. Approved YouTube videos open in Kids Videos |
| Approved videos | `config.json → favorites`; pushed to the TV app as `videos.json` |
| Channels (`/kids`) | Add by @handle or channel URL; newest ~30 videos each, auto-refreshed every 6 h; shown as a channels bar + left rail + channel pages on the TV |
| Play a video | Every YouTube link plays in Kids Videos; unapproved links are auto-added to "My videos" first |
| Manage Kids Videos (`/kids`) | Paste many video/playlist links; playlists expand (first ~100 videos, no API key) into their own TV row; rename/reorder/remove rows and videos |
| Message on TV | `TV Message` app (`com.home.tvmsg`), optional read-aloud |
| Screen time timer | 5-min warning message, then stop (+ optional lock of all video apps) |
| Bedtime | Stops video apps inside the window (+ optional lock) |
| Block / unblock apps | `pm disable-user` / `pm enable`, user apps + Silk/Appstore/Photos/Music only |
| History | `history.jsonl` |

## Fire TV apps

- `tvmsg/` → **TV Message**: `am start -n com.home.tvmsg/.MsgActivity --es text "Hi" [--es title ..] [--ei secs 30] [--ez speak true]`
- `adyatube/` → **Kids Videos**: plays only approved videos in its own player (no recommendations or autoplay).
  Search (rail → 🔍, on-screen A–Z keyboard) covers only the added channels' videos; a number matches a show's episode number.
  A channel can be set (📺 on `/kids`) to show only one playlist, filtered by title — SET India = every Mere Sai episode, in 50-episode ranges.
  `am start -n com.home.adyatube/.MainActivity --es play VIDEO_ID`

Rebuild either with its `build.sh` (needs Android SDK build-tools 34 + Homebrew openjdk@17), then
`adb -s TV_IP:5555 install -r <apk>`. Build `tvmsg` first: its `build.sh` creates `tvmsg/debug.keystore`,
which the other apps are signed with too. Keep it, or reinstalling will need an uninstall first.
Building your own APKs gives a different key from the ones in `apks/`, so uninstall those first.

## Notes

- ADB debugging must stay ON on the TV. If the TV's IP changes, edit `device` in `config.json`.
- If adb says "No route to host" on macOS: `adb kill-server && adb start-server`.
- The server must be running for timers/bedtime/history to work.

## Amazon Music button → Kids Videos

Kids Videos includes an accessibility service (`KeyService`) enabled via
`settings put secure enabled_accessibility_services com.home.adyatube/com.home.adyatube.KeyService`.
The Music button doesn't send a key; because Amazon Music is disabled, it opens the Appstore's
launch → details page. The service spots that pair and opens Kids Videos instead.
Keep Amazon Music disabled, or the button will open Music again. Button log: `files/keys.txt` on the TV.

## Phone app (Android)

`phone/` → **Parent Remote** (`com.home.adyaremote`): a WebView wrapper around the dashboard (⚙ button for IP, port and PIN).
Rebuild with `phone/build.sh` (bakes the current Mac IP and PIN in as defaults).
- **Find server on Wi-Fi** (⚙ screen): scans the phone's Wi-Fi subnet on the port for a page titled `TV Remote`
  and saves the IP it finds. Runs automatically once when the saved IP can't be reached.
- Dashboard `confirm()` / `prompt()` / `alert()` dialogs work in the app (WebChromeClient), so delete/rename/quiz buttons work.
Download on the phone from the dashboard: `http://<mac-ip>:8765/app.apk?t=<PIN>`.
If you change the PIN, rebuild the app or update the PIN in the app's ⚙ settings.
