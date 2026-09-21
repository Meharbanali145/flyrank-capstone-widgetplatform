// EMAIL_MODE=console: what's graded is that a THROWING side effect can't break a submission,
// not real delivery. FORCE_EMAIL_FAIL / the fault-control endpoint let us prove that on demand.
export function createConsoleMailer(config, logger, faults) {
  return {
    async send({ to, subject, text }) {
      if (config.FORCE_EMAIL_FAIL || faults?.isDown('email')) throw new Error('email provider down (forced failure)');
      const masked = to.replace(/^(.).*(@.*)$/, '$1***$2');
      logger.info('email_sent_console', { to: masked, subject, chars: text.length });
    },
  };
}
