import { hashDataUrl } from './assetStore.js'
import { sanitizeReferenceAttributes } from './generationSafety.js'

export const REFERENCE_EXTRACTION_VERSION = 'reference-style-scene-v1'

export const REFERENCE_ATTRIBUTE_KEYS = [
  'location',
  'timeOfDay',
  'lighting',
  'pose',
  'expression',
  'cameraAngle',
  'framing',
  'outfitDescription',
  'hairstyleDescription',
  'composition',
  'props',
  'photoStyle',
]

const CACHE_KEY = 'ps_reference_extractions_v1'

function emptyAttributes() {
  return {
    location: '',
    timeOfDay: '',
    lighting: '',
    pose: '',
    expression: '',
    cameraAngle: '',
    framing: '',
    outfitDescription: '',
    hairstyleDescription: '',
    composition: '',
    props: [],
    photoStyle: '',
    negativeIdentityInstructions: [
      'Do not copy the person in the reference image',
      'Do not reproduce their face or identity',
      'Use only the AI character identity from the character reference',
    ],
  }
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') }
  catch { return {} }
}

function writeCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) }
  catch {}
}

function parseJsonObject(text) {
  const attempts = [
    () => JSON.parse(text),
    () => JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()),
    () => { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('no JSON') },
  ]
  for (const attempt of attempts) {
    try { return attempt() } catch {}
  }
  throw new Error('Reference extraction response was not valid JSON')
}

function normalizeAttributes(json) {
  const base = emptyAttributes()
  const merged = { ...base, ...sanitizeReferenceAttributes(json || {}) }
  merged.props = Array.isArray(merged.props)
    ? merged.props.filter(Boolean).map(String)
    : (merged.props ? [String(merged.props)] : [])
  merged.negativeIdentityInstructions = base.negativeIdentityInstructions
  return merged
}

export async function extractReferenceAttributes(referenceImage, allowedAttributes = REFERENCE_ATTRIBUTE_KEYS, apiKey = null) {
  if (!referenceImage) return null
  const hash = await hashDataUrl(referenceImage)
  const cacheMode = apiKey ? 'claude' : 'fallback'
  const cacheId = `${REFERENCE_EXTRACTION_VERSION}:${cacheMode}:${hash}`
  const cache = readCache()
  if (cache[cacheId]) return { ...cache[cacheId], cached: true }

  let attrs = emptyAttributes()
  if (apiKey) {
    const [header, base64] = referenceImage.split(',')
    const mediaType = header?.match(/:(.*?);/)?.[1] || 'image/jpeg'
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: 'You extract reusable photo-generation attributes from images. Never identify or describe the person as an identity. Output JSON only.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `Extract only non-identity attributes for an AI photo generator. Allowed attributes: ${allowedAttributes.join(', ')}.

Do not describe or preserve the person's face, identity, body identity, unique biometric traits, private identifying traits, tattoos, or logos. If visible outfit or hairstyle is requested, describe it as style/clothing/hair only, not as belonging to the person.

For "pose", include the non-identity geometry needed to recreate the direction accurately: body position, torso angle, shoulder angle, head turn, face angle, gaze direction, whether the face is front/three-quarter/profile/away, and whether the person is looking left/right/up/down relative to camera. Do not describe facial identity.

Return a JSON object with exactly these keys:
location, timeOfDay, lighting, pose, expression, cameraAngle, framing, outfitDescription, hairstyleDescription, composition, props, photoStyle, negativeIdentityInstructions.

props must be an array of visible non-identifying props. negativeIdentityInstructions must include instructions not to copy the person, face, or identity.` },
          ],
        }],
      }),
    })
    if (!res.ok) throw new Error(`Reference extraction failed (${res.status})`)
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    attrs = normalizeAttributes(parseJsonObject(data.content?.[0]?.text?.trim() || '{}'))
  }

  const record = { ...attrs, hash, version: REFERENCE_EXTRACTION_VERSION, extractedAt: Date.now(), cached: false }
  cache[cacheId] = record
  writeCache(cache)
  return record
}

export function pickSelectedReferenceAttributes(attrs, selection = {}) {
  if (!attrs) return {}
  const selected = {}
  if (selection.location) selected.location = attrs.location
  if (selection.timeOfDay) selected.timeOfDay = attrs.timeOfDay
  if (selection.pose) selected.pose = attrs.pose
  if (selection.expression) selected.expression = attrs.expression
  if (selection.outfit) selected.outfitDescription = attrs.outfitDescription
  if (selection.hairstyle) selected.hairstyleDescription = attrs.hairstyleDescription
  if (selection.cameraFraming) {
    selected.cameraAngle = attrs.cameraAngle
    selected.framing = attrs.framing
    selected.composition = attrs.composition
  }
  if (selection.lightingStyle) {
    selected.lighting = attrs.lighting
    selected.photoStyle = attrs.photoStyle
    if (!selected.timeOfDay) selected.timeOfDay = attrs.timeOfDay
  }
  return sanitizeReferenceAttributes(selected)
}
