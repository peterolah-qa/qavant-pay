// GET /api/health – liveness check, first thing every test suite calls
export default async () =>
  Response.json({
    status: 'ok',
    service: 'qavant-pay-api',
    time: new Date().toISOString(),
  })
