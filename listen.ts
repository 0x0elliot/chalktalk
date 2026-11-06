import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 47321;
const BASE = `http://127.0.0.1:${PORT}`;
const HOME = `${homedir()}/.chalktalk`;
const TOKEN_FILE = `${HOME}/token`;
const BLOCKED_FILE = `${HOME}/blocked.json`;
const SEEN_FILE = `${HOME}/seen-sites.json`;
const SCRIPTS = new Set(["point.js", "engine.js", "explain.js"]);
const RECENT_LIMIT = 12;
const LONG_POLL_MS = 50_000;
const LISTENING_GRACE_MS = LONG_POLL_MS + 20_000;

const [command = "serve", ...rest] = Bun.argv.slice(2);

function flag(name: string, fallback: string): string {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
}

function positional(): string[] {
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) i++;
    else out.push(rest[i]);
  }
  return out;
}

const sessionName = flag("name", basename(process.cwd()));
const agentName = flag("as", "").slice(0, 40);

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function token(): Promise<string> {
  const file = Bun.file(TOKEN_FILE);
  return (await file.exists()) ? (await file.text()).trim() : "";
}

async function readList(path: string): Promise<string[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  const saved: unknown = await file.json().catch(() => null);
  return Array.isArray(saved) ? saved.map(String) : [];
}

