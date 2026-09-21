export const sendConfirmationEmail = (mailer) => async ({ to, widgetTitle }) => {
  await mailer.send({ to, subject: `Thanks for contacting us (${widgetTitle})`, text: 'We received your submission and will be in touch.' });
};
