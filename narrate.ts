import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";

const KEYCHAIN_SERVICE = "elevenlabs-chalktalk";
const ELEVEN_VOICE = "21m00Tcm4TlvDq8ikWAM";
const ELEVEN_MODEL = "eleven_flash_v2_5";
const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_VOICE = "af_heart";
const HOME = `${homedir()}/.chalktalk`;
const RUNTIME = `${HOME}/kokoro`;
const STEP_GAP_SECONDS = 0.25;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [dir, ...flags] = Bun.argv.slice(2);
if (!dir) fail("usage: bun narrate.ts <lesson-dir> [--engine kokoro|elevenlabs] [--voice <id>]");

function flag(name: string): string | undefined {
  const i = flags.indexOf(`--${name}`);
  return i >= 0 ? flags[i + 1] : undefined;
}

type KeySource =
  | { from: "env"; name?: string }
  | { from: "keychain"; service?: string }
  | { from: "gcloud"; project: string; secret: string }
  | { from: "command"; command: string };
type Config = { voice?: string; elevenlabsVoice?: string; elevenlabsModel?: string; keychainService?: string; elevenlabsKey?: KeySource };
const configFile = Bun.file(`${HOME}/config.json`);
const config: Config = (await configFile.exists()) ? ((await configFile.json().catch(() => ({}))) as Config) : {};

async function configuredEngine(): Promise<string> {
  return config.voice === "elevenlabs" ? "elevenlabs" : "kokoro";
}

type Cue = { on?: string; at?: number };
type LessonStep = { say?: string; audio?: string; board?: Cue[]; board2?: Cue[]; highlight?: Cue[] };
type Lesson = { steps?: LessonStep[]; audio?: string; timeline?: number[]; voice?: string };
type Spoken = { file: string; timeline: number[]; cueTime: (step: number, charIndex: number) => number; seconds: number };

const lessonFile = Bun.file(`${dir}/lesson.json`);
if (!(await lessonFile.exists())) fail(`${dir}/lesson.json is missing`);
const lesson = (await lessonFile.json()) as Lesson;
const steps = lesson.steps ?? [];
const says = steps.map((step) => (step.say ?? "").trim());

function elevenKey(): string {
  const read = (command: string[]) => {
    const result = Bun.spawnSync(command, { stderr: "ignore" });
    return result.exitCode === 0 ? result.stdout.toString().trim() : "";
  };
  const source = config.elevenlabsKey;
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  if (source?.from === "env") return process.env[source.name || "ELEVENLABS_API_KEY"] || "";
  if (source?.from === "gcloud") return read(["gcloud", "secrets", "versions", "access", "latest", `--secret=${source.secret}`, `--project=${source.project}`]);
  if (source?.from === "command") return read(process.platform === "win32" ? ["cmd", "/c", source.command] : ["sh", "-c", source.command]);
  const service = (source?.from === "keychain" && source.service) || config.keychainService || KEYCHAIN_SERVICE;
  return process.platform === "darwin" ? read(["security", "find-generic-password", "-s", service, "-w"]) : "";
}

function keyHelp(): string {
  const source = config.elevenlabsKey;
  if (source?.from === "gcloud") return `could not read secret ${source.secret} in project ${source.project} (is gcloud logged in?)`;
  if (source?.from === "command") return "the key command printed nothing";
  if (source?.from === "env") return `${source.name || "ELEVENLABS_API_KEY"} is not set`;
  return "no key found; run bun setup.ts in the chalktalk folder to choose where it comes from";
}

