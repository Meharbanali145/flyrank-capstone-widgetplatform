const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SECRET_KEY = /authorization|api[_-]?key|password|secret|token|cookie/i;
function redact(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  return out;
}
export function createLogger(level = 'info') {
  const min = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl, msg, fields) => {
    if (LEVELS[lvl] < min) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...redact(fields) });
    (lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  };
  return { debug: (m, f) => emit('debug', m, f), info: (m, f) => emit('info', m, f), warn: (m, f) => emit('warn', m, f), error: (m, f) => emit('error', m, f) };
}
