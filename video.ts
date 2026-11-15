#!/usr/bin/env bun
// Turn a lesson into a video file: the whiteboard drawing itself in time with the recorded voice,
// with the title on top and each step's caption underneath.
//
//   bun video.ts <lesson-dir | saved-slug> [--out file.mp4] [--vertical] [--size 1280x720] [--seconds N]
//
// It plays the lesson for real in headless Chrome (the same engine the user watches), records the
// screen over the DevTools protocol, and lets ffmpeg put the frames and lesson.mp3 together.
// Needs Chrome or Chromium and ffmpeg. 3D stages and page highlights are not in the video; the
// boards, captions and voice are.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--vertical"));
if (!target) {
  console.error("usage: bun video.ts <lesson-dir | saved-slug> [--out file.mp4] [--vertical] [--size 1280x720]");
  process.exit(2);
}
const HOME = process.env.CHALKTALK_HOME || join(homedir(), ".chalktalk");
const dir = existsSync(join(target, "lesson.json")) ? resolve(target) : join(HOME, "saved", target.replace(/[^a-z0-9-]/g, ""));
if (!existsSync(join(dir, "lesson.json"))) {
  console.error(`no lesson at ${target} (a folder with lesson.json, or a slug from bun listen.ts saved)`);
  process.exit(2);
}
const lesson = JSON.parse(readFileSync(join(dir, "lesson.json"), "utf8"));
const slug = String(lesson.title || "lesson").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lesson";
const out = resolve(flag("out") || join(dir, `${slug}.mp4`));
const [VW, VH] = (flag("size") || (args.includes("--vertical") ? "1080x1920" : "1280x720")).split("x").map(Number);
const audioFile = lesson.audio ? join(dir, lesson.audio) : null;
const hasAudio = Boolean(audioFile && existsSync(audioFile) && Array.isArray(lesson.timeline));

function find(names: string[], paths: string[]): string | null {
  for (const p of paths) if (p && existsSync(p)) return p;
  for (const n of names) {
    const f = Bun.which(n);
    if (f) return f;
  }
  return null;
}
const chrome = find(
  ["google-chrome", "chromium", "chromium-browser"],
  [process.env.CHALKTALK_CHROME || "", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/opt/pw-browsers/chromium", "/usr/bin/google-chrome", "/usr/bin/chromium"],
);
const ffmpeg = find(["ffmpeg"], ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]);
if (!chrome) fail("no Chrome or Chromium found (set CHALKTALK_CHROME)");
if (!ffmpeg) fail("no ffmpeg found (brew install ffmpeg)");

function fail(msg: string): never {
  console.error(`video: ${msg}`);
  process.exit(1);
}

