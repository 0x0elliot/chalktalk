import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = join(homedir(), ".chalktalk");
const HOTKEY = process.platform === "darwin" ? "⌃⌥C (Control+Option+C)" : "Ctrl+Alt+C";
const PID_FILE = join(HOME, "desktop.pid");
const LOG_FILE = join(HOME, "desktop-build.log");
const PROJECT = join(import.meta.dir, "desktop");
const BINARY = join(PROJECT, "target", "release", process.platform === "win32" ? "chalktalk-desktop.exe" : "chalktalk-desktop");

const [command = "start"] = Bun.argv.slice(2);

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function runningPid(): Promise<number | null> {
  const file = Bun.file(PID_FILE);
  if (!(await file.exists())) return null;
  const pid = Number((await file.text()).trim());
  if (!pid) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

async function build(): Promise<boolean> {
  if (!Bun.which("cargo")) {
    out("Rust is not installed, so the desktop app can't be built. Install it from https://rustup.rs, then run this again. The bookmark still works.");
    return false;
  }
  out(`Building the desktop app once (about 5 minutes). Log: ${LOG_FILE}`);
  const proc = Bun.spawn(["cargo", "build", "--release"], { cwd: PROJECT, stdout: Bun.file(LOG_FILE), stderr: Bun.file(LOG_FILE) });
  if ((await proc.exited) !== 0) {
    out(`The build failed. The last lines of ${LOG_FILE} say why.`);
    return false;
  }
  return true;
}

async function start(): Promise<void> {
  const pid = await runningPid();
  if (pid) {
    out(`The desktop app is already running. Press ${HOTKEY} to circle anything on screen.`);
    return;
  }
  await mkdir(HOME, { recursive: true });
  if (!(await Bun.file(BINARY).exists()) && !(await build())) return;
  const env = { ...process.env };
  if (process.platform === "linux" && env.WAYLAND_DISPLAY) env.GDK_BACKEND = "x11";
  const app = Bun.spawn([BINARY], { cwd: PROJECT, env, stdio: ["ignore", "ignore", "ignore"], detached: true });
  app.unref();
  await Bun.write(PID_FILE, String(app.pid));
  out(`The desktop app is running. Press ${HOTKEY} to circle anything on screen.`);
}

async function stop(): Promise<void> {
  const pid = await runningPid();
  if (!pid) {
    out("The desktop app is not running.");
    return;
  }
  process.kill(pid);
  out("The desktop app stopped.");
}

if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "rebuild") {
  await stop();
  if (await build()) await start();
} else if (command === "status") out((await runningPid()) ? "running" : "stopped");
else {
  process.stderr.write("usage: bun desktop.ts start | stop | rebuild | status\n");
  process.exit(1);
}