async function internal(path: string, body?: unknown): Promise<Response | null> {
  try {
    return await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-sketch-token": await token(), "x-sketch-session": sessionName, "x-sketch-agent": agentName, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

type Session = {
  name: string;
  agent: string;
  waiter: ((line: string | null) => void) | null;
  lastSeen: number;
  queue: string[];
  thinkingSince: number;
  doing: string;
  plan: string[];
  step: number;
  lessonDir: string | null;
  lessonSent: boolean;
  offered: Set<string>;
  reply: string;
  lastPath: string;
  lastTab: string;
  lessonTab: string;
  lastOrigin: string;
};

const bundles = new Map<string, Promise<string | null>>();
function bundle(entry: string): Promise<string | null> {
  let code = bundles.get(entry);
  if (!code) {
    code = Bun.build({ entrypoints: [new URL(`./${entry}`, import.meta.url).pathname], format: "esm", target: "browser", minify: true })
      .then(async (built) => (built.success && built.outputs[0] ? await built.outputs[0].text() : null))
      .catch(() => null);
    bundles.set(entry, code);
  }
  return code;
}
const threeBundle = () => bundle("three.entry.js");

const MAP_FILES: Record<string, string> = {
  "world-110m": "node_modules/world-atlas/countries-110m.json",
  "world-50m": "node_modules/world-atlas/countries-50m.json",
  "us-states": "node_modules/us-atlas/states-10m.json",
};

type IconSet = { width: number; height: number; icons: Record<string, { body: string }>; aliases?: Record<string, { parent: string }> };
let iconSet: Promise<IconSet | null> | null = null;
function icons(): Promise<IconSet | null> {
  iconSet ??= Bun.file(new URL("./node_modules/@iconify-json/lucide/icons.json", import.meta.url))
    .json()
    .then((j) => j as IconSet)
    .catch(() => null);
  return iconSet;
}
async function iconBodies(names: string[]): Promise<Record<string, string>> {
  const set = await icons();
  const out: Record<string, string> = {};
  if (!set) return out;
  for (const name of names.slice(0, 80)) {
    const real = set.icons[name] ? name : set.aliases?.[name]?.parent;
    if (real && set.icons[real]) out[name] = set.icons[real].body;
  }
  return out;
}

async function serve(): Promise<void> {
  const idleHours = Number(flag("hours", "3"));
  const secret = crypto.randomUUID();
  const sessions = new Map<string, Session>();
  const unaddressed: string[] = [];
  const recent: Array<{ id: string; dir: string; title: string; path: string; origin: string }> = [];
  let recentSeq = 0;
  let blocked = await readList(BLOCKED_FILE);
  const seen = new Set(await readList(SEEN_FILE));
  let lastActivity = Date.now();
  let lastAgent = "";

  const session = (name: string): Session => {
    let s = sessions.get(name);
    if (!s) {
      s = { name, agent: "", waiter: null, lastSeen: 0, queue: [], thinkingSince: 0, doing: "", plan: [], step: 0, lessonDir: null, lessonSent: true, offered: new Set(), reply: "", lastPath: "", lastTab: "", lessonTab: "", lastOrigin: "" };
      sessions.set(name, s);
    }
    return s;
  };
  const listening = (s: Session) => s.waiter !== null || Date.now() - s.lastSeen < LISTENING_GRACE_MS;
  const who = (s?: Session) => (s && s.agent) || lastAgent || "Claude";
  const stateOf = (s: Session) => (s.thinkingSince ? "thinking" : listening(s) ? "listening" : "away");
  const live = () => [...sessions.values()].filter((s) => s.thinkingSince || listening(s));

  const forTab = (s: Session, tab: string | null) => !s.lessonTab || s.lessonTab === tab;

  function report(name: string | null, tab: string | null = null) {
    const list = live().map((s) => ({ id: s.name, state: stateOf(s) }));
    const s = name ? sessions.get(name) : live().length === 1 ? live()[0] : undefined;
    if (!s) return { claude: list.length ? "choose" : "away", sessions: list, session: null, agent: who(), lesson: false, queued: unaddressed.length };
    const planned = s.thinkingSince && s.plan.length ? `Step ${s.step} of ${s.plan.length} · ${s.plan[s.step - 1]}` : "";
    const mine = Boolean(tab) && tab === s.lastTab;
    return {
      claude: stateOf(s),
      session: s.name,
      sessions: list,
      agent: who(s),
      since: s.thinkingSince || null,
      doing: mine && s.thinkingSince ? planned || s.doing : "",
      plan: mine && s.thinkingSince ? s.plan : [],
      step: mine && s.thinkingSince ? s.step : 0,
      reply: mine ? s.reply : "",
      lesson: Boolean(s.lessonDir && !s.lessonSent && forTab(s, tab)),
      queued: s.queue.length,
    };
  }

  function deliver(line: string, to: string | null): string | null {
    const candidates = live();
    const target = to ? sessions.get(to) : candidates.length === 1 ? candidates[0] : null;
    if (!target) {
      unaddressed.push(line);
      return null;
    }
    if (target.waiter) {
      const hand = target.waiter;
      target.waiter = null;
      Object.assign(target, { thinkingSince: Date.now(), doing: "reading your note", reply: "" });
      hand(line);
    } else {
      target.queue.push(line);
    }
    return target.name;
  }

  function cors(req: Request): Record<string, string> | null {
    const origin = req.headers.get("origin");
    if (!origin) return { "Access-Control-Allow-Origin": "*" };
    if (blocked.some((entry) => origin === entry || origin.startsWith(`${entry}:`))) return null;
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
    };
  }

  const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });

  async function handleInternal(req: Request, pathname: string): Promise<Response> {
    if (req.headers.get("x-sketch-token") !== secret) return new Response("forbidden", { status: 403 });
    const s = session(req.headers.get("x-sketch-session") || "default");
    const agent = (req.headers.get("x-sketch-agent") || "").trim().slice(0, 40);
    if (agent) {
      s.agent = agent;
      lastAgent = agent;
    }
    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
    if (pathname === "/internal/next") {
      s.lastSeen = Date.now();
      const line = s.queue.shift() ?? (live().length <= 1 ? unaddressed.shift() : undefined);
      if (line) {
        Object.assign(s, { thinkingSince: Date.now(), doing: "reading your note", reply: "" });
        return new Response(line);
      }
      if (s.waiter) s.waiter(null);
      const next = await new Promise<string | null>((resolve) => {
        s.waiter = resolve;
        setTimeout(() => {
          if (s.waiter === resolve) {
            s.waiter = null;
            resolve(null);
          }
        }, LONG_POLL_MS);
      });
      s.lastSeen = Date.now();
      return next === null ? new Response(null, { status: 204 }) : new Response(next);
    }
    if (pathname === "/internal/lesson") {
      const dir = String(body.dir ?? "");
      const file = Bun.file(`${dir}/lesson.json`);
      if (!(await file.exists())) return json({ error: `no lesson.json in ${dir}` }, 400);
      const lesson = (await file.json()) as {
        followups?: Array<{ label?: string; prompt?: string }>;
        steps?: Array<{ ask?: { options?: string[] } }>;
      };
      s.offered.clear();
      for (const f of lesson.followups ?? []) s.offered.add(f.prompt ?? f.label ?? "");
      for (const step of lesson.steps ?? []) for (const option of step.ask?.options ?? []) s.offered.add(option);
      Object.assign(s, { lessonDir: dir, lessonSent: false, lessonTab: s.lastTab, thinkingSince: 0, doing: "", plan: [], step: 0, reply: "" });
      const first = (lesson as { title?: string; steps?: Array<{ caption?: string }> });
      recent.unshift({ id: String(++recentSeq), dir, title: first.title || first.steps?.[0]?.caption || "Explanation", path: s.lastPath, origin: s.lastOrigin });
      recent.splice(RECENT_LIMIT);
      return json({ ok: true, session: s.name });
    }
    if (pathname === "/internal/plan") {
      s.plan = (Array.isArray(body.steps) ? body.steps : []).map((x) => String(x).slice(0, 80)).slice(0, 8);
      s.step = s.plan.length ? 1 : 0;
      if (!s.thinkingSince) s.thinkingSince = Date.now();
      return json({ ok: true });
    }
    if (pathname === "/internal/step") {
      s.step = Math.max(1, Math.min(s.plan.length, Number(body.n) || 1));
      return json({ ok: true });
    }
    if (pathname === "/internal/progress") {
      s.doing = String(body.text ?? "").slice(0, 120);
      if (!s.thinkingSince) s.thinkingSince = Date.now();
      return json({ ok: true });
    }
    if (pathname === "/internal/reply") {
      s.reply = String(body.text ?? "").slice(0, 400);
      if (!s.thinkingSince) s.thinkingSince = Date.now();
      return json({ ok: true });
    }
    if (pathname === "/internal/busy") {
      s.thinkingSince = Date.now();
      return json({ ok: true });
    }
    if (pathname === "/internal/idle") {
      Object.assign(s, { thinkingSince: 0, doing: "", plan: [], step: 0 });
      return json({ ok: true });
    }
    if (pathname === "/internal/leave") {
      if (s.waiter) s.waiter(null);
      sessions.delete(s.name);
      return json({ ok: true });
    }
    if (pathname === "/internal/reload-blocked") {
      blocked = await readList(BLOCKED_FILE);
      return json({ ok: true, blocked });
    }
    if (pathname === "/internal/stop") {
      setTimeout(() => process.exit(0), 50);
      return json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }

  try {
    Bun.serve({
      hostname: "127.0.0.1",
      port: PORT,
      idleTimeout: 120,
      async fetch(req) {
        lastActivity = Date.now();
        const url = new URL(req.url);
        const { pathname } = url;
        if (pathname.startsWith("/internal/")) return handleInternal(req, pathname);
        const headers = cors(req);
        if (!headers) return json({ error: "origin not allowed", origin: req.headers.get("origin") }, 403);
        if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
        const name = pathname.slice(1);
        const asked = url.searchParams.get("session");
        if (req.method === "GET" && SCRIPTS.has(name)) {
          const file = Bun.file(new URL(`./${name}`, import.meta.url));
          return new Response(await file.text(), { headers: { ...headers, "Content-Type": "text/javascript" } });
        }
        if (req.method === "GET" && (pathname === "/three.js" || pathname === "/maps.js")) {
          const code = await (pathname === "/three.js" ? threeBundle() : bundle("maps.entry.js"));
          if (!code) return new Response("library unavailable: run bun install in the chalktalk folder", { status: 503, headers });
          return new Response(code, { headers: { ...headers, "Content-Type": "text/javascript", "Cache-Control": "max-age=86400" } });
        }
        if (req.method === "GET" && pathname === "/icons.json") {
          const names = (url.searchParams.get("names") || "").split(",").map((n) => n.trim()).filter(Boolean);
          return json(await iconBodies(names), 200, { ...headers, "Cache-Control": "max-age=3600" });
        }
        const mapFile = /^\/map\/([\w-]+)\.json$/.exec(pathname);
        if (req.method === "GET" && mapFile && MAP_FILES[mapFile[1]]) {
          const file = Bun.file(new URL(`./${MAP_FILES[mapFile[1]]}`, import.meta.url));
          if (!(await file.exists())) return new Response("map data missing: run bun install", { status: 503, headers });
          return new Response(file, { headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "max-age=86400" } });
        }
        const libFile = /^\/library\/([\w-]+)\.json$/.exec(pathname);
        if (req.method === "GET" && libFile) {
          const file = Bun.file(`${HOME}/library/${libFile[1]}.json`);
          if (!(await file.exists())) return new Response("not found", { status: 404, headers });
          return new Response(file, { headers: { ...headers, "Content-Type": "application/json" } });
        }
        const tab = url.searchParams.get("tab");
        if (req.method === "GET" && pathname === "/status") return json(report(asked, tab), 200, headers);
        if (req.method === "GET" && pathname === "/recent") {
          const path = (url.searchParams.get("path") || "").replace(/\/+$/, "");
          const from = req.headers.get("origin") || "";
          return json(recent.filter((r) => r.path === path && r.origin === from).map(({ id, title }) => ({ id, title })), 200, headers);
        }
        const TYPES: Record<string, string> = {
          mp3: "audio/mpeg",
          wav: "audio/wav",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
        };
        const audioType = (name: string) => TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
        const recentFile = /^\/recent\/(\d+)(?:\/([\w.-]+\.(?:mp3|wav|png|jpe?g|gif|webp|svg)))?$/i.exec(pathname);
        if (req.method === "GET" && recentFile) {
          const item = recent.find((r) => r.id === recentFile[1]);
          if (!item) return new Response("not found", { status: 404, headers });
          if (recentFile[2]) {
            const file = Bun.file(`${item.dir}/${recentFile[2]}`);
            if (!(await file.exists())) return new Response("not found", { status: 404, headers });
            return new Response(file, { headers: { ...headers, "Content-Type": audioType(recentFile[2]) } });
          }
          const lesson = (await Bun.file(`${item.dir}/lesson.json`).json()) as Record<string, unknown>;
          return json({ ...lesson, assetBase: `/recent/${item.id}/` }, 200, headers);
        }
        if (req.method === "GET" && pathname === "/lesson/live") {
          const s = asked ? sessions.get(asked) : live().length === 1 ? live()[0] : undefined;
          if (!s || !s.lessonDir) return json({ version: 0 }, 200, headers);
          const file = Bun.file(`${s.lessonDir}/lesson.json`);
          if (!(await file.exists())) return json({ version: 0 }, 200, headers);
          const data = (await file.json().catch(() => null)) as Record<string, unknown> | null;
          if (!data) return json({ version: 0 }, 200, headers);
          return json({ ...data, version: file.lastModified, assetBase: "/lesson/" }, 200, headers);
        }
        if (req.method === "GET" && pathname === "/lesson") {
          const s = asked ? sessions.get(asked) : live().length === 1 ? live()[0] : undefined;
          if (!s || !s.lessonDir || s.lessonSent || !forTab(s, tab)) return new Response(null, { status: 204, headers });
          s.lessonSent = true;
          const lesson = (await Bun.file(`${s.lessonDir}/lesson.json`).json()) as Record<string, unknown>;
          return json({ ...lesson, session: s.name }, 200, headers);
        }
        if (req.method === "GET" && /^\/lesson\/[\w.-]+\.(?:mp3|wav|png|jpe?g|gif|webp|svg)$/i.test(pathname)) {
          const s = asked ? sessions.get(asked) : live().length === 1 ? live()[0] : undefined;
          const file = s && s.lessonDir ? Bun.file(`${s.lessonDir}/${pathname.slice("/lesson/".length)}`) : null;
          if (!file || !(await file.exists())) return new Response("not found", { status: 404, headers });
          return new Response(file, { headers: { ...headers, "Content-Type": audioType(pathname) } });
        }
        if (req.method === "POST" && pathname === "/point") {
          const raw = await req.text();
          let line: string;
          let to: string | null = null;
          try {
            const note = JSON.parse(raw) as { kind?: string; note?: string; verified?: boolean; to?: string; origin?: string; newSite?: boolean };
            to = note.to ?? null;
            const from = req.headers.get("origin") || "unknown";
            note.origin = from;
            note.newSite = !seen.has(from);
            if (note.newSite) {
              seen.add(from);
              await Bun.write(SEEN_FILE, JSON.stringify([...seen], null, 2));
            }
            const target = to ? sessions.get(to) : live().length === 1 ? live()[0] : undefined;
            if (note.kind === "followup" || note.kind === "answer") note.verified = Boolean(target && target.offered.has(note.note ?? ""));
            const { url: page, tab: fromTab } = note as { url?: string; tab?: string };
            if (target && fromTab) target.lastTab = String(fromTab).slice(0, 40);
            if (target) target.lastOrigin = from;
            if (target && page) {
              try {
                target.lastPath = new URL(page).pathname.replace(/\/+$/, "");
              } catch {}
            }
            line = JSON.stringify(note);
          } catch {
            line = JSON.stringify({ status: "unreadable", raw: raw.slice(0, 2000) });
          }
          const deliveredTo = deliver(line, to);
          return json({ ok: true, ...report(deliveredTo), deliveredTo }, 200, headers);
        }
        return new Response("not found", { status: 404, headers });
      },
    });
  } catch {
    fail(`Port ${PORT} is busy: a chalktalk helper is already running. Check it with: bun listen.ts status`);
  }

  await mkdir(HOME, { recursive: true });
  await Bun.write(TOKEN_FILE, secret);
  await chmod(TOKEN_FILE, 0o600);
  process.stderr.write(`chalktalk helper on ${BASE}${idleHours > 0 ? `, stops after ${idleHours} idle hours` : ", always on"}\n`);
  if (idleHours > 0) {
    setInterval(() => {
      if (Date.now() - lastActivity > idleHours * 3_600_000) process.exit(0);
    }, 60_000);
  }
}

