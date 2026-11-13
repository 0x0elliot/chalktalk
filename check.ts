// Fast structural check of a lesson folder: no browser, no network, milliseconds.
//   bun check.ts <lesson-dir>
// Catches the mistakes that cost a screenshot round trip: items off the board, a step
// re-using a spot an earlier step already drew on, labels that will collide, timeline
// marks that will stack, cues that don't match the script, and a lesson that was never
// narrated. Prints one line per problem; exits 1 when there is any.
import { hash } from "node:crypto";

const dir = Bun.argv[2];
if (!dir) {
  process.stderr.write("usage: bun check.ts <lesson-dir>\n");
  process.exit(1);
}

const file = Bun.file(`${dir}/lesson.json`);
if (!(await file.exists())) {
  process.stderr.write(`no lesson.json in ${dir}\n`);
  process.exit(1);
}
const lesson = await file.json();
const W = lesson.board?.width || 680;
const H = lesson.board?.height || 400;
const steps = lesson.steps || [];
const problems: string[] = [];
const warn = (step: number, msg: string) => problems.push(`${step ? `step ${step}: ` : ""}${msg}`);

// Rough text metrics for Patrick Hand, the same estimate engine.js uses. Text is drawn centred on
// its y (dominant-baseline central), 20 px unless sized.
const textWidth = (s, size = 18) => Math.max(0, ...String(s).split("\n").map((l) => l.length)) * size * 0.52;
const textBox = (it) => {
  const size = it.size || 20;
  const w = textWidth(it.text, size);
  const h = String(it.text).split("\n").length * size * 1.15;
  const anchor = it.anchor || "middle";
  const x = anchor === "start" ? it.x : anchor === "end" ? it.x - w : it.x - w / 2;
  return { x, y: it.y - h / 2, w, h, label: String(it.text) };
};
const PAD = 6;

// The engine's timeline placement (engine.js placeEvent), run here so the checker reports exactly
// the labels the engine could not keep apart.
const sideOf = (side) =>
  side === "above" || side === "top" || side === "up" ? "above" : side === "below" || side === "bottom" || side === "down" ? "below" : null;
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 12) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 6);
function placeEvent(line, e, obstacles) {
  const ex = line.X(e.year);
  const when = e.when ?? e.year;
  const footprint = Math.max(Math.min(textWidth(e.label ?? "", 18), e.width || 150), when == null ? 0 : textWidth(String(when), 13)) + 10;
  const half = footprint / 2;
  const asked = sideOf(e.side);
  const first = asked || (line.count++ % 2 === 0 ? "above" : "below");
  const other = first === "above" ? "below" : "above";
  const reaches = e.reach ? [e.reach] : [58, 100, 142];
  const slides = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8].map((k) => k * footprint);
  const sides = asked ? [first] : [first, other];
  const order: Array<[string, number, number]> = [];
  for (const reach of reaches) for (const side of sides) for (const dx of slides) order.push([side, reach, dx]);
  if (asked) for (const reach of reaches) for (const dx of slides) order.push([other, reach, dx]);
  const centre = (dx) => Math.min(Math.max(ex + dx, PAD + half), W - PAD - half);
  const rectFor = (side, reach, cx) =>
    side === "above"
      ? { x0: cx - half, x1: cx + half, y0: line.y - reach - 36, y1: line.y - reach + 8 }
      : { x0: cx - half, x1: cx + half, y0: line.y + reach - 8, y1: line.y + reach + 38 };
  const stemsFor = (side, reach, cx) => {
    const end = side === "above" ? line.y - reach + 14 : line.y + reach - 14;
    const upright = side === "above" ? { x0: ex - 2, x1: ex + 2, y0: end, y1: line.y - 6 } : { x0: ex - 2, x1: ex + 2, y0: line.y + 6, y1: end };
    return cx === ex ? [upright] : [upright, { x0: Math.min(ex, cx) - 2, x1: Math.max(ex, cx) + 2, y0: end - 2, y1: end + 2 }];
  };
  const sum = (list, r) => list.reduce((s, l) => s + overlap(r, l), 0);
  const cost = (side, reach, cx) => {
    const r = rectFor(side, reach, cx);
    if (r.y0 < 0 || r.y1 > H) return Infinity;
    const stems = stemsFor(side, reach, cx);
    return sum(line.labels, r) + sum(line.stems, r) + sum(obstacles, r) + stems.reduce((s, st) => s + sum(line.labels, st) + sum(obstacles, st), 0);
  };
  let best: { side: string; reach: number; cx: number; cost: number } | null = null;
  for (const [side, reach, dx] of order) {
    const cx = centre(dx);
    const c = cost(side, reach, cx);
    if (!best || c < best.cost) best = { side, reach, cx, cost: c };
    if (c === 0) break;
  }
  const pick = best && Number.isFinite(best.cost) ? best : { side: first, reach: reaches[0], cx: centre(0), cost: Infinity };
  const rect = rectFor(pick.side, pick.reach, pick.cx);
  const hit = line.labels.find((l) => overlap(rect, l) > 0);
  line.labels.push({ ...rect, label: String(e.label ?? ""), step: e.step });
  line.stems.push(...stemsFor(pick.side, pick.reach, pick.cx));
  return { clash: pick.cost !== 0, hit };
}

