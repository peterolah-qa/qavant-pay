# Qavant Pay – engineering journal

Raw material for the final case study. One entry per finding: **what happened → how it was found → fix → lesson**, with the PR as evidence.
Updated with every step. Newest phase at the bottom.

---

## Phase 0 – skeleton, CI, deploy

### 0.1 Netlify Functions could not import the shared domain package
- **What:** deployed functions crashed with `Cannot find module …/packages/core/src/index.ts`. The monorepo package exports raw TypeScript; Netlify's bundler did not resolve it.
- **Fix:** pre-bundle every function with esbuild (`scripts/build-functions.mjs`) into `netlify/functions/*.mjs`. The function source lives in `api/functions/*.mts`.
- **Lesson:** "works locally" is not "works on the platform". The deploy preview plus a smoke test caught it before production.

### 0.2 The pipeline proved itself on day one: a deliberate bug was accidentally committed
- **What:** during "mutation testing lite" (break the code on purpose, check the tests catch it), the change `>` → `>=` in the daily-limit rule was committed by mistake.
- **Found by:** CI. The limit tests went red on the PR and branch protection blocked the merge.
- **Lesson:** this is exactly why tests are required checks. A human slip never reached `main`.

### 0.3 CI that silently tested the wrong thing
- **What:** one workflow step (the Postgres service in `pr.yml`) was skipped during setup, so CI ran the integration tests against the in-memory store and passed.
- **Fix:** the test setup prints which store it uses (`[tests] store: postgres (localhost:5432)` vs `store: memory`). The missing service was then visible at a glance.
- **Lesson:** a green check is only as good as the environment it ran in. Make the environment visible in the log.

---

## Phase 1 – domain + API

