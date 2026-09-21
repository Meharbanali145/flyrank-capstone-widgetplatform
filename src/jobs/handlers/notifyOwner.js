export const notifyOwner = (mailer, tenantRepo) => async ({ widgetId, submissionId, widgetTitle }) => {
  await mailer.send({ to: 'owner@example.com', subject: `New lead via "${widgetTitle}"`, text: `Submission ${submissionId} received on widget ${widgetId}.` });
};