const HOTKEY = process.platform === "darwin" ? "⌃⌥C (Control+Option+C)" : "Ctrl+Alt+C";

async function helperUp(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/status`)).ok;
  } catch {
    return false;
  }
}

async function startHelper(): Promise<boolean> {
  const script = fileURLToPath(new URL("./listen.ts", import.meta.url));
  const helper = Bun.spawn(["bun", script, "serve"], { stdio: ["ignore", "ignore", "ignore"], detached: true });
  helper.unref();
  for (let i = 0; i < 50 && !(await helperUp()); i++) await Bun.sleep(100);
  return helperUp();
}

async function start(): Promise<void> {
  if (!(await helperUp()) && !(await startHelper())) fail("The chalktalk helper did not start. Run: bun listen.ts serve");
  const app = Bun.spawn(["bun", fileURLToPath(new URL("./desktop.ts", import.meta.url)), "start"], { stdout: "inherit", stderr: "inherit" });
  await app.exited;
  let others: string[] = [];
  try {
    const status = (await (await fetch(`${BASE}/status?session=${encodeURIComponent(sessionName)}`)).json()) as { sessions?: Array<{ id: string; state: string }> };
    others = (status.sessions ?? []).filter((s) => s.id !== sessionName && s.state !== "away").map((s) => s.id);
  } catch {}
  out(`Listening. Click Chalktalk on any page, or press ${HOTKEY} anywhere on screen.`);
  if (others.length) out(`note: ${others.join(", ")} also listening, so the page will ask which session. A finished chat's entry clears by itself in about a minute.`);
  await listen();
}