### 1.1 Lost updates and a bypassable PIN lock in Netlify Blobs (the big one)
- **What:** in the cloud, parallel transfers lost money updates (balance ended at €4,240.52 or €4,250.52 instead of the expected value), and 3 parallel wrong PINs did not trigger the lockout.
- **Found by:** parallel API tests (`Promise.all` of 10 requests) against the deploy preview. Locally, with one process, everything passed.
- **Diagnosis:** a dedicated diagnostic function fired 10 conditional writes with the same ETag. Expected 1 winner, observed **3–10 winners**. Conditional writes in Blobs were not atomic under concurrency.
- **Fix:** migrated to Postgres (Neon, Frankfurt): one transaction with `SELECT … FOR UPDATE`, `lock_timeout 5s`, `CHECK (balance_cents >= 0)`, idempotency keys as a primary key. The store is fail-closed: 503 if unavailable, 409 on a lock conflict, never a silent success.
- **Verified:** mutation test that removes `FOR UPDATE` → the race tests go red.
- **Lesson:** concurrency bugs do not show up in single-user testing. The guarantees of your storage layer must be tested, not assumed. (Issue #45)

### 1.2 Secrets handling
- **What:** during setup the database connection string was visible in screenshots twice.
- **Fix:** the password was rotated immediately both times. Secrets now live only in Netlify env and a gitignored `.env.local`, entered with a silent prompt (`read -rs`). Tests use a separate `TEST_DATABASE_URL`, never production.
- **Lesson:** treat any secret that has been on screen as compromised. Rotation is cheap, a leak is not.

---

## Phase 2 – UI + E2E

### 2.1 A test time bomb: two clocks (PR #49)
- **What:** an integration test passed on 3 Oct and failed on 4 Oct without any code change (`expected 401 to be 200`).
- **Root cause:** the test froze JavaScript time at a fixed date, so sandboxes were stored with `created_at = 2026-10-03`. The cleanup query used Postgres `now()`, i.e. **real** time. One day later, a parallel test file's cleanup deleted the "old" sandbox mid-test.
- **Fix:** freeze time at the *current* moment (`vi.useFakeTimers()` without a fixed date). The test only needs relative jumps of 30 s.
- **Lesson:** never mix a fake clock in the code with a real clock in the database. Fixed dates in tests are fine only when nothing outside JavaScript looks at the time.

### 2.2 Board hygiene: issues closed too early
- **What:** after the PIN screen PR, issues covering *all* screens (#29) and *all* P1 E2E tests (#32) were closed, although only part was done.
- **Fix:** reopened with a comment of what is left; partial work referenced with `Refs #N`.
- **Also learned:** `Closes #29 #32` closes only #29. Every issue needs its own keyword, and with squash merge GitHub reads the **PR description**, not the commit messages.
- **Lesson:** a board that says "done" when it is not is like a green test that verifies nothing.

### 2.3 Transfer screen: the test found a UI bug (PR #50)
- **What:** "Valid IBAN · Slovenská sporiteľňa" only appeared once the *whole* form was valid, because the bank name came from the full-form result.
- **Found by:** E2E test that types only the IBAN.
- **Fix:** validate the IBAN on its own for the status line.

### 2.4 A double-click test that did not test anything (PR #50)
- **What:** mutation test: removing the double-submit guard (`useRef`) → the double-click test still passed. React re-rendered the disabled button between Playwright's two clicks, so the guard was never exercised.
- **Fix:** a harder test, two clicks within **one JS task** (`button.click(); button.click()` in `evaluate`), like a fast double tap on a slow phone. Without the guard: 2 requests, test red. With the guard: 1 request.
- **Bonus:** even in the mutant, both requests carried the same `Idempotency-Key`, so the server would have booked the money once. Two independent layers of defence.
- **Lesson:** a passing test proves nothing until you have seen it fail for the right reason.

### 2.5 Idempotency tested where it actually matters (PR #50)
- **Scenario:** the bank books the transfer but the response is lost (connection reset). The user taps "Try again".
- **Test:** the mocked bank books the money and aborts the response. The retry must reuse the same `Idempotency-Key` → server replay → balance drops once (€4,255.52, not €4,230.52).
- **Also tested:** an *edited* transfer is a new transfer → new key.

### 2.6 History: race condition and 5 mutants (PR #51)
- **Race test:** a slow response for an old search ("netflix", 1.5 s) must not overwrite the result of the newer one ("bolt"). Solved with `AbortController` plus an "ignore aborted" guard.
- **Mutation testing:** removed stale-response protection, debounce, the id check before the API call, filters in the URL, and append-on-load-more. **All 5 were caught.**
- **Design choice:** the mocked API uses the real `queryTransactions` from core, so the mock cannot drift from the server. E2E tests the UI wiring; unit and API tests cover the logic.
- **Security:** UI-level IDOR test with two browser contexts (two sandboxes): visitor A opens visitor B's transaction id → 404 screen, no data.

---

## Phase 3 – quality

### 3.1 axe found a real contrast failure (PR #52)
- `--text-faint` (#6b7383) had **4.05:1** contrast; WCAG AA needs 4.5:1. Changed to #7d8596 (**5.2:1** on the background, 4.7:1 on cards).
- The PIN "empty dot" outline (a UI state graphic) had **1.9:1**; WCAG 1.4.11 needs 3:1 → **3.4:1**.
- Keyboard-only test: a whole transfer with Tab/Enter, focus moves to the result. Mutation testing: label unlinked, error not linked to its field, focus not moved, old colour restored → **all 4 caught**.

### 3.2 A green PR that did not contain what its title said (PR #52)
- **What:** the first push of the a11y PR contained only `package.json` + lockfile. The script that writes the tests had not run, CI was green because there was nothing new to test.
- **Found by:** `git diff --stat origin/main..feat/a11y` before merging.
- **Lesson:** look at the diff before you trust the checkmark.

### 3.3 Five design tokens missing in production since the PIN screen (PR #52)
- **What:** the diff showed `tokens.css` +11/−0 lines instead of a 1-line change. Production had been missing `--border`, `--text-faint`, `--warning`, `--warning-bg`, `--danger` since step 17. Error messages were not red and input borders had no colour. The browser silently ignores undefined CSS variables.
- **Why no test caught it:** functional tests check text and state, and those were correct. Only the *look* was wrong.
- **Lesson:** this is the textbook argument for visual regression tests (next step).

### 3.4 Preview ≠ production: Netlify injects its own UI (PR #52)
- **What:** a11y tests passed locally but failed on the deploy preview. Every violation was inside an `iframe` (`.mini-dock`, `.tool-group`), the **Netlify Drawer**, which is injected only into previews and loads with a delay (so it appeared only in later test states).
- **Fix:** `AxeBuilder(...).exclude('iframe')`. Qavant Pay has no iframes, so we audit only our own markup.
- **Lesson:** know everything that runs on the page you test. Third-party scripts differ between environments.

---

## Phase 3b – performance

### P.1 "It is extremely slow" → measure before touching anything
- **Symptom:** pay.qavant.dev felt very slow, especially the first visit.
- **Instead of guessing:** every API response now reports `Server-Timing` (SQL round trips, DB time, connect time, function and DB region). `scripts/latency.mjs` replays a real visitor journey and prints the numbers per step.
- **Lab reproduction:** a TCP proxy adds 100 ms RTT between the functions and a local Postgres, the same as Ohio ↔ Frankfurt. Result: **2.7 s from opening the app to the dashboard**, with the database next to the function **0.1 s**. Creating a sandbox needed **16 SQL round trips**, a transfer **9**. Details in `docs/performance.md`.
- **Root causes (found in docs and code, confirmed in the lab):**
  1. Netlify runs functions in Ohio by default (region choice is Pro-only), while the Neon database is in Frankfurt. Every SQL round trip crosses the Atlantic.
  2. Too many round trips per request: each read loads the whole sandbox, seed rows are inserted one by one, and transaction control statements each cost a separate trip.
  3. Connections were closed after 10 s idle, 8 separate functions each have their own cold start, and Neon scales to zero after 5 min.
- **Side finding:** the function bundles could not run in plain Node (`Dynamic require of "events"`). They only worked because Netlify re-bundles them. Fixed with a `createRequire` banner, so the lab can run the exact production bundle.
- **Lesson:** "slow" is not a bug report, a number is. Instrument first, reproduce second, fix third, and keep the "before" numbers for the "after".

### P.2 The biggest win was one environment variable
- **Change:** a new Neon project in **AWS us-east-2**, where Netlify runs the functions, and a new `DATABASE_URL`. No code.
- **Result in production:** dashboard p50 **3 486 → 836 ms (4.2×)**, sandbox creation 1 809 → 179 ms, DB time 1 647 → 18 ms. `Server-Timing` now says `fn=us-east-2 db=us-east-2`.
- **Process slip:** the new connection string was visible in a screenshot during setup, so the password was rotated straight away. Same lesson as 1.2: secrets never go on screen.
- **Lesson:** measure where the time goes before optimising code. Here the first 4× came from geography, not from the code.

### P.3 An optimisation that broke concurrency, caught by an existing test
- **Change:** to save a round trip, the row lock (`FOR UPDATE`) was folded into the query that loads the sandbox and its transactions as JSON.
- **Found by:** the integration test "5 PARALLEL transfers" (real Postgres) failed with `duplicate key … transactions_pkey`. Two parallel transfers computed the same next transaction id.
- **Root cause:** under READ COMMITTED a statement keeps the snapshot it started with. After waiting for the lock, Postgres re-reads the locked **row**, but the statement's sub-selects still see the **old snapshot**, without the transaction the other request had just committed.
- **Fix:** the lock is its own statement (`BEGIN; SET LOCAL lock_timeout; SELECT … FOR UPDATE` in one simple-protocol round trip), and the load runs as the next statement with a fresh snapshot. It is still 4 round trips instead of 9.
- **Mutation tests:** no lock at all → 2 tests red; lock folded back into the load → 1 test red.
- **Lesson:** the parallel tests from phase 1 (written for the Blobs race) paid for themselves again. Performance work without concurrency tests is gambling.

### P.4 One function, two requests, a budget in CI
- **8 functions → 1** (`api.mts` with an internal router): one cold start and one warm connection pool instead of 8.
- **App start 4 requests → 2:** `POST /api/session` answers "PIN or app" and creates the sandbox if needed, and the PIN answer carries the dashboard data. The copy is used once and only for 5 s. A test proves that coming back after a transfer shows fresh data, not the login copy.
- **SQL round trips:** create 16 → 1 (one statement with `json_to_recordset`), read 3 → 1, PIN 7 → 4, transfer 9 → 4.
- **Connection reuse:** idle connections are kept 4 min instead of 10 s, with a single retry when the database closed the connection while the instance was frozen. The retry happens **only if nothing reached the database yet**, so it can never write twice. Both rules have their own test.
- **A test that did not test:** the first reconnect test killed the connection from the database side and passed even without the retry. The pool notices a server-side kill immediately, while a frozen Netlify instance does not. It was replaced by a deterministic test where the first pooled connection behaves like a dead one, and the mutant without retry now fails.
- **Budgets in CI:** exact SQL round trips per endpoint (integration + real deploy) and API calls per screen (E2E). Numbers, not milliseconds, so they cannot be flaky.
- **Lab:** dashboard at 100 ms RTT **2 684 → 530 ms**.

### P.5 A warning nobody asked about was a memory leak
- **What:** the local test run printed `MaxListenersExceededWarning: 11 error listeners added to [BoundPool]`. All tests were green.
- **Root cause:** `pool.on('error', …)` was registered on every `getPool()` call, i.e. on **every request**, instead of once when the pool is created. A warm Netlify instance serving thousands of requests would have collected thousands of listeners.
- **Fix:** register it once. The regression test sends 25 requests through one instance and asserts exactly 1 error listener and at most 3 connections. A mutant with the old line → red.
- **Lesson:** warnings in test output are findings. A green run with noise in the log is not a clean run.

### P.6 Day log – 29 Oct 2026 (performance day)
| Time | What happened | Evidence |
| --- | --- | --- |
| morning | Complaint: "extremely slow". Instead of guessing: `Server-Timing` on every response, latency script, lab with a delay proxy | PR #54 |
| 08:40 | Production baseline confirmed the lab: `fn=us-east-2 db=eu-central-1`, dashboard **3 486 ms**, cold **5 789 ms** | `scripts/latency.mjs` |
| 10:30 | New Neon project in AWS us-east-2 → dashboard **836 ms** (warm run 687 ms). New password rotated after a screenshot leak | P.2 |
| 11:00 | One API function, 2 requests to the dashboard, SQL 16→1 / 9→4. The parallel test caught a snapshot race I introduced (P.3), and a reconnect test turned out not to test anything (P.4) | PR #55 |
| 12:50 | Merged #55. Production: dashboard **321 ms** (from 3 486 ms, **10.9×**), cold 824 ms (from 5 789 ms), DB 3–9 ms per request, no new connections | `docs/performance.md` |
| 12:55 | A `MaxListenersExceededWarning` in the green test log turned out to be a listener leak per request | P.5, this PR |

What is left is ≈ 155 ms per request of network between Slovakia and Ohio, i.e. physics, not code. A deliberate stop.

Tests at the end of the day: 199 unit + integration (real Postgres), 71 E2E (mobile + desktop, mocked + live), API suite against every deploy preview.
Mutation tests today: 9 deliberate bugs, 8 caught at once; 1 survived (the reconnect test) and led to a deterministic test that now catches it.

---

## Phase 5 – redesign "Obsidian Cyber-Fintech"

### R.0 Design review before a single line of code (#61)
- **Input:** 4 Stitch screens + DESIGN.md + PRD v1.0.
- **Reviewed as QA**, not just copied: contrast of every token pair (all ≥ 4.5:1), WCAG 2.2 (the swipe-only control fails 2.5.7), third-party requests (fonts, icons, Tailwind, photos all from CDNs), trademarks (Lidl logo), and **claims the app does not keep** ("quantum", "biometric", "encrypted").
- **Decision that matters most:** the security claims become real features (R8: passkeys, AES-256-GCM, hash-chained ledger) instead of decoration. A security-minded reviewer would otherwise read them as dishonest.
- **First feedback on real screens:** the lime accent of the design was "annoying". Instead of arguing about adjectives, 4 palettes were rendered on the same layout; Ion Violet (violet + mint) was picked in one look. The palette lives in one tokens file, so the change touched no component.
- **R0 delivered:** Ion Violet tokens with subtle cyber details, new favicon + home-screen icon, self-hosted fonts, inline icons, header + floating bottom navigation, honest "in development" tabs. All 62 existing tests stayed green and 6 new ones were added (navigation, keyboard, axe, **no third-party request**, favicon). 3 mutants: removed `aria-current`, Google Fonts link back, icon-only tabs. All 3 caught.

### R.1 The Netlify Drawer again – this time it blocked clicks (PR #71)
- **Symptom:** all 68 E2E tests green locally, then 4 shell tests red on the deploy preview: `locator.click: Test timeout` – the element was "visible, enabled and stable", yet the click never landed.
- **Root cause (from the CI annotation):** `<iframe title="Netlify Drawer">` intercepted pointer events. Netlify injects its review drawer into **deploy previews only**, floating over the bottom of the page – exactly where the new bottom navigation lives. The third-party test failed for the same reason: the drawer loads from netlify.com.
- **Reproduced before fixing:** a local "fake preview" (`deploy-preview-71--…` host mapped to a local server that injects a drawer iframe like Netlify does) – **9 tests red without the fix, all green with it.** Side trap: `netlify.app` is on Chrome's HSTS preload list, so the fake host must not end in `netlify.app`.
- **Fix in the test infrastructure, not in the app:** on deploy previews the `page` fixture blocks Netlify's tooling hosts before the page loads, plus a CSS safety net by the iframe title. The exception is narrow and unit-tested (look-alike hosts and real third parties such as Google Fonts stay visible), and the run against **production** after every merge still allows no third-party request at all.
- **Lesson:** "preview ≠ production" (3.4) came back in a new shape. Environment-specific overlays are part of the system under test – model them explicitly instead of retrying until green.

### R.2 `npm install` said "1 high severity vulnerability" – read it
- **What:** `vite` 8.3.0–8.3.2 bundles `launch-editor` with command-execution advisories (GHSA-r825-w8mm-5pxw and two more). Dev server only – not in the production bundle – but it was on `main` already.
- **Fix:** `vite` 8.3.5, `npm audit` → 0 vulnerabilities. Same lesson as P.5: warnings in a green run are findings.

### R.3 The fix from R.1 was green in the lab and red on the real preview
- **What happened:** PR #71 was merged with the R.1 fix and production went green (121 tests). The deploy-preview run of the same commit then failed with **the same 4 tests**, and the Netlify Drawer still intercepted the clicks.
- **Why the lab lied:** my fake drawer was a plain `<iframe>` that loaded from netlify.com, so blocking netlify.com and a page stylesheet were enough. The CI log showed something different. The drawer sits in a host `<div data-netlify-deploy-id …>`, it is injected from **the app's own origin**, and its iframe lives in a **shadow root**. Blocking requests leaves the iframe element in place (it just stays empty but still covers the nav), and page CSS cannot reach into a shadow root. The simulation matched the *symptom* and not the *mechanism*.
- **Lab fixed first:** `scripts/lab/fake-preview-server.mjs` now injects the drawer like the CI log shows it (same origin, host div, shadow root, `!important` inline styles), with `SHADOW=closed|open|none`. With the R.1 fix it fails the **same 4 tests as CI**. Only after that was the new fix written.
- **Fix:** an init script that runs before any page script, watches the DOM with a `MutationObserver` and removes the drawer (`[data-netlify-deploy-id]`, `iframe[title="Netlify Drawer"]`). It watches shadow roots too, including closed ones, by wrapping `attachShadow` before the drawer code runs.
- **Proof, 3 shapes × control/fix:** control (fix inactive) = 4 real failures in every shape; with the fix = 0 real failures (the remaining one is the lab-only DNS artifact of the `request` fixture). The final proof is the preview run of the PR that ships it.
- **Lesson:** a reproduction is only evidence when it fails **the same way** as the real thing. Check the mechanism in the real log, not just the symptom.
- **The lab had its own bug, and the control run caught it.** While making the drawer shape configurable, a missing semicolon (`const SHADOW = '…'` followed by `(() => …)()` on the next line) turned the injection into "call a string", so the fake drawer silently never appeared and every run would have been green. Every lab run is therefore paired with a **control run** where the fix is inactive, and the control must fail. A lab that cannot fail proves nothing, the same rule as for tests (2.4).

### R.4 Merged without a green check
- **What happened:** `git push` followed immediately by `gh pr checks 71 --watch` printed "no checks reported". GitHub had not registered the checks for the new commit yet, and `gh pr merge` on the next line went through. The base-branch policy blocks a merge only when a check has **already failed**, and here none existed yet.
- **Damage:** none for users (production run green), but `main` contained a test fix that did not work on previews. Every following PR would have been red.
- **Process fix:** commands are chained with `&&` (merge runs only after a successful watch), with a short wait before the watch. Recommended next: make *Lint · typecheck · build* and *Playwright vs Netlify deploy* **required status checks** on `main`. Then a merge without checks is impossible, and `gh pr merge --auto` can be used.
- **Lesson:** "no checks" is not "green checks". Automate the gate instead of relying on the order of terminal lines.

### R.5 The repository had no README
- **What:** after 70 issues and a deployed product, the repo's front page was empty. For a portfolio project that is the first thing a reviewer sees, and it said nothing.
- **Done:** `README.md` written from what actually exists, every number checked against the code and the last CI run. It covers a live demo + PIN, real screenshots of the current app (taken by Playwright from the mocked bank, not the Stitch mockups), architecture and CI diagrams (Mermaid, render-checked), the test strategy per layer with counts, findings linked to this journal, performance before/after, security & privacy, business rules with their IDs, local setup and the roadmap.
- **Honesty checks while writing:** the local commands were corrected after reading the config. `npm run dev` proxies `/api` to the deployed API, and the API and live suites skip on localhost. Planned security features are labelled as planned.
- Covers part of #38 (demo, CI links, diagram); the GIF and a published report come with #36.

### R.6 Day log – 29 Oct 2026, afternoon (redesign foundation)
| Time | What happened | Evidence |
| --- | --- | --- |
| 13:30 | R0 complete locally: 199 + 68 tests green. `npm audit` showed 1 high → vite 8.3.5 | R.2 |
| 13:40 | PR #71: 4 shell tests red on the preview, Netlify Drawer over the bottom nav | R.1 |
| 14:10 | First fix (block netlify.com + CSS). Merged before its checks had started | R.1, R.4 |
| 14:15 | Production run green (121). Preview run of the same commit red again: the drawer is same-origin and in a shadow root | R.3 |
| 14:45 | Lab rebuilt to fail like CI; DOM-level fix; 3 shapes × control/fix proven | R.3 |
| 15:05 | README with real screenshots, diagrams and verified numbers | R.5 |

---

## Numbers (after R0, 29 Oct 2026)

| Layer | Tests |
| --- | --- |
| Unit (Vitest) | 160 |
| Integration, real Postgres (Vitest) | 46 |
| API (Playwright request, preview + production) | 44 |
| E2E UI, mocked API (mobile) | 50 |
| E2E live against deploy preview + Postgres | 9 |
| Accessibility, axe + keyboard (mobile + desktop) | 18 |
| **Total** | **327** |

Mutation tests so far: **24 deliberate bugs**. 22 caught right away; 2 survived (double-click guard 2.4, reconnect retry P.4) and both led to stronger tests that now catch them.
Lab reproductions: every one is paired with a control run that must fail (R.3).


## Numbers (after PR #52)

| Layer | Tests |
| --- | --- |
| Unit + integration (Vitest, real Postgres in CI) | 191 |
| API (Playwright request) | 40 |
| E2E UI, mocked API (mobile) | 41 |
| E2E live against deploy preview + Postgres | 9 |
| Accessibility, axe + keyboard (mobile + desktop) | 18 |

Mutation tests so far: 12 deliberate bugs. 11 were caught right away; 1 survived (double-click guard) and led to a stronger test that now catches it.
