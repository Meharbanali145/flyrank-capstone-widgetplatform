// The runtime script, read once at boot. Its content hash IS its version: change the file
// -> new hash -> new URL -> browsers fetch fresh code; unchanged -> cached for a year.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../widget/runtime.js');
const source = readFileSync(file, 'utf8');
const hash = createHash('sha256').update(source).digest('hex').slice(0, 10);
export const runtimeBundle = { source, hash, etag: `"${hash}"` };