// One long poll round. Returns the note, or null when the round ends without one.
async function nextNote(seconds: number): Promise<string | null> {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const res = await internal("/internal/next");
    if (!res) return null;
    if (res.status === 403) fail("The running chalktalk helper has a different token. Restart it.");
    if (res.status === 200) return await res.text();
  }
  return null;
}

// A one-shot waiter, for scripts that want to block until a note arrives.
// Keep every shipped lesson, so a repeat question is a replay instead of a rebuild.
async function saveLesson(dir: string): Promise<string> {
  const lesson = (await Bun.file(`${dir}/lesson.json`).json().catch(() => ({}))) as { title?: string };
  const slug = String(lesson.title || "lesson")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || `lesson-${Date.now()}`;
  const target = `${HOME}/saved/${slug}`;
  await mkdir(target, { recursive: true });
  await Bun.write(`${target}/lesson.json`, Bun.file(`${dir}/lesson.json`));
  for (const file of ["lesson.mp3", "lesson.wav"]) {
    if (await Bun.file(`${dir}/${file}`).exists()) await Bun.write(`${target}/${file}`, Bun.file(`${dir}/${file}`));
  }
  const indexFile = Bun.file(`${HOME}/saved/index.json`);
  const index = (await indexFile.exists()) ? ((await indexFile.json().catch(() => [])) as Array<{ slug: string; title: string; at: number }>) : [];
  const kept = index.filter((entry) => entry.slug !== slug);
  kept.unshift({ slug, title: String(lesson.title || slug), at: Date.now() });
  await Bun.write(`${HOME}/saved/index.json`, JSON.stringify(kept.slice(0, 200), null, 2));
  return slug;
}

