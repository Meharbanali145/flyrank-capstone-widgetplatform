import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export const generateApiKey = () => `fk_${randomBytes(24).toString('base64url')}`;
export const hashApiKey = (key) => createHash('sha256').update(key).digest('hex');
export function safeEqualHash(a, b) {
  const ba = Buffer.from(a, 'hex'); const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
