// GET /api/health – liveness check, first thing every test suite calls
import { withTiming } from '../lib/timing.ts'

const handler = async () =>
  Response.json({
    status: 'ok',
    service: 'qavant-pay-api',
    time: new Date().toISOString(),
  })

export default withTiming(handler)
