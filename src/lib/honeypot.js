// A hidden field real visitors never fill. Any non-empty value = a bot. We answer with a
// FAKE success (see submissionService) so the bot's script has no signal to adapt against.
export const HONEYPOT_FIELD = 'website';
export const honeypotTripped = (value) => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
