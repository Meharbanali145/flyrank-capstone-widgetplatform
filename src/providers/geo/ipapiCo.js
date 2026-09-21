// ipapi.co: a rate-limit or other failure often comes back as HTTP 200 with {"error": true, "reason": "..."}
// rather than a non-2xx status, so isOk() cannot check the status code alone.
export function createIpapiCoProvider({ url, timeoutMs, fetchImpl = fetch }) {
  return {
    name: 'ipapi-co',
    async lookup(ip) {
      const res = await fetchImpl(`${url}/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`ipapi-co: HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`ipapi-co: ${body.reason ?? 'lookup failed'}`);
      if (!body.country_name) throw new Error('ipapi-co: no country in response');
      return { country: body.country_name, region: body.region ?? null, city: body.city ?? null };
    },
  };
}
