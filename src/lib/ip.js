import net from 'node:net';
const NON_PUBLIC = new net.BlockList();
const v4 = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]];
for (const [addr, prefix] of v4) NON_PUBLIC.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]]) NON_PUBLIC.addSubnet(addr, prefix, 'ipv6');
export function normalizeIp(ip) { if (typeof ip !== 'string') return null; let v = ip.trim(); if (v.toLowerCase().startsWith('::ffff:') && net.isIPv4(v.slice(7))) v = v.slice(7); return net.isIP(v) ? v : null; }
export function isPublicIp(ip) { const v = normalizeIp(ip); if (!v) return false; return !NON_PUBLIC.check(v, net.isIPv6(v) ? 'ipv6' : 'ipv4'); }
