export function createDashboardService(submissionRepo, dashboardQueries) {
  return {
    async listSubmissions(tenantId, { widgetId, limit, before } = {}) {
      const rows = await submissionRepo.listByTenant(tenantId, { widgetId, limit, before });
      return {
        items: rows.map((r) => ({
          id: r.id, widgetId: r.widget_id, data: r.data, createdAt: r.created_at,
          geo: r.country ? { country: r.country, region: r.region, city: r.city, provider: r.geo_provider } : null,
        })),
        nextBefore: rows.length === limit ? rows[rows.length - 1].id : null,
      };
    },
    async stats(tenantId, days) {
      const s = await dashboardQueries.stats(tenantId, days);
      return {
        totals: { all: s.totals.total, last24h: s.totals.last_24h, last7d: s.totals.last_7d },
        perWidget: s.perWidget.map((w) => ({ widgetId: w.widget_id, title: w.title, submissions: w.submissions, lastSubmissionAt: w.last_submission_at })),
        overTime: { days, series: s.overTime },
        geo: s.geo.map((g) => ({ country: g.country, submissions: g.submissions })),
      };
    },
  };
}
