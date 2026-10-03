// TEMPORARY diagnostic (remove after investigation): are Netlify Blobs conditional writes
// ATOMIC under concurrency? 10 writes race with the same ETag – exactly 1 may succeed.
import { getStore } from '@netlify/blobs'

const PARALLEL = 10
const ROUNDS = 5

export default async () => {
  const store = getStore({ name: 'diagnostics', consistency: 'strong' })
  const rounds = []

  for (let round = 1; round <= ROUNDS; round++) {
    const key = `race-${crypto.randomUUID()}`
    await store.setJSON(key, { writer: 'initial' }, { onlyIfNew: true })
    const base = await store.getWithMetadata(key, { type: 'json' })

    const results = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) =>
        store.setJSON(key, { writer: `w${i}` }, { onlyIfMatch: base!.etag! }),
      ),
    )
    const winners = results.flatMap((r, i) => (r.modified ? [`w${i}`] : []))
    const final = (await store.get(key, { type: 'json' })) as { writer: string }

    rounds.push({ round, successfulWrites: winners.length, winners, finalValue: final.writer })
    await store.delete(key)
  }

  const atomic = rounds.every((r) => r.successfulWrites === 1)
  return Response.json(
    { verdict: atomic ? 'ATOMIC: exactly 1 winner every round' : 'NOT ATOMIC: several writers won the same ETag', rounds },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