// Where an item will sit, the same estimate engine.js footprintOf uses.
function footprintOf(it) {
  const n = (v) => Number.isFinite(v);
  if (["box", "bubble", "figure", "image", "bars", "row", "map"].includes(it.type) && [it.x, it.y, it.w, it.h].every(n))
    return { x0: it.x, x1: it.x + it.w, y0: it.y, y1: it.y + it.h };
  if (it.type === "code" && n(it.x) && n(it.y)) {
    const ls = it.lines || [];
    const w = it.w || 48 + 16 + Math.max(10, ...ls.map((l) => String(l).length)) * 7.8;
    return { x0: it.x, x1: it.x + w, y0: it.y - 22, y1: it.y + ls.length * 20 + 16 };
  }
  if (it.type === "text" && n(it.x) && n(it.y)) {
    const b = textBox(it);
    return { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h };
  }
  if ((it.type === "icon" || it.type === "logo") && n(it.x) && n(it.y)) {
    const size = it.size || 32;
    return { x0: it.x, x1: it.x + size, y0: it.y, y1: it.y + size + (it.label ? 26 : 0) };
  }
  if (it.type === "person" && n(it.x) && n(it.y)) return { x0: it.x - 32, x1: it.x + 32, y0: it.y - 14, y1: it.y + 122 };
  return null;
}
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fmt = (n) => Math.round(n);

const texts: any[] = [];
const lines = new Map<string, any>();
// Everything each board will hold, so a timeline label is checked against items drawn after it too.
const plan: any[][] = [];
steps.reduce((s, step, i) => {
  const at = step.clear && i ? s + 1 : s;
  plan[at] = (plan[at] || []).concat([...(step.board || []), ...(step.board2 || [])].map(footprintOf).filter(Boolean));
  return at;
}, 0);
let seg = 0;
function placeOn(line, id, e, n) {
  if (e.side != null && !sideOf(e.side)) warn(n, `event "${e.label}": side "${e.side}" is not above or below`);
  const { clash, hit } = placeEvent(line, e, plan[seg] || []);
  if (clash)
    warn(n, `timeline "${id}": "${e.label}" has no free spot${hit ? ` and overlaps "${hit.label}" from step ${hit.step}` : " clear of the rest of the board"} — merge two marks into one, widen the timeline, or move what is in the way`);
}
const spots: any[] = [];
let sawClear = false;