async function replay(slug: string): Promise<void> {
  const dir = `${HOME}/saved/${slug.replace(/[^a-z0-9-]/g, "")}`;
  if (!(await Bun.file(`${dir}/lesson.json`).exists())) fail(`no saved lesson called ${slug}; bun listen.ts saved lists them`);
  await call("/internal/lesson", { dir });
  await ensureWaiter();
  out(JSON.stringify({ replayed: slug, listening: true }));
}

// Watch a lesson folder while it is being written: record any step that has no clip yet, so the
// page can start on step one and pick the rest up as they land.
async function watch(dir: string): Promise<void> {
  const file = `${dir}/lesson.json`;
  let last = 0;
  let quietSince = Date.now();
  for (;;) {
    const f = Bun.file(file);
    const stamp = (await f.exists()) ? f.lastModified + f.size : 0;
    if (stamp && stamp !== last) {
      last = stamp;
      quietSince = Date.now();
      const lesson = (await f.json().catch(() => null)) as { steps?: Array<{ audio?: string }>; done?: boolean } | null;
      const steps = lesson?.steps ?? [];
      const missing = steps.map((step, i) => (step.audio ? -1 : i)).filter((i) => i >= 0);
      for (const i of missing) {
        const run = Bun.spawn(["bun", fileURLToPath(new URL("./narrate.ts", import.meta.url)), dir, "--per-step", "--only", String(i + 1)], { stdout: "inherit", stderr: "inherit" });
        await run.exited;
      }
      if (lesson?.done && steps.length && steps.every((step) => step.audio)) {
        out(JSON.stringify({ streamed: dir, steps: steps.length }));
        return;
      }
    }
    if (Date.now() - quietSince > 10 * 60_000) {
      out(JSON.stringify({ streamed: dir, abandoned: true }));
      return;
    }
    await Bun.sleep(600);
  }
}

