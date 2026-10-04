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

## Numbers (after PR #52)

| Layer | Tests |
| --- | --- |
| Unit + integration (Vitest, real Postgres in CI) | 191 |
| API (Playwright request) | 40 |
| E2E UI, mocked API (mobile) | 41 |
| E2E live against deploy preview + Postgres | 9 |
| Accessibility, axe + keyboard (mobile + desktop) | 18 |

Mutation tests so far: 12 deliberate bugs. 11 were caught right away; 1 survived (double-click guard) and led to a stronger test that now catches it.
