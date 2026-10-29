// GET /api/health – liveness check, first thing every test suite calls
const handler = async () =>
  Response.json({
    status: 'ok',
    service: 'qavant-pay-api',
    time: new Date().toISOString(),
  })

export default handler