// check, narrate and post in one call, then put the waiter back: the whole tail of a lesson
// is one command, so the user is not waiting on three separate round trips.
async function send(dir: string): Promise<void> {
  if (!dir) fail("usage: bun listen.ts send <lesson-dir> [--dry]");
  const dry = rest.includes("--dry");
  const script = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));
  const check = Bun.spawn(["bun", script("check.ts"), dir], { stdout: "inherit", stderr: "inherit" });
  await check.exited;
  const stream = rest.includes("--stream");
  const narrate = Bun.spawn(
    ["bun", script("narrate.ts"), dir, ...(stream ? ["--per-step"] : [])],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await narrate.exited) !== 0) fail("narration failed, so nothing was sent");
  if (dry) {
    out("dry run: checked and narrated, nothing sent");
    return;
  }
  await call("/internal/lesson", { dir: resolvePath(dir) });
  const slug = await saveLesson(dir);
  await ensureWaiter();
  if (stream) {
    const watcher = Bun.spawn(["bun", script("listen.ts"), "watch", resolvePath(dir)], { stdio: ["ignore", "ignore", "ignore"], detached: true });
    watcher.unref();
  }
  out(JSON.stringify({ sent: resolvePath(dir), saved: slug, listening: true, streaming: stream }));
}

async function wait(): Promise<void> {
  const line = await nextNote(Number(flag("minutes", "30")) * 60);
  if (line) out(line);
  else out(JSON.stringify({ status: "timed out" }));
}

const waiterFile = () => `${HOME}/wait-${sessionName}.pid`;

