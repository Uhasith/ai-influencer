import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPhotoStudioPrompt } from '../src/utils/photoStudioPrompt.js'
import { extractReferenceAttributes } from '../src/utils/referenceExtractor.js'
import { buildPhotoStudioGenerationRequest } from '../src/utils/generationRequestBuilder.js'

function installLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    clear: () => store.clear(),
  }
}

installLocalStorage()

const influencer = {
  age: 24,
  gender: 'Female',
  physicalDesc: 'AI character identity with warm brown skin and oval face',
}

const attrs = {
  location: 'small tiled cafe with a front window',
  timeOfDay: 'golden hour',
  lighting: 'warm amber light from camera-left',
  pose: 'seated with one elbow on the table, torso angled camera-left, head turned left, three-quarter face angle, gaze looking left out of frame',
  expression: 'calm half-smile',
  cameraAngle: 'slightly high handheld angle',
  framing: 'portrait crop from head to mid-thigh',
  outfitDescription: 'oversized denim jacket over a white tank',
  hairstyleDescription: 'loose low bun',
  composition: 'subject offset to the right with window glow behind',
  props: ['ceramic coffee cup'],
  photoStyle: 'natural iPhone candid color',
}

test('reference image mode can inherit only pose', () => {
  const prompt = buildPhotoStudioPrompt({
    influencer,
    outfitPreset: 'current',
    faceTag: '@image1',
    wardrobeTag: '@image2',
    referenceImageTag: '@image5',
    referenceAttributes: attrs,
    referenceAttributeSelection: { pose: true },
  })

  assert.match(prompt, /seated with one elbow on the table/)
  assert.match(prompt, /head turn, face angle, and gaze direction/)
  assert.match(prompt, /looking left/)
  assert.match(prompt, /not which way the head or face is turned/)
  assert.match(prompt, /Use @image5 only as a visual guide/)
  assert.doesNotMatch(prompt, /small tiled cafe/)
  assert.doesNotMatch(prompt, /warm amber light/)
  assert.match(prompt, /Do not copy, recreate, or resemble the person/)
})

test('reference image mode can inherit only location and lighting', () => {
  const prompt = buildPhotoStudioPrompt({
    influencer,
    outfitPreset: 'current',
    faceTag: '@image1',
    wardrobeTag: '@image2',
    referenceAttributes: attrs,
    referenceAttributeSelection: { location: true, lightingStyle: true },
  })

  assert.match(prompt, /small tiled cafe/)
  assert.match(prompt, /warm amber light/)
  assert.doesNotMatch(prompt, /seated with one elbow/)
})

test('reference outfit preserves AI identity and does not use wardrobe tag', () => {
  const prompt = buildPhotoStudioPrompt({
    influencer,
    outfitPreset: 'Wardrobe 1',
    faceTag: '@image1',
    wardrobeTag: null,
    referenceAttributes: attrs,
    referenceAttributeSelection: { outfit: true },
  })

  assert.match(prompt, /oversized denim jacket/)
  assert.match(prompt, /Preserve the AI character/)
  assert.doesNotMatch(prompt, /complete outfit from @image2/)
})

test('wardrobe image overrides reference outfit unless explicitly selected', () => {
  const prompt = buildPhotoStudioPrompt({
    influencer,
    outfitPreset: 'Wardrobe 1',
    faceTag: '@image1',
    wardrobeTag: '@image2',
    referenceAttributes: attrs,
    referenceAttributeSelection: { outfit: false },
  })

  assert.match(prompt, /complete outfit from @image2/)
  assert.doesNotMatch(prompt, /oversized denim jacket/)
})

test('typed hairstyle overrides reference hairstyle', () => {
  const prompt = buildPhotoStudioPrompt({
    influencer,
    outfitPreset: 'current',
    faceTag: '@image1',
    hairstyleText: 'sleek high ponytail',
    referenceAttributes: attrs,
    referenceAttributeSelection: { hairstyle: true },
  })

  assert.match(prompt, /sleek high ponytail/)
  assert.doesNotMatch(prompt, /loose low bun/)
})

test('cached extraction is reused for the same image', async () => {
  localStorage.clear()
  const dataUrl = 'data:image/jpeg;base64,abc123'
  const first = await extractReferenceAttributes(dataUrl, ['pose'], null)
  const second = await extractReferenceAttributes(dataUrl, ['pose'], null)

  assert.equal(first.cached, false)
  assert.equal(second.cached, true)
  assert.equal(first.hash, second.hash)
})

test('generation request stores asset ids and includes cached style reference image', async () => {
  localStorage.clear()
  const request = await buildPhotoStudioGenerationRequest({
    prompt: ['prompt'],
    count: 1,
    aspectRatio: '9:16',
    resolution: '4k',
    referenceImage: 'data:image/jpeg;base64,character',
    outfitImage: 'data:image/jpeg;base64,wardrobe',
    closeUpImage1: 'data:image/jpeg;base64,closeup1',
    closeUpImage2: 'data:image/jpeg;base64,closeup2',
    referenceStyleImage: 'data:image/jpeg;base64,style',
    propImages: [],
  })

  assert.equal(request.referenceImage, 'data:image/jpeg;base64,character')
  assert.equal(request.referenceStyleImage, 'data:image/jpeg;base64,style')
  assert.equal(request.assetIds.length, 5)
})