// How long each step runs: the voice's timeline when there is one, otherwise reading time.
const steps = lesson.steps || [];
const reading = (s: any) => Math.max(3, String(s.say || "").split(/\s+/).length / 2.6);
const starts: number[] = hasAudio ? lesson.timeline : steps.reduce((acc: number[], _s: any, i: number) => (acc.push(i ? acc[i - 1] + reading(steps[i - 1]) : 0), acc), []);
let total = starts.length ? starts[starts.length - 1] + reading(steps[steps.length - 1]) : 1;
if (hasAudio) {
  const probe = Bun.spawnSync([ffmpeg!.replace(/ffmpeg$/, "ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audioFile!]);
  const d = Number(probe.stdout.toString().trim());
  if (d > 0) total = d;
}
total += 1.5;
if (Number(flag("seconds")) > 0) total = Math.min(total, Number(flag("seconds")));

const engine = readFileSync(fileURLToPath(new URL("./engine.js", import.meta.url)), "utf8");
const HELPER = "http://127.0.0.1:47321";

const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap">
<style>
  html,body{margin:0;width:${VW}px;height:${VH}px;overflow:hidden;background:#efece4;font-family:Caveat,"Comic Sans MS",cursive;color:#2c2c2a}
  #wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(VH * 0.02)}px;padding:${Math.round(VH * 0.04)}px;box-sizing:border-box}
  #title{font-size:${Math.round(Math.min(VW, VH) * 0.055)}px;font-weight:700;text-align:center;line-height:1.1}
  #boards{display:flex;flex-direction:${VW > VH ? "row" : "column"};gap:16px;align-items:center;justify-content:center;width:100%;flex:1;min-height:0}
  .panel{background:#fbfaf6;border:1px solid #8884;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.12);padding:12px 16px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;max-height:100%}
  .panel .sketch-bar{display:none!important}
  .panel h3{margin:0 0 4px;font-size:26px}
  #caption{font-size:${Math.round(Math.min(VW, VH) * 0.05)}px;text-align:center;min-height:1.2em}
  #count{position:absolute;right:24px;bottom:16px;font:600 18px system-ui;color:#8a877e}
</style></head><body>
<div id="wrap"><div id="title"></div><div id="boards"></div><div id="caption"></div></div><div id="count"></div>
<script>${engine}</script>
<script>
(async () => {
  const lesson = await (await fetch("/lesson.json")).json();
  const steps = lesson.steps || [];
  const meta = lesson.board || {};
  const keys = ["board", "board2"].filter((k) => steps.some((s) => Array.isArray(s[k]) && s[k].length));
  document.getElementById("title").textContent = lesson.title || "";
  const all = steps.flatMap((s) => keys.flatMap((k) => s[k] || []));
  try { await Chalktalk.prepare(all, location.origin); } catch {}
  try { await document.fonts.ready; } catch {}
  const boards = document.getElementById("boards");
  const two = keys.length > 1;
  const titles = lesson.boards || [];
  const engines = keys.map((key, k) => {
    const panel = document.createElement("div");
    panel.className = "panel";
    const W = meta.width || 600, H = meta.height || (two ? 260 : 420);
    // fit the board into the frame, keeping its shape
    const room = ${VW > VH} && two ? (${VW} - 120) / 2 : ${VW} - 80;
    const tall = ${VH} * (${VW > VH} || !two ? 0.66 : 0.36);
    const scale = Math.min(room / W, tall / H);
    panel.style.width = Math.round(W * scale + 32) + "px";
    if (titles[k] && titles[k].title) { const h = document.createElement("h3"); h.textContent = titles[k].title; panel.append(h); }
    const mount = document.createElement("div");
    mount.style.width = Math.round(W * scale) + "px";
    panel.append(mount);
    boards.append(panel);
    return { key, engine: Chalktalk.mount(mount, { width: W, height: H, autoplay: false, sound: false, steps: steps.map((s) => ({ caption: s.caption, items: s[key] || [], clear: Boolean(s.clear) })) }) };
  });
  window.__ready = true;
  window.__play = (starts, total) => {
    const t0 = Date.now();
    steps.forEach((step, i) => setTimeout(() => {
      document.getElementById("caption").textContent = step.caption || "";
      document.getElementById("count").textContent = (i + 1) + " / " + steps.length;
      const seconds = (starts[i + 1] ?? total) - starts[i];
      engines.forEach(({ key, engine }) => {
        const natural = engine.go(i);
        const timed = (step[key] || []).some((it) => typeof it.at === "number");
        if (!timed && natural > 0.3 && seconds * 0.85 > natural) engine.go(i, (seconds * 0.85) / natural);
      });
    }, Math.max(0, starts[i] * 1000)));
    return t0;
  };
})();
</script></body></html>`;

// A small server for the page, the lesson and its files; icons, maps and 3D come from the helper.
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(page, { headers: { "Content-Type": "text/html" } });
    if (url.pathname === "/lesson.json") return new Response(JSON.stringify({ ...lesson, sound: false }), { headers: { "Content-Type": "application/json" } });
    const local = join(dir, url.pathname.replace(/^\/+/, "").replace(/\.\./g, ""));
    if (/^\/[\w.-]+\.(png|jpe?g|gif|webp|svg)$/i.test(url.pathname) && existsSync(local)) return new Response(Bun.file(local));
    try {
      const res = await fetch(`${HELPER}${url.pathname}${url.search}`);
      return new Response(res.body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") || "application/octet-stream" } });
    } catch {
      return new Response("helper is off", { status: 503 });
    }
  },
});

const work = mkdtempSync(join(tmpdir(), "chalktalk-video-"));
const frames = join(work, "frames");
mkdirSync(frames);
const profile = join(work, "profile");
const browser = Bun.spawn(
  [chrome!, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--mute-audio", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--window-size=${VW},${VH}`, "about:blank"],
  { stdout: "ignore", stderr: "ignore" },
);

const cleanup = () => {
  try {
    browser.kill();
  } catch {}
  server.stop(true);
  rmSync(work, { recursive: true, force: true });
};
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

try {
  // Chrome writes its debugging port to the profile folder once it is up.
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    await Bun.sleep(100);
    const f = join(profile, "DevToolsActivePort");
    if (existsSync(f)) port = Number(readFileSync(f, "utf8").split("\n")[0]);
  }
  if (!port) fail("Chrome did not start");
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
  const tab = targets.find((t) => t.type === "page");
  if (!tab) fail("Chrome has no page to record");

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, no) => {
    ws.onopen = ok;
    ws.onerror = no;
  });
  let seq = 0;
  const pending = new Map<number, (v: any) => void>();
  const shots: Array<{ file: string; at: number }> = [];
  let writes: Promise<unknown>[] = [];
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((ok) => {
      const id = ++seq;
      pending.set(id, ok);
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg.result ?? msg.error);
      pending.delete(msg.id);
    } else if (msg.method === "Page.screencastFrame") {
      const { data, metadata, sessionId } = msg.params;
      const file = join(frames, `f${String(shots.length).padStart(6, "0")}.jpg`);
      shots.push({ file, at: metadata.timestamp });
      writes.push(Bun.write(file, Buffer.from(data, "base64")));
      ws.send(JSON.stringify({ id: ++seq, method: "Page.screencastFrameAck", params: { sessionId } }));
    }
  };
  const evaluate = async (expression: string) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.value;

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${server.port}/` });
  for (let i = 0; i < 150 && !(await evaluate("window.__ready === true")); i++) await Bun.sleep(100);
  if (!(await evaluate("window.__ready === true"))) fail("the lesson page did not load");

  await send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: VW, maxHeight: VH, everyNthFrame: 1 });
  await Bun.sleep(300);
  const t0 = (await evaluate(`window.__play(${JSON.stringify(starts)}, ${total})`)) / 1000;
  process.stdout.write(`recording ${Math.round(total)}s of "${lesson.title || slug}" at ${VW}x${VH}…\n`);
  const end = Date.now() + total * 1000;
  while (Date.now() < end) {
    await Bun.sleep(1000);
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    if (left % 15 === 0) process.stdout.write(`  ${left}s left\n`);
  }
  await send("Page.stopScreencast");
  await Promise.all(writes);
  ws.close();
  if (!shots.length) fail("no frames were captured");

  // Frames arrive only when the picture changes, so each one is held until the next.
  const list: string[] = ["ffconcat version 1.0"];
  const kept = shots.filter((s, i) => s.at >= t0 || shots[i + 1]?.at > t0);
  kept.forEach((s, i) => {
    const from = Math.max(s.at, t0);
    const to = i + 1 < kept.length ? Math.max(kept[i + 1].at, t0) : t0 + total;
    list.push(`file '${s.file}'`, `duration ${Math.max(0.001, to - from).toFixed(3)}`);
  });
  list.push(`file '${kept[kept.length - 1].file}'`);
  writeFileSync(join(work, "frames.txt"), list.join("\n"));

  mkdirSync(join(out, ".."), { recursive: true });
  const cmd = [
    ffmpeg!, "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", join(work, "frames.txt"),
    ...(hasAudio ? ["-i", audioFile!] : []),
    "-vf", `fps=30,scale=${VW}:${VH}:force_original_aspect_ratio=decrease,pad=${VW}:${VH}:(ow-iw)/2:(oh-ih)/2:color=0xefece4,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "160k"] : []),
    "-t", total.toFixed(2), "-movflags", "+faststart", out,
  ];
  const mux = Bun.spawnSync(cmd, { stderr: "pipe" });
  if (mux.exitCode !== 0) fail(`ffmpeg failed: ${mux.stderr.toString().slice(0, 400)}`);
  process.stdout.write(`${JSON.stringify({ video: out, seconds: Math.round(total), size: `${VW}x${VH}`, voice: hasAudio })}\n`);
} finally {
  cleanup();
}
