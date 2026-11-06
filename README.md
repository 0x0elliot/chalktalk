# Chalktalk

Circle anything on your screen, ask what it does, and Claude answers right there: it underlines the
real buttons and fields, sketches what happens behind them on a whiteboard, and explains it out loud,
one plain step at a time. Like a teacher at a blackboard, for your own app.

It is a [Claude Code](https://claude.com/claude-code) skill plus a tiny local helper, a small desktop
app for Mac, Windows and Linux, and a bookmark for Chrome.

## Install (about 5 minutes)

Needs [Bun](https://bun.sh), Claude Code, and Chrome.

1. **Get the skill.**

   ```bash
   git clone https://github.com/0x0elliot/chalktalk.git ~/chalktalk
   ~/chalktalk/install.sh
   ```

   `install.sh` links the folder into `~/.claude/skills/chalktalk`, so every Claude Code session can use it.

2. **Start listening.** In any Claude Code session, type `/chalktalk listen`. It starts a small helper on
   your machine (`127.0.0.1:47321`, never reachable from the network) and waits for your questions.

3. **Add the bookmark.** In Chrome, show the bookmarks bar (Cmd+Shift+B), right-click it, choose
   **Add page…**, and fill in:
   - **Name:** `Chalktalk`
   - **URL:** paste this whole line:

     ```
     javascript:void fetch("http://127.0.0.1:47321/point.js").then((r)=>{if(!r.ok)throw r.status;return r.text()},()=>{throw "off"}).then((code)=>{try{(0,eval)(code)}catch(e){throw "error: "+e.message}}).catch((e)=>alert(e===403?"Chalktalk is blocked on this site. In a Claude session: /chalktalk unblock "+location.origin:e==="off"?"Chalktalk isn't running, or Chrome blocked it. Paste /chalktalk listen into a Claude Code session; if it is running, allow this site to reach apps on this device.":"Chalktalk failed to start ("+e+"). Reload the page and try again."))
     ```

   Or run `bun ~/chalktalk/bookmarklet.ts ~/Desktop`, open the page it writes, and drag the red
   **Chalktalk** button onto your bookmarks bar. The bookmark only loads the latest code from the helper,
   so you never reinstall it.

4. **Allow each site once.** The first time you click Chalktalk on a site, Chrome asks whether the page
   may reach apps on this device. Click **Allow**.

## The desktop app: any app, not just web pages

The desktop app works over anything on screen (Slack, Mail, Figma, a terminal) and on sites that block
the bookmark. It is a Tauri app, about 6 MB, that draws a see-through layer over your screen; clicks
pass through to your apps everywhere except on its own boxes.

1. Install Rust from [rustup.rs](https://rustup.rs). On Linux also install the system packages:
   `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`.
2. `/chalktalk listen` starts it for you. The first time it builds the app (about 5 minutes); after that
   it starts in a second. By hand: `bun ~/chalktalk/desktop.ts start` (also `stop`, `rebuild`, `status`).
3. Press **⌃⌥C** (Control+Option+C) on a Mac, or **Ctrl+Alt+C** on Windows and Linux, anywhere. Circle,
   type or dictate, and press Cmd+Enter (Ctrl+Enter on Windows and Linux). The same hotkey or Esc closes it.
4. Allow screen recording when your system asks (on a Mac: System Settings, Privacy & Security, Screen
   Recording), so Claude can see what you circled. Restart the app after allowing it.

On Linux with Wayland, the system blocks global hotkeys and overlays, so the app runs itself through
XWayland.

## Using it

1. Click **Chalktalk** on any page (or press the desktop hotkey). The page dims slightly.
2. Circle what you mean, or press Enter without circling to ask about the whole page.
3. Talk or type your question in the box (dictation apps type straight in), then press Cmd+Enter.
4. A box on the right shows "Claude is thinking", a one-line answer, and a numbered plan. The
   explanation then plays where you asked, with Back, Pause, Next, Replay, Clear, Close all, and an Ask
   box for follow-ups. Drawings fade a few seconds after it ends. Every box can be dragged by its
   "⠿ drag to move" grip (double-click puts it back) and closed with its ✕.

Clicking Chalktalk on a page you asked about before offers **Replay** for recent answers, instantly.

## Voice

- **Kokoro** (default): a free, open-source voice model that runs on your machine. The first answer
  installs it into `~/.chalktalk/kokoro` (about 450 MB).
- **ElevenLabs** (optional): more natural; needs an API key. Turn it on in `~/.chalktalk/config.json`:

  ```json
  { "voice": "elevenlabs" }
  ```

  and set `ELEVENLABS_API_KEY`, or save the key in your macOS Keychain:
  `security add-generic-password -a "$USER" -s elevenlabs-chalktalk -w`

If one engine fails, Chalktalk uses the other and says so.

## Privacy and safety

- The helper only listens on your own machine. Chrome asks you once per site before any page can reach it.
- An answer, its plan, and its replay only go to the tab and site that asked.
- Notes from a site you have never used Chalktalk on are marked as new, and Claude treats them as
  suggestions to confirm rather than instructions.
- Claude investigates read-only and never clicks a setting for you; it shows you where to click.
- Keep Chalktalk off a site for good with `/chalktalk block https://example.com`.

## More than one Claude session

Each session listens under its own name. With two listening, the question box shows **Send to:** so
you pick, and each answer only plays in the tab that asked.

## Troubleshooting

- **"Chalktalk isn't running"**: paste `/chalktalk listen` into a Claude Code session.
- **Nothing happens after Cmd+Enter**: Chrome's "reach apps on this device" prompt was dismissed; allow
  it in the site settings (the icon left of the address bar).
- **No sound**: click once anywhere on the page, then press Replay; browsers only play sound after a click.

## License

MIT