// Only one waiter per session: a second one would split the user's notes between two processes.
async function ensureWaiter(): Promise<void> {
  const file = waiterFile();
  if (await Bun.file(file).exists()) {
    const pid = Number((await Bun.file(file).text()).trim());
    if (pid) {
      try {
        process.kill(pid, 0);
        return;
      } catch {}
    }
  }
  const bg = Bun.spawn(["bun", fileURLToPath(new URL("./listen.ts", import.meta.url)), "start", "--name", sessionName, ...(agentName ? ["--as", agentName] : [])], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  bg.unref();
  await Bun.write(file, String(bg.pid));
}

// The long-lived listener behind `start`: it never times out while the session is alive, and it
// brings the helper back if the helper stopped (idle shutdown, a crash, a restart).
async function listen(): Promise<void> {
  await Bun.write(waiterFile(), String(process.pid));
  for (;;) {
    const line = await nextNote(60);
    if (line) {
      out(line);
      return;
    }
    if (!(await helperUp()) && (await startHelper())) out("note: the helper had stopped, so I started it again.");
  }
}

async function call(path: string, body: unknown): Promise<void> {
  const res = await internal(path, body);
  if (!res) fail("No chalktalk helper is running.");
  out(await res.text());
}

async function report(): Promise<void> {
  try {
    out(await (await fetch(`${BASE}/status?session=${encodeURIComponent(sessionName)}`)).text());
  } catch {
    out(JSON.stringify({ claude: "off" }));
  }
}

async function setBlocked(block: boolean): Promise<void> {
  const [origin] = positional();
  if (!origin || !/^https?:\/\/[^/]+$/.test(origin)) fail(`usage: bun listen.ts ${block ? "block" : "unblock"} https://example.com`);
  await mkdir(HOME, { recursive: true });
  const list = (await readList(BLOCKED_FILE)).filter((entry) => entry !== origin);
  if (block) list.push(origin);
  await Bun.write(BLOCKED_FILE, JSON.stringify(list, null, 2));
  await internal("/internal/reload-blocked", {});
  out(JSON.stringify({ blocked: list }));
}

const words = positional();
if (command === "serve") await serve();
else if (command === "start") await start();
else if (command === "send") await send(words[0]);
else if (command === "replay") await replay(words[0] ?? "");
else if (command === "watch") await watch(words[0] ?? "");
else if (command === "saved") {
  const file = Bun.file(`${HOME}/saved/index.json`);
  const list = (await file.exists()) ? await file.json().catch(() => []) : [];
  out(list.length ? (list as Array<{ slug: string; title: string }>).map((e) => `${e.slug}  ${e.title}`).join("\n") : "nothing saved yet");
}
else if (command === "wait") await wait();
else if (command === "lesson") {
  if (!words[0]) fail("usage: bun listen.ts lesson <dir>");
  await call("/internal/lesson", { dir: resolvePath(words[0]) });
} else if (command === "plan") await call("/internal/plan", { steps: words });
else if (command === "step") await call("/internal/step", { n: Number(words[0]) });
else if (command === "progress") await call("/internal/progress", { text: words.join(" ") });
else if (command === "busy") await call("/internal/busy", {});
else if (command === "reply") await call("/internal/reply", { text: words.join(" ") });
else if (command === "idle") await call("/internal/idle", {});
else if (command === "leave") await call("/internal/leave", {});
else if (command === "stop") await call("/internal/stop", {});
else if (command === "block") await setBlocked(true);
else if (command === "unblock" || command === "allow") await setBlocked(false);
else if (command === "status") await report();
else if (command === "icons") {
  const set = await icons();
  if (!set) fail("icons missing: run bun install in the chalktalk folder");
  const want = words.map((w) => w.toLowerCase());
  const names = [...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})];
  const hits = names.filter((n) => want.every((w) => n.includes(w)));
  out(hits.length ? hits.slice(0, 40).join("  ") : `no icon matches ${want.join(" ")}; try a shorter word`);
} else if (command === "library") {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(`${HOME}/library`).catch(() => [] as string[]);
  out(files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).join("  ") || "the sketch library is empty");
}
else fail("usage: bun listen.ts start | send <dir> | replay <slug> | saved | serve | wait | lesson <dir> | plan … | step <n> | progress … | idle | leave | block <origin> | unblock <origin> | status   (add --name <session> and --as \"<model name>\" to name this session)");
