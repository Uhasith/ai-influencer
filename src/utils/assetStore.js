const ASSET_STORE_KEY = 'ai_photo_asset_store_v1'

function readStore() {
  try { return JSON.parse(localStorage.getItem(ASSET_STORE_KEY) || '{}') }
  catch { return {} }
}

function writeStore(store) {
  try { localStorage.setItem(ASSET_STORE_KEY, JSON.stringify(store)) }
  catch { /* quota full; callers can continue with in-memory data */ }
}

function dataUrlPayload(dataUrl) {
  return typeof dataUrl === 'string' ? (dataUrl.split(',')[1] || dataUrl) : ''
}

function fallbackHash(input) {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i)
    h1 = Math.imul(h1, 0x01000193)
    h2 = Math.imul(h2 ^ input.charCodeAt(i), 0x85ebca6b)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

export async function hashDataUrl(dataUrl) {
  const payload = dataUrlPayload(dataUrl)
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    try {
      const bytes = new TextEncoder().encode(payload)
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
    } catch {}
  }
  return fallbackHash(payload)
}

export async function storeImageAsset(dataUrl, type = 'reference') {
  if (!dataUrl) return null
  const hash = await hashDataUrl(dataUrl)
  const store = readStore()
  const existing = store[hash] || {}
  const asset = {
    id: existing.id || `${type}_${hash.slice(0, 16)}`,
    hash,
    type: existing.type || type,
    dataUrl,
    providerRefs: existing.providerRefs || {},
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now(),
  }
  store[hash] = asset
  writeStore(store)
  return asset
}

export async function getImageAsset(dataUrl) {
  if (!dataUrl) return null
  const hash = await hashDataUrl(dataUrl)
  return readStore()[hash] || null
}

export function updateImageAssetProviderRef(hash, provider, value) {
  if (!hash || !provider || !value) return
  const store = readStore()
  const asset = store[hash]
  if (!asset) return
  asset.providerRefs = { ...(asset.providerRefs || {}), [provider]: value }
  asset.updatedAt = Date.now()
  store[hash] = asset
  writeStore(store)
}
