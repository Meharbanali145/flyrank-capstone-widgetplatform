import { createIpApiProvider } from './ipApi.js';
import { createIpapiCoProvider } from './ipapiCo.js';
import { mockIpApi, mockIpapiCo } from './mock.js';
import { isPublicIp } from '../../lib/ip.js';

export function createGeoChain(config, logger, faults) {
  const live = { 'ip-api': createIpApiProvider({ url: config.GEO_IP_API_URL, timeoutMs: config.GEO_TIMEOUT_MS }), 'ipapi-co': createIpapiCoProvider({ url: config.GEO_IPAPI_CO_URL, timeoutMs: config.GEO_TIMEOUT_MS }) };
  const mock = { 'ip-api': mockIpApi(), 'ipapi-co': mockIpapiCo() };
  const registry = config.GEO_MODE === 'live' ? live : mock;
  const chain = config.GEO_PROVIDER_ORDER.map((name) => registry[name]);

  // Contract: enrich() NEVER throws. Geo is enrichment, not a requirement — a submission
  // must succeed and be stored even when every provider in the chain is unavailable.
  return {
    async enrich(ip) {
      if (!isPublicIp(ip)) return null;
      for (const provider of chain) {
        try {
          if (faults?.isDown(provider.name)) throw new Error(`${provider.name}: forced down (test control)`);
          const result = await provider.lookup(ip);
          return { ...result, provider: provider.name };
        } catch (err) {
          logger.warn('geo_provider_failed', { provider: provider.name, error: err.message });
        }
      }
      logger.warn('geo_all_providers_failed', { ip });
      return null;
    },
  };
}
