# Performance

## How to measure

Every API response carries a `Server-Timing` header (see DevTools → Network → Timing):

```
Server-Timing: db;dur=212.4;desc="3 queries", connect;dur=0.0, app;dur=231.0;desc="fn=us-east-2 db=eu-central-1 warm"
```

- `db`: time spent in SQL and the number of round trips to the database
- `connect`: time to open a database connection (TCP + TLS + auth), 0 when a pooled one is reused
- `app`: the whole function, plus where it ran (function region, database region, cold or warm instance)

A whole visitor journey, exactly as the web app makes it (app start → PIN → dashboard → history → detail → transfer):

```
BASE_URL=https://pay.qavant.dev RUNS=5 node scripts/latency.mjs
```

## Lab: reproduce production latency on a laptop

The functions talk to Postgres through a proxy that adds network delay.

```
docker compose up -d                                   # Postgres on :5433
DATABASE_URL=postgres://qp:qp@localhost:5433/qavant_test node scripts/migrate.mjs
node scripts/build-functions.mjs
node scripts/lab/delay-proxy.mjs 5434 5433 50 &       # +50 ms each way = 100 ms RTT
# api.mjs is the single function; fn-server.mjs serves it with the netlify.toml rewrite
DATABASE_URL=postgres://qp:qp@localhost:5434/qavant_test node scripts/lab/fn-server.mjs &
BASE_URL=http://localhost:8888 node scripts/latency.mjs
```

## Baseline (before any optimisation)

Lab, 5 fresh visitors each. The lab has no TLS, no database cold start and no function cold starts,
so production is slower still. The **number of SQL round trips** is exact either way.

| Step | SQL round trips | RTT 100 ms (Ohio ↔ Frankfurt) | RTT 2 ms (same region) |
| --- | ---: | ---: | ---: |
| create sandbox (`POST /api/demo/session`) | **16** | 1 641 ms | 55 ms |
| PIN (`POST /api/auth/pin`) | 7 | 721 ms | 30 ms |
| dashboard: account | 3 | 313 ms | 15 ms |
| dashboard: transactions | 3 | 312 ms | 16 ms |
| history | 3 | 311 ms | 13 ms |
| detail | 3 | 310 ms | 13 ms |
| transfer (`POST /api/transfers`) | 9 | 932 ms | 34 ms |
| **open app → dashboard** (no typing) | | **2 684 ms** | **102 ms** |

Why so many round trips:
- Every read loads the whole sandbox in 3 queries: the sandbox row, **all** transactions, **all** idempotency keys. `GET /api/account` needs only the first.
- Creating a sandbox inserts the 12 seed transactions **one by one** (12 round trips).
- `update()` sends `BEGIN`, `SET LOCAL lock_timeout`, the 3 loads, the writes and `COMMIT` as separate round trips.

Why each round trip is expensive in production:
- Netlify runs functions of new projects in **`cmh` (Ohio, AWS us-east-2)**. Choosing another region is a Pro plan feature.
- The Neon database is in **Frankfurt (eu-central-1)**, so every round trip crosses the Atlantic (≈ 100 ms).
- On top of that come a new connection after 10 s idle (`idleTimeoutMillis: 10_000`, ≈ 5 round trips with TLS + SCRAM auth), a separate cold start for each of the 8 functions, and Neon waking up after 5 min idle (scale to zero, free plan).

## Production, step by step

`scripts/latency.mjs` against https://pay.qavant.dev, 5 fresh visitors, p50.

