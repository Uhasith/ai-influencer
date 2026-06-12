import { storeImageAsset } from './assetStore.js'

export async function buildPhotoStudioGenerationRequest({
  prompt,
  count,
  aspectRatio,
  resolution,
  referenceImage,
  outfitImage,
  closeUpImage1,
  closeUpImage2,
  referenceStyleImage,
  propImages = [],
}) {
  const typedAssets = await Promise.all([
    referenceImage ? storeImageAsset(referenceImage, 'character') : null,
    outfitImage ? storeImageAsset(outfitImage, 'wardrobe') : null,
    closeUpImage1 ? storeImageAsset(closeUpImage1, 'closeup') : null,
    closeUpImage2 ? storeImageAsset(closeUpImage2, 'closeup') : null,
    referenceStyleImage ? storeImageAsset(referenceStyleImage, 'reference') : null,
    ...propImages.map(img => img ? storeImageAsset(img, 'prop') : null),
  ])

  return {
    prompt,
    count,
    aspectRatio,
    resolution,
    referenceImage,
    outfitImage,
    closeUpImage1,
    closeUpImage2,
    referenceStyleImage,
    propImages,
    assetIds: typedAssets.filter(Boolean).map(asset => asset.id),
  }
}
