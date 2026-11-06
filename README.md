# Chalktalk

Circle anything on a web page, ask what it does, and Claude answers right there: it underlines the
real buttons and fields, sketches what happens behind them on a whiteboard, and explains it out loud,
one plain step at a time. Like a teacher at a blackboard, for your own app.

It is a [Claude Code](https://claude.com/claude-code) skill plus a tiny local helper and a bookmark.

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

## Using it

1. Click **Chalktalk** on any page. The page dims slightly.
2. Circle what you mean, or press Enter without circling to ask about the whole page.
3. Talk or type your question in the box (dictation apps type straight in), then press Cmd+Enter.
4. The page shows "Claude is thinking", a one-line answer, and a numbered plan. The explanation then
   plays on the same tab, with Back, Pause, Next, Replay, and an Ask box for follow-ups. Esc closes it.

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
