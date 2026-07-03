export const FOCAL_BUNDLE_ID = "com.nextcaicai.focal"
export const FOCAL_STAGING_BUNDLE_ID = `${FOCAL_BUNDLE_ID}.staging`

export const getFocalBundleId = (isStaging = false) =>
  isStaging ? FOCAL_STAGING_BUNDLE_ID : FOCAL_BUNDLE_ID

export const getFocalAppUserModelId = getFocalBundleId
