// Deterministic stand-ins (GEO_MODE=mock, the default). Same shape as the live providers,
// no network — this is what makes the fallback-chain proof (probe 4) reproducible on demand.
export function createMockProvider(name, response) {
  return { name, async lookup() { return response; } };
}
export const mockIpApi = () => createMockProvider('ip-api', { country: 'United States', region: 'California', city: 'Mountain View' });
export const mockIpapiCo = () => createMockProvider('ipapi-co', { country: 'United States', region: 'California', city: 'Mountain View' });