steps.forEach((step, i) => {
  const n = i + 1;
  if (step.clear) {
    spots.length = 0;
    texts.length = 0;
    sawClear = true;
    if (i) seg++;
  }
  if (!step.say || String(step.say).trim().length < 12) warn(n, "no say script");

  // Rows expand the same way the engine expands them, so their cards are checked too.
  const raw = [...(step.board || []), ...(step.board2 || [])];
  const items = raw.flatMap((it: any) => {
    if (it.type !== "row") return [it];
    const gap = it.gap ?? 16;
    const h = it.h || 58;
    const cells = it.items || [];
    const bw = (it.w - gap * (cells.length - 1)) / cells.length;
    return cells.map((cell: any, k: number) => ({ type: "box", x: it.x + k * (bw + gap), y: it.y, w: bw, h, ...cell }));
  });
  if (items.length + texts.length > 14) warn(n, `${items.length + texts.length} items on a board (12 is plenty)`);

  items.forEach((it) => {
    // An item drawn again on a spot an earlier step used is either a deliberate update
    // (fine) or the stacked-icon bug (not fine). Report it either way.
    if (["box", "text", "icon", "sketch", "image", "person", "bubble", "figure"].includes(it.type) && Number.isFinite(it.x) && Number.isFinite(it.y)) {
      const before = spots.find((s) => s.type === it.type && Math.abs(s.x - it.x) <= 12 && Math.abs(s.y - it.y) <= 12);
      if (before) {
        warn(n, `${it.type} at (${fmt(it.x)},${fmt(it.y)}) lands on step ${before.step}'s ${it.type} — intentional update, or move it?`);
        // The engine drops the earlier item, so it cannot also collide with anything, and the new
        // one becomes the item later steps land on.
        texts.filter((t) => t.step === before.step && Math.abs(t.y - it.y) < 30).forEach((t) => (t.dropped = true));
        spots.splice(spots.indexOf(before), 1);
      }
      spots.push({ type: it.type, x: it.x, y: it.y, step: n });
    }

    // Outside the board.
    if (Number.isFinite(it.x) && (it.x < 0 || it.x > W)) warn(n, `${it.type} x=${fmt(it.x)} is off a ${W}-wide board`);
    if (Number.isFinite(it.y) && (it.y < 0 || it.y > H)) warn(n, `${it.type} y=${fmt(it.y)} is off a ${H}-tall board`);
    if (it.type === "box" && Number.isFinite(it.x) && (it.x + it.w > W + 4 || it.y + it.h > H + 4)) warn(n, `box "${it.label}" runs past the board edge`);

    // Two labels the reader cannot separate.
    if (it.type === "text") {
      const box = textBox(it);
      texts.forEach((other) => {
        if (other.dropped || hits(box, other) === false) return;
        warn(n, `text "${box.label}" collides with "${other.label}" from step ${other.step}`);
      });
      texts.push({ ...box, step: n });
      // The engine slides escaping text back onto the board, so it may land on something else.
      if (box.w > W - 2 * PAD) warn(n, `text "${box.label}" is wider than the board; it will be shrunk, so shorten it`);
      else if (box.x < PAD || box.x + box.w > W - PAD || box.y < PAD || box.y + box.h > H - PAD)
        warn(n, `text "${box.label}" runs off the board; it will be pulled inside, so place it where it fits`);
    }

    // Code lines past the board's right edge are cut with an ellipsis.
    if (it.type === "code" && Number.isFinite(it.x)) {
      const fits = Math.floor((W - PAD - it.x - 52 - 16) / 7.8);
      const long = (it.lines || []).filter((l) => String(l).length > fits);
      if (long.length) warn(n, `code "${it.id || "code"}": ${long.length} line(s) longer than ${fits} characters will be cut; move it left or trim the line`);
    }

    // A timeline is read left to right, so nothing on it may overlap anything else. The engine
    // places each label on the free side or lifts it on a taller stem; this reports what is left.
    if (it.type === "timeline") {
      const span = Number(it.to) - Number(it.from) || 1;
      const line = { X: (when) => it.x + ((Number(when) - Number(it.from)) / span) * it.w, y: it.y, count: 0, labels: [], stems: [] };
      lines.set(it.id || "timeline", line);
      (it.events || []).forEach((e) => placeOn(line, it.id || "timeline", { ...e, step: n }, n));
    }
    if (it.type === "event") {
      const id = it.timeline || "timeline";
      const line = lines.get(id);
      if (!line) warn(n, `event "${it.label}" points at timeline "${id}", which is not drawn yet`);
      else placeOn(line, id, { ...it, step: n }, n);
    }

    // Cues that point at words the step never says.
    if (it.on && !String(step.say || "").includes(it.on)) warn(n, `cue "${it.on}" is not in this step's say`);
  });

  (step.highlight || []).forEach((h) => {
    if (h.on && !String(step.say || "").includes(h.on)) warn(n, `highlight cue "${h.on}" is not in this step's say`);
  });

  // Timelines need room for the labels above and below.
  (step.board || []).forEach((it) => {
    if (it.type !== "timeline") return;
    if (it.y - 70 < 0) warn(n, `timeline at y=${it.y} has no room for labels above`);
    if (it.y + 90 > H) warn(n, `timeline at y=${it.y} has no room for labels below a ${H}-tall board`);
  });
});

// A stage that changes identity or geometry between steps makes the model jump.
const stageIds = new Map();
steps.forEach((s, i) => {
  if (!s.stage || (!Array.isArray(s.stage.parts) && !Array.isArray(s.stage.add))) return;
  const id = s.stage.id ? String(s.stage.id) : "";
  if (!id) {
    if (steps.filter((x) => x.stage).length > 1) warn(i + 1, "stage without an id — give it one so it is the same object every step");
    return;
  }
  const before = stageIds.get(id);
  if (before) {
    const same = ["x", "y", "w", "h"].every((k) => (before[k] ?? null) === (s.stage[k] ?? null));
    if (!same) warn(i + 1, `stage "${id}" moves or resizes between steps — keep x, y, w, h fixed and change only parts`);
  }
  stageIds.set(id, s.stage);
});

if (!steps.length) warn(0, "no steps");
if (steps.length > 7) warn(0, `${steps.length} steps is long for one answer`);
if (steps.length && !sawClear && steps.length > 4) warn(0, "no clear in a long lesson — check the board can hold it");

const hasClips = steps.length > 0 && steps.every((step: { audio?: string }) => step.audio);
if (!hasClips && !(await Bun.file(`${dir}/lesson.mp3`).exists())) warn(0, "not narrated yet (no audio)");

if (problems.length) {
  problems.forEach((p) => process.stdout.write(`  ${p}\n`));
  process.stdout.write(`${problems.length} thing${problems.length === 1 ? "" : "s"} to look at\n`);
  process.exit(1);
}
const audio = Bun.file(`${dir}/lesson.mp3`);
process.stdout.write(`ok: ${steps.length} steps, ${W}×${H}, ${(await audio.exists()) ? `${Math.round(audio.size / 1000)} kB of audio` : hasClips ? "narrated per step" : "silent"}\n`);
