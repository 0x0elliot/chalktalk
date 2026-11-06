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

// Rough text metrics for Patrick Hand, enough to catch two labels on one spot.
const textWidth = (s, size = 18) => String(s).length * size * 0.5;
const textBox = (it) => {
  const w = textWidth(it.text, it.size || 18);
  const h = (it.size || 18) * 1.2;
  const anchor = it.anchor || "middle";
  const x = anchor === "start" ? it.x : anchor === "end" ? it.x - w : it.x - w / 2;
  return { x, y: it.y - h, w, h, label: String(it.text) };
};
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fmt = (n) => Math.round(n);

const texts = [];
const spots = [];
let sawClear = false;

steps.forEach((step, i) => {
  const n = i + 1;
  if (step.clear) {
    spots.length = 0;
    texts.length = 0;
    sawClear = true;
  }
  if (!step.say || String(step.say).trim().length < 12) warn(n, "no say script");

  const items = [...(step.board || []), ...(step.board2 || [])];
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
    }

    // Events on one timeline sit on top of each other.
    if (it.type === "event") {
      const line = steps.flatMap((s) => s.board || []).find((x) => x.type === "timeline" && (x.id || "timeline") === (it.timeline || "timeline"));
      if (line) {
        const x = line.x + ((Number(it.year) - line.from) / (line.to - line.from)) * line.w;
        const side = it.side || "above";
        const before = spots.find((s) => s.type === "event" && s.side === side && Math.abs(s.x - x) < 12);
        if (before) warn(n, `event "${it.label}" sits within 12 px of "${before.label}" on the same side`);
        spots.push({ type: "event", x, y: 0, step: n, side });
      }
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

if (!steps.length) warn(0, "no steps");
if (steps.length > 7) warn(0, `${steps.length} steps is long for one answer`);
if (steps.length && !sawClear && steps.length > 4) warn(0, "no clear in a long lesson — check the board can hold it");

const audio = Bun.file(`${dir}/lesson.mp3`);
if (!(await audio.exists())) warn(0, "not narrated yet (no lesson.mp3)");

if (problems.length) {
  problems.forEach((p) => process.stdout.write(`  ${p}\n`));
  process.stdout.write(`${problems.length} thing${problems.length === 1 ? "" : "s"} to look at\n`);
  process.exit(1);
}
process.stdout.write(`ok: ${steps.length} steps, ${W}×${H}, ${Bun.file(`${dir}/lesson.mp3`).size ? `${Math.round((await audio.size) / 1000)} kB of audio` : "silent"}\n`);
