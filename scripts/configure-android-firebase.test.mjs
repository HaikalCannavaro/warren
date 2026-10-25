import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureAndroidFirebase } from './configure-android-firebase.mjs';

test('Firebase setup targets the generated app, validates package ID and remains idempotent',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'warren-firebase-'));
  try {
    fs.mkdirSync(path.join(root,'src-tauri/gen/android/app/src/main'),{recursive:true});
    fs.writeFileSync(path.join(root,'src-tauri/gen/android/build.gradle.kts'),'plugins {\n id("com.android.application") version "8.7.3" apply false\n}\n');
    fs.writeFileSync(path.join(root,'src-tauri/gen/android/app/build.gradle.kts'),'plugins { id("com.android.application") }\n');
    fs.writeFileSync(path.join(root,'src-tauri/gen/android/app/src/main/AndroidManifest.xml'),'<manifest><application android:allowBackup="true" /></manifest>');
    assert.throws(()=>configureAndroidFirebase(root,{required:true}),/google-services/);
    const encoded=Buffer.from(JSON.stringify({client:[{client_info:{android_client_info:{package_name:'dev.harbor.workspace'}}}]})).toString('base64');
    assert.equal(configureAndroidFirebase(root,{encoded,required:true}).configured,true);
    configureAndroidFirebase(root,{required:true});
    assert.equal((fs.readFileSync(path.join(root,'src-tauri/gen/android/app/build.gradle.kts'),'utf8').match(/google-services/g)??[]).length,1);
    assert.match(fs.readFileSync(path.join(root,'src-tauri/gen/android/app/src/main/AndroidManifest.xml'),'utf8'),/allowBackup="false"/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'src-tauri/gen/android/app/google-services.json'),'utf8')).client.length,1);
    assert.throws(()=>configureAndroidFirebase(root,{encoded:Buffer.from(JSON.stringify({client:[]})).toString('base64')}),/dev.harbor.workspace/);

    // Also test root build.gradle.kts with buildscript block (Tauri v2 format)
    fs.writeFileSync(path.join(root,'src-tauri/gen/android/build.gradle.kts'),'buildscript {\n repositories { google() }\n dependencies {\n classpath("com.android.tools.build:gradle:8.7.0")\n }\n}\n');
    configureAndroidFirebase(root,{required:true});
    const rootContent = fs.readFileSync(path.join(root,'src-tauri/gen/android/build.gradle.kts'),'utf8');
    assert.equal((rootContent.match(/buildscript\s*\{/g)??[]).length, 1);
    assert.match(rootContent, /google-services:4\.4\.2/);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(root).startsWith('warren-firebase-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