| | baseline (#54) | + DB next to the functions | factor |
| --- | ---: | ---: | ---: |
| `Server-Timing` says | `fn=us-east-2 db=eu-central-1` | `fn=us-east-2 db=us-east-2` | |
| **open app → dashboard** | **3 486 ms** | **836 ms** | **4.2×** |
| first visitor (cold) | 5 789 ms | 3 249 ms | 1.8× |
| create sandbox | 1 809 ms | 179 ms | 10× |
| PIN | 932 ms | 193 ms | 4.8× |
| transfer | 1 128 ms | 170 ms | 6.6× |
| DB time, create sandbox | 1 647 ms | 18 ms | 91× |
| new DB connection (`connect`) | ≈ 620 ms | ≈ 70–110 ms | |

The second column is **one changed environment variable**: a new Neon project in AWS us-east-2 (Ohio),
the region where Netlify runs the functions. No code change, no cost.

What remained after that: every request still crosses from Europe to Ohio (≈ 160 ms, even `GET /api/health`
without a database), and each of the 8 functions had its own cold start and its own DB connection.

## Fewer requests, fewer round trips, one function

| | before | after |
| --- | --- | --- |
| Netlify Functions | 8 (8 cold starts, 8 connection pools) | **1** (`api`, internal router) |
| Requests until the dashboard | 4 in a row (`account` 401 → `demo/session` → `auth/pin` → `account` + `transactions`) | **2** (`session` → `auth/pin`, the PIN answer carries the dashboard data) |
| Returning visitor, PIN entered | 3 (`account` → `account` + `transactions`) | **1** (`session` answers with the dashboard) |
| SQL round trips: create sandbox | 16 | **1** (one statement: cleanup + sandbox + 12 rows via `json_to_recordset`) |
| SQL round trips: read (account, list, detail) | 3 | **1** (sandbox + transactions as JSON in one query) |
| SQL round trips: PIN / transfer | 7 / 9 | **4** (`BEGIN; SET; lock` · load · write · `COMMIT`) |
| Idle DB connection kept | 10 s | 4 min (+ one safe retry when the database closed it meanwhile) |
| `/assets/*` (hashed JS, CSS, fonts) | revalidated on every visit | `Cache-Control: immutable`, 1 year |

Lab, same conditions as the baseline (5 fresh visitors, p50):

| | RTT 100 ms before | RTT 100 ms after | RTT 2 ms before | RTT 2 ms after |
| --- | ---: | ---: | ---: | ---: |
| **open app → dashboard** | **2 684 ms** | **530 ms** | 102 ms | 24 ms |
| PIN | 721 ms | 415 ms | 30 ms | 16 ms |
| transfer | 932 ms | 415 ms | 34 ms | 17 ms |
| read (history, detail) | 310 ms | 106 ms | 13 ms | 7 ms |

## Production result (after #55)

`scripts/latency.mjs` against https://pay.qavant.dev, 5 fresh visitors, p50.

| | baseline (#54) | DB next to functions | **one function, 2 requests (#55)** | total |
| --- | ---: | ---: | ---: | ---: |
| **open app → dashboard** | 3 486 ms | 836 ms | **321 ms** | **10.9×** |
| first visitor (cold) | 5 789 ms | 3 249 ms | **824 ms** | **7×** |
| app start / create sandbox | 1 809 ms | 179 ms | **155 ms** | 11.7× |
| PIN | 932 ms | 193 ms | **166 ms** (+ dashboard data) | 5.6× |
| transfer | 1 128 ms | 170 ms | **202 ms** | 5.6× |
| DB time per request | up to 1 647 ms | up to 24 ms | **3–9 ms** | |
| new DB connection (`connect`) | ≈ 620 ms | ≈ 70–110 ms | **0 ms** (pooled, warm) | |
| SQL round trips create / PIN / transfer | 16 / 7 / 9 | 16 / 7 / 9 | **1 / 4 / 4** | |

What is left is physics: about 155 ms per request is the trip from Slovakia to Ohio and back
(`GET /api/health` without a database takes the same). Going further would need the functions in Europe
(a Netlify Pro feature) or edge functions with an HTTP database driver – a deliberate stop here.

## Guard rails – so it does not get slow again

- `tests/integration/perf-budget.test.ts` (CI, real Postgres): exact SQL round trips per endpoint
  (create 1 · read 1 · PIN 4 · transfer 4) and the reconnect behaviour. A count is deterministic, unlike a millisecond limit.
- `tests/api/app-start.spec.ts` (CI, deploy preview + Neon): the same budget measured on the real deployment.
- `tests/e2e/perf.spec.ts` (CI): API calls the web app makes – 1 until the PIN screen, 1 more until the dashboard.
