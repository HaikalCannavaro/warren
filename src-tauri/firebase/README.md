Place the Android client file from Firebase Console here as `google-services.json`.
Register package `dev.harbor.workspace`. This file is ignored by Git.
Run `node scripts/configure-android-firebase.mjs --required` after Android init.
The script copies it into `src-tauri/gen/android/app/google-services.json` and enables the Google services Gradle plugin.
Server service-account credentials belong only on the VPS, never in this directory or APK.
