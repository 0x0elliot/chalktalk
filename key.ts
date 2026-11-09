import { chmod, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { timingSafeEqual } from "node:crypto";

const HOME = `${homedir()}/.chalktalk`;
export const KEY_FILE = `${HOME}/key`;

export async function pageKey(): Promise<string> {
  const file = Bun.file(KEY_FILE);
  if (await file.exists()) {
    const saved = (await file.text()).trim();
    if (/^[a-f0-9]{64}$/.test(saved)) return saved;
  }
  await mkdir(HOME, { recursive: true });
  const fresh = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  await Bun.write(KEY_FILE, fresh);
  await chmod(KEY_FILE, 0o600);
  return fresh;
}

export function sameKey(given: string | null, key: string): boolean {
  if (!given || given.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(key));
}
