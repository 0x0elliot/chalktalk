// A small, honest benchmark of the lesson loop: what is cheap, what is not.
//   bun bench.ts <lesson-dir> ...
import { stat } from "node:fs/promises";

const dirs = Bun.argv.slice(2);
if (!dirs.length) {
  process.stderr.write("usage: bun bench.ts <lesson-dir> ...\n");
  process.exit(1);
}

const here = (name: string) => new URL(`./${name}`, import.meta.url).pathname;
const run = async (args: string[]) => {
  const start = Bun.nanoseconds();
  const proc = Bun.spawn(["bun", ...args], { stdout: "ignore", stderr: "ignore" });
  const code = await proc.exited;
  return { ms: (Bun.nanoseconds() - start) / 1e6, code };
};
const pad = (s: string, n: number) => s.padEnd(n);
const num = (n: number, d = 1) => n.toFixed(d);

const rows: string[] = [];
let checkTotal = 0;
let narrateTotal = 0;
for (const dir of dirs) {
  const file = Bun.file(`${dir}/lesson.json`);
  if (!(await file.exists())) continue;
  const text = await file.text();
  const lesson = JSON.parse(text);
  const steps = lesson.steps?.length ?? 0;
  const items = (lesson.steps ?? []).reduce((n: number, s: { board?: unknown[]; board2?: unknown[] }) => n + (s.board?.length ?? 0) + (s.board2?.length ?? 0), 0);
  const check = await run([here("check.ts"), dir]);
  checkTotal += check.ms;
  // Only time the cached path. Timing a lesson with no cache stamp would record it again and spend
  // real ElevenLabs characters, which is not what a benchmark is for.
  const stamped = await Bun.file(`${dir}/.narration`).exists();
  const mp3 = await stat(`${dir}/lesson.mp3`).catch(() => null);
  const narrate = mp3 && stamped ? await run([here("narrate.ts"), dir]) : null;
  if (narrate) narrateTotal += narrate.ms;
  rows.push(
    [
      pad(dir.split("/").filter(Boolean).pop() ?? dir, 18),
      pad(`${num(text.length / 1000)}k chars`, 12),
      pad(`~${Math.round(text.length / 4 / 100) / 10}k tok`, 9),
      pad(`${steps} st`, 6),
      pad(`${items} it`, 7),
      pad(`${num(check.ms, 0)} ms`, 8),
      narrate ? `${num(narrate.ms, 0)} ms` : "—",
    ].join(" "),
  );
}

process.stdout.write(`${pad("lesson", 18)} ${pad("size", 12)} ${pad("out", 9)} ${pad("steps", 6)} ${pad("items", 7)} check    narrate(cached)\n`);
rows.forEach((r) => process.stdout.write(`${r}\n`));

// The row primitive against hand-placed boxes and arrows: the same board, written two ways.
const cell = (label: string, color: string, x: number) => ({ type: "box", x, y: 150, w: 140, h: 58, label, color });
const longhand = {
  type: "board",
  items: [
    cell("engine", "purple", 15), cell("gearbox", "amber", 170), cell("tyre", "blue", 325), cell("road", "green", 480),
    { type: "arrow", from: [155, 179], to: [170, 179] },
    { type: "arrow", from: [310, 179], to: [325, 179] },
    { type: "arrow", from: [465, 179], to: [480, 179] },
  ],
};
const shorthand = {
  type: "row",
  x: 15,
  y: 150,
  w: 605,
  h: 58,
  items: [
    { label: "engine", color: "purple" },
    { label: "gearbox", color: "amber" },
    { label: "tyre", color: "blue" },
    { label: "road", color: "green" },
  ],
};
const a = JSON.stringify(longhand).length;
const b = JSON.stringify(shorthand).length;
process.stdout.write(
  `\nrow vs boxes+arrows: ${a} -> ${b} chars (${Math.round((1 - b / a) * 100)}% less to write)\n` +
    `check: ${num(checkTotal / Math.max(1, rows.length), 1)} ms avg · narrate cached: ${num(narrateTotal / Math.max(1, rows.length), 1)} ms avg\n`,
);
