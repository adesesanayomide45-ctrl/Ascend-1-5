# Ascend (MIDEON)

## Run as a website (for testing)
    npm install
    npx expo install react-dom react-native-web @expo/metro-runtime
    npx expo start --web

Build a hostable site:  npx expo export --platform web   (output in dist/)
On web, ads are stubbed and push notifications are skipped.

## Build the Android APK
    npm install -g eas-cli
    eas login
    eas init
    eas build -p android --profile production

Before a real release:
- app.json: replace the Google TEST AdMob app IDs with yours (ca-app-pub-...~...).
- Push notifications: add google-services.json and run `eas init` (adds the project ID).
- Expo Go / Snack cannot run this app (native ads library); use an EAS build.

## No internet
The app shows a "No internet connection" screen with a Try again button, checks again
every 8 seconds, and signs you back in automatically when the connection returns.
