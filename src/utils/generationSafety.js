export const REFERENCE_IDENTITY_PROTECTION =
  'Use the uploaded reference image only for selected non-identity attributes. Do not copy, recreate, or resemble the person in the reference image. Preserve the AI character’s face, identity, skin texture, and facial structure from the character references. The generated subject must be our AI character, not the uploaded reference person.'

const UNSAFE_IDENTITY_PATTERNS = [
  /\b(copy|clone|recreate|duplicate|match)\b[^.]{0,80}\b(face|identity|likeness|person|body|facial structure|biometric)\b/gi,
  /\bmake (?:her|him|them|the subject) look like\b[^.]+/gi,
  /\bexact likeness\b/gi,
]

export function sanitizeReferenceAttributeText(value) {
  if (Array.isArray(value)) return value.map(sanitizeReferenceAttributeText).filter(Boolean)
  if (typeof value !== 'string') return value
  let next = value
  UNSAFE_IDENTITY_PATTERNS.forEach(re => { next = next.replace(re, '') })
  return next.replace(/\s{2,}/g, ' ').trim()
}

export function sanitizeReferenceAttributes(attrs = {}) {
  return Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, sanitizeReferenceAttributeText(value)]))
}

export function withReferenceIdentityProtection(prompt, hasReferenceImage) {
  if (!hasReferenceImage) return prompt
  return `${REFERENCE_IDENTITY_PROTECTION} ${prompt}`
}
