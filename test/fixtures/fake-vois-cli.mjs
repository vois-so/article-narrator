// A fake vois-cli for the tests. It writes a silent WAV file for each
// "tts generate" call and adds one line to FAKE_LOG for each call.
//
// FAKE_ACCESS=subscription|metered   the plan in "status" (default: subscription)
// FAKE_CREDITS=<n>                   the credit balance
// FAKE_LIMIT=<n>                     refuse texts longer than n characters
// FAKE_STATUS_EXIT=<n>               "status" exits with this code
// FAKE_FAIL=<n>                      "tts generate" exits with this code
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const env = process.env;
const log = (line) => env.FAKE_LOG && appendFileSync(env.FAKE_LOG, `${line}\n`);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args[0] === 'status') {
  log('status');
  if (env.FAKE_STATUS_EXIT) {
    process.stderr.write(JSON.stringify({ error: { message: 'Vois Studio is not running' } }));
    process.exit(Number(env.FAKE_STATUS_EXIT));
  }
  const metered = env.FAKE_ACCESS === 'metered';
  process.stdout.write(JSON.stringify({
    status: 'running',
    cli_access_enabled: true,
    license_valid: true,
    access_mode: metered ? 'payg' : 'subscription',
    entitlement_tier: metered ? 'free' : 'pro',
    credit_balance: Number(env.FAKE_CREDITS || 0),
    purchase_url: 'https://vois.so/pricing#credits',
  }));
  process.exit(0);
}

if (args[0] === 'tts' && args[1] === 'generate') {
  const text = readFileSync(0, 'utf8');
  log(`generate ${JSON.stringify({ engine: flag('--engine'), voice: flag('--voice'), language: flag('--language'), chars: text.length, voisVoice: env.VOIS_VOICE || null })}`);
  if (env.FAKE_LIMIT && text.length > Number(env.FAKE_LIMIT)) {
    process.stderr.write(JSON.stringify({ error: { code: -32602, message: `text is ${text.length} characters; the Sonic lane accepts at most ${env.FAKE_LIMIT}` } }));
    process.exit(1);
  }
  if (env.FAKE_FAIL) {
    process.stderr.write(JSON.stringify({ error: { message: 'generation failed', data: { reason: 'test' } } }));
    process.exit(Number(env.FAKE_FAIL));
  }
  // 24 kHz mono 16-bit PCM: 0.01 seconds for each character.
  const samples = Math.max(2400, Math.round(text.length * 240));
  const data = Buffer.alloc(samples * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(24000, 24);
  head.writeUInt32LE(48000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  const out = flag('--output');
  writeFileSync(out, Buffer.concat([head, data]));
  process.stdout.write(JSON.stringify({ path: out, duration_secs: samples / 24000, engine_used: flag('--engine') }));
  process.exit(0);
}

process.stderr.write(`fake vois-cli: unknown command ${args.join(' ')}\n`);
process.exit(64);
