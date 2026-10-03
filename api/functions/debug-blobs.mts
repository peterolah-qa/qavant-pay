// TEMPORARY diagnostic (remove after investigation): does Netlify Blobs give us ETags
// and does it enforce conditional writes in this environment?
import { getStore } from '@netlify/blobs'

export default async () => {
  const store = getStore({ name: 'diagnostics', consistency: 'strong' })
  const key = `probe-${crypto.randomUUID()}`
  const steps: Record<string, unknown> = {}

  steps.createNew = await store.setJSON(key, { v: 1 }, { onlyIfNew: true })
  steps.createAgainMustFail = await store.setJSON(key, { v: 99 }, { onlyIfNew: true })

  const read = await store.getWithMetadata(key, { type: 'json' })
  steps.read = { data: read?.data, etag: read?.etag ?? 'MISSING' }

  if (read?.etag) {
    steps.writeWithFreshEtagMustSucceed = await store.setJSON(key, { v: 2 }, { onlyIfMatch: read.etag })
    steps.writeWithStaleEtagMustFail = await store.setJSON(key, { v: 3 }, { onlyIfMatch: read.etag })
  }
  steps.writeWithBogusEtagMustFail = await store.setJSON(key, { v: 4 }, { onlyIfMatch: '"bogus"' })
  steps.final = await store.get(key, { type: 'json' })

  const raw = process.env.NETLIFY_BLOBS_CONTEXT
  let contextKeys: string[] = []
  try {
    contextKeys = raw ? Object.keys(JSON.parse(Buffer.from(raw, 'base64').toString())) : []
  } catch {
    contextKeys = ['<unparseable>']
  }
  steps.environment = { hasBlobsContext: Boolean(raw), contextKeys } // key names only, never the token

  await store.delete(key)
  return Response.json(steps, { headers: { 'Cache-Control': 'no-store' } })
}
