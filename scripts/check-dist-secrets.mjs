// Fails if the built bundle contains anything but the public anon key.
// Run after `npm run build` (CI does this on every deploy): npm run check:secrets
//
//  - "service_role" anywhere                 -> fail
//  - an sb_secret_ key (prefix + key chars)  -> fail (the bare prefix appears in supabase-js's own code)
//  - any JWT whose payload role isn't "anon" -> fail
//  - sb_publishable_ keys and anon JWTs are reported and allowed.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'dist';
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(root);

const problems = [];
const allowed = [];
const decode = (part) => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (/service_role/i.test(text)) problems.push(`${file}: contains "service_role"`);
  for (const m of text.matchAll(/sb_secret_[A-Za-z0-9_-]{8,}/g)) problems.push(`${file}: secret key ${m[0].slice(0, 16)}…`);
  for (const m of text.matchAll(/sb_publishable_[A-Za-z0-9_-]{8,}/g)) allowed.push(`${file}: publishable key ${m[0].slice(0, 22)}…`);
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]*/g)) {
    const payload = decode(m[1]);
    if (payload?.role === 'anon') allowed.push(`${file}: anon JWT (ref ${payload.ref ?? '?'})`);
    else problems.push(`${file}: JWT with role ${JSON.stringify(payload?.role)} — not the anon key`);
  }
}

console.log(`Scanned ${files.length} files in ${root}/.`);
for (const a of allowed) console.log(`  ok   ${a}`);
for (const p of problems) console.log(`  FAIL ${p}`);
if (problems.length) process.exit(1);
console.log(allowed.length ? 'Only public keys found.' : 'No keys found (build without Supabase config).');
