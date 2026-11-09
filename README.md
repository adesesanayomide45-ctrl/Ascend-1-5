# Ascend (MIDEON)

Social app: feed, videos, chat, pages, ranks and points.

## Files (all in the repo root)
App.js, index.js, adsService.js, adsService.web.js, webShims.js, firebaseConfig.js,
app.json, eas.json, package.json, icon.png, favicon.png,
adaptive-foreground.png, adaptive-background.png, adaptive-monochrome.png

## Build
- Test build (APK you can install): profile "preview"
- Google Play build (AAB): profile "production"

## Before you release (open App.js and search for these names)
- CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET: your free Cloudinary values (photo and video uploads)
- USE_TEST_ADS: change true to false once Google Play and AdMob approve the app
- BANNER_AD_UNIT_ID: paste your AdMob Banner ad unit ID
- PRIVACY_POLICY_URL: your privacy policy web address
- UPDATE_URL_FALLBACK: your Google Play link (for the update prompt)
- APP_VERSION: keep equal to "version" in app.json

## Firebase
Firestore rules must allow the collections the app uses. Update-prompt settings live in
Firestore: collection "config", document "app", text fields latestVersion, updateUrl, message.
