import test from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseConfig, releaseMetadata, versionCode, validateRepository } from './release-lib.mjs';

const publicKey=Buffer.from('untrusted comment: test public key\n'+Buffer.concat([Buffer.from('Ed'),Buffer.alloc(40,1)]).toString('base64')+'\n').toString('base64');

test('release config pins one repository and enables signed version checks',()=>{
  const config=createReleaseConfig('example/warren',publicKey,'0.2.1');
  assert.equal(config.plugins.updater.requireSignedVersion,true);
  assert.equal(config.plugins.updater.allowDowngrades,false);
  assert.equal(config.bundle.android.versionCode,2001);
  assert.deepEqual(config.plugins.updater.endpoints,['https://github.com/example/warren/releases/latest/download/latest.json']);
  assert.equal(config.plugins['harbor-android-updater'].endpoint,'https://github.com/example/warren/releases/latest/download/android.json');
});
test('invalid or URL-shaped repositories never become release endpoints',()=>{
  for(const repo of ['https://github.com/example/warren','../warren','a/b/c','a/b?token=secret','a/b#x','a/..','a/b c'])assert.throws(()=>validateRepository(repo));
});
test('private or malformed signing material cannot be baked into public config',()=>{
  for(const key of ['', 'PRIVATE KEY', Buffer.from('untrusted comment: private key\nsecret').toString('base64')])assert.throws(()=>createReleaseConfig('a/b',key,'0.2.1'));
});
test('version code increases with stable version and rejects collisions or prereleases',()=>{
  assert.ok(versionCode('0.2.2')>versionCode('0.2.1'));
  assert.ok(versionCode('1.0.0')>versionCode('0.999.999'));
  for(const version of ['v0.2.0','0.2.0-beta.1','0.1000.0','0.1.1000','01.2.3','9999.0.0','0.0.0'])assert.throws(()=>versionCode(version));
});
test('manifest binds Android bytes, package, immutable version URL and versionCode',()=>{
  const result=releaseMetadata({repository:'example/warren',version:'0.2.1',notes:'New features',publishedAt:'2026-10-22T00:00:00Z',android:{size:1234,sha256:'a'.repeat(64)}});
  assert.deepEqual(result.android,{schemaVersion:1,packageName:'dev.harbor.workspace',version:'0.2.1',versionCode:2001,url:'https://github.com/example/warren/releases/download/v0.2.1/Warren-0.2.1-android.apk',sha256:'a'.repeat(64),size:1234,notes:'New features',publishedAt:'2026-10-22T00:00:00Z'});
});
test('Windows manifest embeds signature contents and immutable download URL',()=>{
  const result=releaseMetadata({repository:'example/warren',version:'0.2.1',notes:'Update',publishedAt:'2026-10-22T00:00:00Z',windows:{signature:'test-signature'}});
  assert.deepEqual(result.windows.platforms['windows-x86_64'],{url:'https://github.com/example/warren/releases/download/v0.2.1/Warren-0.2.1-windows-x64-setup.exe',signature:'test-signature'});
});
test('invalid metadata is rejected before publishing',()=>{
  const base={repository:'a/b',version:'0.2.1',notes:'Update',publishedAt:'2026-10-22T00:00:00Z'};
  assert.throws(()=>releaseMetadata(base));
  assert.throws(()=>releaseMetadata({...base,windows:{signature:''}}));
  for(const android of [{size:0,sha256:'a'.repeat(64)},{size:536870913,sha256:'a'.repeat(64)},{size:1,sha256:'not a digest'}])assert.throws(()=>releaseMetadata({...base,android}));
});
