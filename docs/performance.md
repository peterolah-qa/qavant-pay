# Performance

## How to measure

Every API response carries a `Server-Timing` header (see DevTools → Network → Timing):

```
Server-Timing: db;dur=212.4;desc="3 queries", connect;dur=0.0, app;dur=231.0;desc="fn=us-east-2 db=eu-central-1 warm"
```

- `db`: time spent in SQL and the number of round trips to the database
- `connect`: time to open a database connection (TCP + TLS + auth), 0 when a pooled one is reused
- `app`: the whole function, plus where it ran (function region, database region, cold or warm instance)

A whole visitor journey (open app → PIN → dashboard → history → detail → transfer), step by step:

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
