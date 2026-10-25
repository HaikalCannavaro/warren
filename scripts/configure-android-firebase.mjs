import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function configureAndroidFirebase(root, { required = false, encoded = '' } = {}) {
  const stable = path.join(root, 'src-tauri/firebase/google-services.json');
  if (encoded) {
    const data = Buffer.from(encoded, 'base64');
    const candidate = JSON.parse(data.toString('utf8'));
    if (!candidate?.client?.some(client => client.client_info?.android_client_info?.package_name === 'dev.harbor.workspace')) throw new Error('Firebase must contain Android package dev.harbor.workspace.');
    fs.mkdirSync(path.dirname(stable), { recursive: true }); fs.writeFileSync(stable, data, { mode: 0o600 });
  }
  if (!fs.existsSync(stable)) {
    if (required) throw new Error('Add src-tauri/firebase/google-services.json or set FIREBASE_GOOGLE_SERVICES_BASE64.');
    return { configured: false };
  }
  const config = JSON.parse(fs.readFileSync(stable, 'utf8'));
  if (!config.client?.some(client => client.client_info?.android_client_info?.package_name === 'dev.harbor.workspace')) throw new Error('Firebase must contain Android package dev.harbor.workspace.');
  const android = path.join(root, 'src-tauri/gen/android');
  const rootBuild = path.join(android, 'build.gradle.kts'), appBuild = path.join(android, 'app/build.gradle.kts');
  if (!fs.existsSync(appBuild) || !fs.existsSync(rootBuild)) throw new Error('Generate the Android project with tauri android init first.');
  let source = fs.readFileSync(rootBuild, 'utf8');
  if (!source.includes('com.google.gms.google-services')) {
    if (/plugins\s*\{/.test(source)) {
      source = source.replace(/plugins\s*\{/, 'plugins {\n    id("com.google.gms.google-services") version "4.4.2" apply false');
    } else if (/dependencies\s*\{/.test(source)) {
      source = source.replace(/dependencies\s*\{/, 'dependencies {\n        classpath("com.google.gms:google-services:4.4.2")');
    } else {
      source = 'buildscript {\n    repositories { google(); mavenCentral() }\n    dependencies { classpath("com.google.gms:google-services:4.4.2") }\n}\n' + source;
    }
    fs.writeFileSync(rootBuild, source);
  }
  source = fs.readFileSync(appBuild, 'utf8');
  if (!source.includes('com.google.gms.google-services')) fs.appendFileSync(appBuild, '\napply(plugin = "com.google.gms.google-services")\n');
  fs.copyFileSync(stable, path.join(android, 'app/google-services.json'));
  const manifest = path.join(android, 'app/src/main/AndroidManifest.xml');
  if (fs.existsSync(manifest)) {
    source = fs.readFileSync(manifest, 'utf8');
    source = /android:allowBackup="[^"]*"/.test(source) ? source.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"') : source.replace('<application', '<application android:allowBackup="false"');
    fs.writeFileSync(manifest, source);
  }
  return { configured: true, packageName: 'dev.harbor.workspace' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const result = configureAndroidFirebase(root, { required: process.argv.includes('--required'), encoded: process.env.FIREBASE_GOOGLE_SERVICES_BASE64 ?? '' });
    console.log(result.configured ? 'Firebase configured for dev.harbor.workspace.' : 'Firebase config absent: Android delivery is available; push notifications are disabled.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
