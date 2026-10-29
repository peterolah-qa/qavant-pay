// The ONE Netlify Function behind /api/*. Before: 8 functions = 8 separate cold starts and
// 8 separate database connections. Now one warm instance serves every screen with one pooled connection.
// netlify.toml rewrites /api/* → /.netlify/functions/api/:splat; this router maps the path to a route.
import { error } from '../lib/http.ts'
import { withTiming } from '../lib/timing.ts'
import account from '../routes/account.ts'
import authPin from '../routes/auth-pin.ts'
import dashboard from '../routes/dashboard.ts'
import demoSession from '../routes/demo-session.ts'
import health from '../routes/health.ts'
import ibanValidate from '../routes/iban-validate.ts'
import session from '../routes/session.ts'
import transactionDetail from '../routes/transaction-detail.ts'
import transactions from '../routes/transactions.ts'
import transfers from '../routes/transfers.ts'

type Route = (req: Request) => Response | Promise<Response>

const ROUTES: Record<string, Route> = {
  '/api/health': health,
  '/api/session': session,
  '/api/demo/session': demoSession, // kept for API clients and tests; the app uses /api/session
  '/api/auth/pin': authPin,
  '/api/account': account,
  '/api/dashboard': dashboard,
  '/api/transactions': transactions,
  '/api/transfers': transfers,
  '/api/iban/validate': ibanValidate,
}

/** The public path, whether Netlify passes the original URL (/api/x) or the rewritten one. */
export function apiPath(url: URL): string {
  const fn = '/.netlify/functions/api'
  const path = url.pathname.startsWith(fn) ? `/api${url.pathname.slice(fn.length)}` : url.pathname
  return path.length > 1 ? path.replace(/\/$/, '') : path
}

export function route(req: Request): Route | null {
  const path = apiPath(new URL(req.url))
  if (ROUTES[path]) return ROUTES[path]
  if (/^\/api\/transactions\/[^/]+$/.test(path)) return transactionDetail
  return null
}

const handler = (req: Request) =>
  route(req)?.(req) ?? error(404, 'NOT_FOUND', 'No such API endpoint')

export default withTiming(handler)
