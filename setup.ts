import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const HOME = join(homedir(), ".chalktalk");
const FILE = join(HOME, "config.json");

const io = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (question: string, fallback = ""): Promise<string> => (await io.question(question)).trim() || fallback;

const saved = Bun.file(FILE);
const config: Record<string, unknown> = (await saved.exists()) ? ((await saved.json().catch(() => ({}))) as Record<string, unknown>) : {};

process.stdout.write(`
Chalktalk reads its answers aloud. Pick a voice:
  1. Kokoro: free, runs on this machine (about 450 MB, downloaded on first use)
  2. ElevenLabs: more natural, needs an API key (free plan: about 20,000 characters a month)
`);
const voice = await ask("Voice [1]: ", "1");

if (voice === "2") {
  config.voice = "elevenlabs";
  process.stdout.write(`
Where should Chalktalk read your ElevenLabs key from? It never stores the key itself.
  1. The ELEVENLABS_API_KEY environment variable
  2. ${process.platform === "darwin" ? "The macOS Keychain (you add it once with the security command below)" : "The macOS Keychain (Mac only)"}
  3. Google Cloud Secret Manager (read with gcloud each time)
  4. A command that prints it (1Password, Doppler, pass, …)
`);
  const from = await ask("Key source [1]: ", "1");
  if (from === "2") {
    const service = await ask("Keychain service name [elevenlabs-chalktalk]: ", "elevenlabs-chalktalk");
    config.elevenlabsKey = { from: "keychain", service };
    process.stdout.write(`\nAdd the key once (it asks for it, nothing is echoed):\n  security add-generic-password -a "$USER" -s ${service} -w\n`);
  } else if (from === "3") {
    const project = await ask("Google Cloud project: ");
    const secret = await ask("Secret name [ELEVENLABS_API_KEY]: ", "ELEVENLABS_API_KEY");
    config.elevenlabsKey = { from: "gcloud", project, secret };
  } else if (from === "4") {
    const command = await ask("Command that prints the key (for example: op read op://Private/ElevenLabs/credential): ");
    config.elevenlabsKey = { from: "command", command };
  } else {
    const name = await ask("Variable name [ELEVENLABS_API_KEY]: ", "ELEVENLABS_API_KEY");
    config.elevenlabsKey = { from: "env", name };
  }
  const voiceId = await ask("ElevenLabs voice id (Enter for the default): ");
  if (voiceId) config.elevenlabsVoice = voiceId;
} else {
  config.voice = "kokoro";
}

io.close();
await mkdir(HOME, { recursive: true });
await Bun.write(FILE, `${JSON.stringify(config, null, 2)}\n`);
process.stdout.write(`\nSaved ${FILE}. Change it any time with: bun setup.ts\nSwitch voices on the fly with the desktop app's voice hotkey.\n`);