async function withElevenLabs(): Promise<Spoken> {
  const key = elevenKey();
  if (!key) throw new Error(`no ElevenLabs key: ${keyHelp()}`);
  let script = "";
  const starts = says.map((words) => {
    if (script && words) script += " ";
    const at = script.length;
    script += words;
    return at;
  });
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${flag("voice") ?? config.elevenlabsVoice ?? ELEVEN_VOICE}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: script,
      model_id: config.elevenlabsModel || ELEVEN_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}: ${await response.text()}`);
  const spoken = (await response.json()) as { audio_base64: string; alignment: { character_start_times_seconds: number[] } };
  await Bun.write(`${dir}/lesson.mp3`, Buffer.from(spoken.audio_base64, "base64"));
  const times = spoken.alignment.character_start_times_seconds;
  const timeAt = (index: number) => times[Math.min(index, times.length - 1)] ?? 0;
  const timeline = starts.map((offset, i) => (i === 0 ? 0 : timeAt(offset)));
  return {
    file: "lesson.mp3",
    timeline,
    cueTime: (step, charIndex) => timeAt(starts[step] + charIndex) - timeline[step],
    seconds: times.length ? times[times.length - 1] : 0,
  };
}

async function kokoroModule(): Promise<{ KokoroTTS: { from_pretrained: (model: string, options: Record<string, string>) => Promise<KokoroEngine> } }> {
  const entry = `${RUNTIME}/node_modules/kokoro-js`;
  if (!(await Bun.file(`${entry}/package.json`).exists())) {
    process.stderr.write(`installing Kokoro once into ${RUNTIME}\n`);
    await mkdir(RUNTIME, { recursive: true });
    if (!(await Bun.file(`${RUNTIME}/package.json`).exists())) await Bun.write(`${RUNTIME}/package.json`, '{ "name": "sketch-kokoro", "private": true }\n');
    const install = Bun.spawnSync(["bun", "add", "kokoro-js"], { cwd: RUNTIME, stdout: "ignore", stderr: "inherit" });
    if (install.exitCode !== 0) throw new Error("could not install kokoro-js");
  }
  return import(Bun.resolveSync("kokoro-js", RUNTIME));
}

type KokoroEngine = { generate: (text: string, options: { voice: string }) => Promise<{ audio: Float32Array; sampling_rate: number }> };

function wav(samples: Float32Array, rate: number): Uint8Array {
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  out.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  text(36, "data");
  out.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Uint8Array(out.buffer);
}

async function withKokoro(): Promise<Spoken> {
  const { KokoroTTS } = await kokoroModule();
  const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: "q8", device: "cpu" });
  const voice = flag("voice") ?? KOKORO_VOICE;
  const clips: Float32Array[] = [];
  let rate = 24000;
  for (const words of says) {
    if (!words) {
      clips.push(new Float32Array(0));
      continue;
    }
    const audio = await tts.generate(words, { voice });
    rate = audio.sampling_rate;
    clips.push(audio.audio);
  }
  const gap = Math.round(STEP_GAP_SECONDS * rate);
  const total = clips.reduce((sum, clip) => sum + clip.length + gap, 0);
  const joined = new Float32Array(total);
  const timeline: number[] = [];
  const lengths: number[] = [];
  let at = 0;
  for (const clip of clips) {
    timeline.push(at / rate);
    lengths.push(clip.length / rate);
    joined.set(clip, at);
    at += clip.length + gap;
  }
  await Bun.write(`${dir}/lesson.wav`, wav(joined, rate));
  return {
    file: "lesson.wav",
    timeline,
    cueTime: (step, charIndex) => (says[step].length ? (charIndex / says[step].length) * lengths[step] : 0),
    seconds: total / rate,
  };
}

const wanted = flag("engine") ?? (await configuredEngine());
let spoken: Spoken;
let used = wanted;
try {
  spoken = wanted === "elevenlabs" ? await withElevenLabs() : await withKokoro();
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err);
  used = wanted === "elevenlabs" ? "kokoro" : "elevenlabs";
  process.stderr.write(`${wanted} failed (${reason}); trying ${used}\n`);
  spoken = used === "elevenlabs" ? await withElevenLabs() : await withKokoro();
}

const missing: string[] = [];
steps.forEach((step, i) => {
  delete step.audio;
  const said = says[i].toLowerCase();
  for (const cue of [...(step.board ?? []), ...(step.board2 ?? []), ...(step.highlight ?? [])]) {
    if (!cue.on) continue;
    const found = said.indexOf(cue.on.toLowerCase());
    if (found < 0) {
      missing.push(`step ${i + 1}: "${cue.on}"`);
      continue;
    }
    cue.at = Math.max(0, Math.round(spoken.cueTime(i, found) * 100) / 100);
  }
});
lesson.audio = spoken.file;
lesson.voice = used;
lesson.timeline = spoken.timeline.map((t) => Math.round(t * 100) / 100);
await Bun.write(`${dir}/lesson.json`, JSON.stringify(lesson, null, 2));
process.stdout.write(
  `wrote one ${Math.round(spoken.seconds)}s narration with ${used} and ${steps.length} cues to ${dir}${used === "elevenlabs" ? `, ${says.join(" ").length} ElevenLabs characters used` : ", free"}\n`,
);
if (missing.length) process.stdout.write(`phrases not found in their step's say, drawn without timing: ${missing.join("; ")}\n`);
