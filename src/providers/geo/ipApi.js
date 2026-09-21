// ip-api.com: HTTP only, free tier = 45 req/min. Sends X-Rl (requests remaining) and X-Ttl
// (seconds until the window resets) on every response. If X-Rl hits 0 we must stop calling
// it until X-Ttl elapses, or risk an IP ban — so this adapter tracks that cooldown itself.
let cooldownUntil = 0;
export function createIpApiProvider({ url, timeoutMs, fetchImpl = fetch }) {
  return {
    name: 'ip-api',
    isOnCooldown: () => Date.now() < cooldownUntil,
    async lookup(ip) {
      if (Date.now() < cooldownUntil) throw new Error('ip-api: on cooldown (rate limit headers)');
      const res = await fetchImpl(`${url}/${encodeURIComponent(ip)}?fields=status,message,country,regionName,city`, { signal: AbortSignal.timeout(timeoutMs) });
      const rl = res.headers.get('x-rl'); const ttl = res.headers.get('x-ttl');
      if (rl !== null && Number(rl) <= 0) cooldownUntil = Date.now() + (Number(ttl || 60) * 1000);
      if (!res.ok) throw new Error(`ip-api: HTTP ${res.status}`);
      const body = await res.json();
      if (body.status !== 'success') throw new Error(`ip-api: ${body.message ?? 'lookup failed'}`);
      return { country: body.country, region: body.regionName ?? null, city: body.city ?? null };
    },
  };
}
export function _resetCooldownForTests() { cooldownUntil = 0; }
