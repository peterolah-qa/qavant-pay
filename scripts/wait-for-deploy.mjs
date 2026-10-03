// Polls <BASE_URL>/version.json until Netlify serves the commit we are testing.
// Prevents running tests against an older deploy (false green / false red).
const base = process.env.BASE_URL
const expected = process.env.EXPECTED_SHA
const attempts = Number(process.env.WAIT_ATTEMPTS ?? 60) // 60 × 10 s = 10 min

if (!base || !expected) {
  console.error('BASE_URL and EXPECTED_SHA are required')
  process.exit(2)
}

for (let i = 1; i <= attempts; i++) {
  let served = 'none'
  try {
    const res = await fetch(`${base}/version.json`, { cache: 'no-store' })
    if (res.ok) served = (await res.json()).commit
  } catch {
    // site not reachable yet
  }
  if (served === expected) {
    console.log(`✓ ${base} serves ${served}`)
    process.exit(0)
  }
  console.log(`[${i}/${attempts}] waiting for ${expected.slice(0, 7)} (serving: ${served.slice(0, 7)})`)
  await new Promise((r) => setTimeout(r, 10_000))
}
console.error(`✗ Timed out waiting for ${expected} on ${base}`)
process.exit(1)
