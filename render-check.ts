#!/usr/bin/env bun
// Draws every step of a lesson with the real engine in headless Chrome and measures what landed
// where. check.ts reads the coordinates you wrote; this reads the board the user will see, so it
// catches what the engine changed on the way: boxes it pushed aside, rows that stacked, labels
// that ended up on top of cards.
//
//   bun render-check.ts <lesson-dir> [--png]     exit 1 when something overlaps, moved, spills out of its box, or an arrow joins nothing
//
// --png also writes step-N.png into the lesson folder, one picture per step, for a look by eye.
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun render-check.ts <lesson-dir> [--png]");
  process.exit(2);
}
const png = process.argv.includes("--png");
const lesson = JSON.parse(readFileSync(join(dir, "lesson.json"), "utf8"));
const engine = readFileSync(fileURLToPath(new URL("./engine.js", import.meta.url)), "utf8");

function chrome(): string | null {
  const candidates = [
    process.env.CHALKTALK_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/opt/pw-browsers/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  for (const name of ["google-chrome", "chromium", "chromium-browser"]) {
    const found = Bun.which(name);
    if (found) return found;
  }
  return null;
}

const bin = chrome();
if (!bin) {
  console.log("render check skipped: no Chrome or Chromium found (set CHALKTALK_CHROME)");
  process.exit(0);
}

// Runs in the page: mount each board as the user sees it at step k (from the last clear up to k),
// then measure every drawn thing.
const probe = (lesson: any) => {
  const out: string[] = [];
  const steps = lesson.steps || [];
  const keys = ["board", "board2"].filter((k) => steps.some((s: any) => Array.isArray(s[k]) && s[k].length));
  const meta = lesson.board || {};
  const host = document.getElementById("m")!;
  const solidTypes = new Set(["box", "text", "icon", "person", "bubble", "sketch", "image", "logo", "code", "bars"]);
  const area = (a: DOMRect) => Math.max(0, a.width) * Math.max(0, a.height);
  const meet = (a: any, b: any) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const inside = (a: any, b: any) => a.x >= b.x - 3 && a.y >= b.y - 3 && a.x + a.w <= b.x + b.w + 3 && a.y + a.h <= b.y + b.h + 3;
  const name = (it: any) => `${it.type}${it.label ? ` "${it.label}"` : it.text ? ` "${it.text}"` : it.name ? ` ${it.name}` : ""}`;
  const seen = new Set<string>();
  for (const key of keys) {
    const W = (key === "board2" && meta.width2) || meta.width || 600;
    const H = (key === "board2" && meta.height2) || meta.height || (keys.length > 1 ? 260 : 420);
    let start = 0;
    steps.forEach((step: any, k: number) => {
      if (step.clear && k) start = k;
      const slice = steps.slice(start, k + 1).map((s: any, j: number) => ({
        items: JSON.parse(JSON.stringify(s[key] || [])).map((it: any) => ({
          ...it,
          ...(it.type === "row" && Array.isArray(it.items) ? { items: it.items.map((c: any) => ({ ...c, __step: start + j + 1 })) } : {}),
          __step: start + j + 1,
          __orig: it.type === "box" ? [it.x + (it.w || 0) / 2, it.y + (it.h || 0) / 2, it.x, it.y] : null,
        })),
        clear: false,
      }));
      let svgEl: SVGSVGElement | null = null;
      const asked = slice.flatMap((s: any) => s.items);
      try {
        (window as any).Chalktalk.mount(host, { width: W, height: H, autoplay: false, steps: slice });
        svgEl = host.querySelector("svg");
      } catch (e: any) {
        out.push(`step ${k + 1}: ${key} failed to draw: ${e && e.message}`);
        return;
      }
      asked.forEach((it: any) => {
        if (it.type !== "arrow" || !it.dropped || it.__step !== k + 1) return;
        if (it.loose) out.push(`step ${k + 1}: arrow ${JSON.stringify(it.from)} to ${JSON.stringify(it.to)} has its ${it.loose} in empty space, so it was not drawn; name what it joins ("from": "<id or label>", "to": "<id or label>")`);
        else out.push(`step ${k + 1}: arrow from "${it.from}" to "${it.to}" names something that isn't on the board, so it was not drawn; use an item's id or exact label`);
      });
      if (!svgEl) return;
      // Things the engine moved: compare where a box was asked to go with where it was drawn.
      slice.forEach((s: any) =>
        s.items.forEach((it: any) => {
          if (!it.__orig || it.__step !== k + 1) return;
          const [cx, cy, x0, y0] = it.__orig;
          if (Math.abs(it.x + it.w / 2 - cx) > 1 || Math.abs(it.y + it.h / 2 - cy) > 1) out.push(`step ${k + 1}: ${name(it)} was moved by the engine from (${x0},${y0}) to (${Math.round(it.x)},${Math.round(it.y)}) because it sat on something; place it somewhere free`);
        }),
      );
      // Everything drawn, with its real box. Each item is one <g data-type>; arrows count by their label.
      const groups = [...svgEl.querySelectorAll(":scope > g[data-type]")] as SVGGElement[];
      const flat = slice.flatMap((s: any) => s.items);
      if (groups.length !== flat.length) out.push(`step ${k + 1}: note: ${groups.length} drawn groups for ${flat.length} items, overlap names may be off`);
      const shapes: any[] = [];
      groups.forEach((g, i) => {
        const type = g.dataset.type!;
        const it = flat[i] || { type };
        if (it.__step === k + 1 && type === "box") {
          const card = g.querySelector("rect[rx]") as SVGGraphicsElement | null;
          const f = card ? card.getBBox() : { x: it.x, y: it.y, width: it.w, height: it.h };
          g.querySelectorAll("text").forEach((t) => {
            const b = (t as SVGGraphicsElement).getBBox();
            if (!b.width || ![f.x, f.y, f.width, f.height].every(Number.isFinite)) return;
            const over = Math.max(f.x - b.x, b.x + b.width - (f.x + f.width), f.y - b.y, b.y + b.height - (f.y + f.height));
            if (over > 2) out.push(`step ${k + 1}: "${t.textContent}" spills ${Math.round(over)}px out of its box; shorten the label (1 to 3 words) or move the detail to sub`);
          });
        }
        if (type === "arrow" || type === "line") {
          g.querySelectorAll("text").forEach((t) => {
            const b = (t as SVGGraphicsElement).getBBox();
            if (area(b)) shapes.push({ x: b.x, y: b.y, w: b.width, h: b.height, what: `arrow label "${t.textContent}"`, step: it.__step, label: true });
          });
          return;
        }
        if (!solidTypes.has(type)) return;
        const b = g.getBBox();
        if (!area(b)) return;
        shapes.push({ x: b.x, y: b.y, w: b.width, h: b.height, what: name(it), step: it.__step, label: type === "text" });
      });
      // Off the board.
      shapes.forEach((s) => {
        if (s.step !== k + 1) return;
        if (s.x < -2 || s.y < -2 || s.x + s.w > W + 2 || s.y + s.h > H + 2) out.push(`step ${k + 1}: ${s.what} runs off the ${W}x${H} board`);
      });
      // Overlaps that involve something new in this step. Nesting (one wholly inside the other) is fine
      // for frames, but a label inside a card that has its own label is not.
      for (let i = 0; i < shapes.length; i++)
        for (let j = i + 1; j < shapes.length; j++) {
          const a = shapes[i];
          const b = shapes[j];
          if (a.step !== k + 1 && b.step !== k + 1) continue;
          const m = meet(a, b);
          if (!m) continue;
          const small = Math.min(a.w * a.h, b.w * b.h);
          if (m < Math.max(40, small * 0.12)) continue;
          const nested = inside(a, b) || inside(b, a);
          if (nested) {
            const inner = inside(a, b) ? a : b;
            const outer = inner === a ? b : a;
            // a small thing inside a big frame is a layout; inside a card of similar size it is a pile
            if (outer.w * outer.h > inner.w * inner.h * 2.2) continue;
          }
          const msg = `step ${k + 1}: ${a.step === k + 1 ? a.what : b.what} lands on ${a.step === k + 1 ? b.what : a.what}${(a.step === k + 1 ? b : a).step !== k + 1 ? ` from step ${(a.step === k + 1 ? b : a).step}` : ""}`;
          if (!seen.has(msg)) {
            seen.add(msg);
            out.push(msg);
          }
        }
    });
  }
  return out;
};

const work = mkdtempSync(join(tmpdir(), "chalktalk-render-"));
try {
  const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fbfaf6}</style></head><body><div id="m" style="width:${lesson.board?.width || 600}px"></div><pre id="out"></pre><script>${engine}</script><script>${body}</script></body></html>`;
  const file = join(work, "probe.html");
  writeFileSync(file, page(`try { document.getElementById("out").textContent = JSON.stringify((${probe.toString()})(${JSON.stringify(lesson)})); } catch (e) { document.getElementById("out").textContent = JSON.stringify(["render check crashed: " + e.message]); }`));
  const run = Bun.spawnSync([bin, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--virtual-time-budget=8000", "--dump-dom", `file://${file}`], { stderr: "ignore" });
  const dom = run.stdout.toString();
  const raw = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom)?.[1];
  if (!raw) {
    console.log("render check failed: headless Chrome returned nothing, so the board was never measured");
    process.exit(1);
  }
  const problems: string[] = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));

  if (png) {
    const steps = lesson.steps || [];
    let start = 0;
    steps.forEach((step: any, k: number) => {
      if (step.clear && k) start = k;
      const slice = steps.slice(start, k + 1).map((s: any) => ({ items: (s.board || []).map(({ at, ...it }: any) => it) }));
      const f = join(work, `s${k}.html`);
      writeFileSync(f, page(`Chalktalk.mount(document.getElementById("m"), { width: ${lesson.board?.width || 600}, height: ${lesson.board?.height || 420}, autoplay: true, steps: [{ items: ${JSON.stringify(slice.flatMap((s: any) => s.items))} }] });`));
      Bun.spawnSync([bin, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--force-prefers-reduced-motion", "--virtual-time-budget=15000", `--window-size=${lesson.board?.width || 600},${(lesson.board?.height || 420) + 60}`, `--screenshot=${join(dir, `step-${k + 1}.png`)}`, `file://${f}`], { stderr: "ignore" });
    });
  }

  if (!problems.length) {
    console.log("render check: every step draws clean");
    process.exit(0);
  }
  for (const p of problems) console.log(`  ${p}`);
  console.log(`render check: ${problems.length} thing${problems.length === 1 ? "" : "s"} to fix on the real board`);
  process.exit(1);
} finally {
  rmSync(work, { recursive: true, force: true });
}
