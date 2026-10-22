import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { validateReleaseBundle } from './validate-release.mjs';
import { releaseMetadata } from './release-lib.mjs';

const encoded = text => Buffer.from(text, 'utf8').toString('base64');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const repository = 'example/warren';
const publishedAt = '2026-10-22T00:00:00.000Z';
const notes = 'Test release notes';
// Public, independent Tauri CLI fixture from updater 2.14.0 offline_tests.
const officialKey = encoded('untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe');
const officialSignature = encoded('untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==');

function windows({ version = '2.0.0', noteText = notes, mutateManifest } = {}) {
  const name = `Warren-${version}-windows-x64-setup.exe`;
  const manifest = releaseMetadata({ repository, version, notes: noteText, publishedAt, windows: { signature: officialSignature } }).windows;
  mutateManifest?.(manifest);
  return { repository, version, publicKey: officialKey, notes: noteText, files: new Map([[name, Buffer.from('test')], [`${name}.sig`, Buffer.from(officialSignature)], ['latest.json', json(manifest)]]) };
}

// Throwaway private keys are runtime-only and never serialized into the source tree.
function signing() {
  const keys = generateKeyPairSync('ed25519'); const keyId = randomBytes(8);
  const publicBytes = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const publicKey = encoded(`untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), keyId, publicBytes]).toString('base64')}\n`);
  const signatureFor = (bytes, version) => {
    const signature = sign(null, createHash('blake2b512').update(bytes).digest(), keys.privateKey);
    const trusted = `timestamp:1700000000\tfile:android-payload.json\tversion:${version}`;
    const global = sign(null, Buffer.concat([signature, Buffer.from(trusted)]), keys.privateKey);
    return encoded(`untrusted comment: signature from tauri secret key\n${Buffer.concat([Buffer.from('ED'), keyId, signature]).toString('base64')}\ntrusted comment: ${trusted}\n${global.toString('base64')}\n`);
  };
  return { publicKey, signatureFor };
}

function android({ version = '0.2.1', patch = {}, payloadText, signVersion = version, withWindows = false } = {}) {
  const bytes = Buffer.from('APK bytes used only as a pure-validator fixture');
  const metadata = releaseMetadata({ repository, version, notes, publishedAt, android: { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } }).android;
  const payload = payloadText ? Buffer.from(payloadText) : json({ ...metadata, ...patch });
  const signer = signing();
  const envelope = { payload: payload.toString('base64'), signature: signer.signatureFor(payload, signVersion) };
  const files = new Map([['android.json', json(envelope)], [`Warren-${version}-android.apk`, bytes]]);
  if (withWindows) {
    const installer = Buffer.from('Installer bytes used only as a pure-validator fixture');
    const signature = signer.signatureFor(installer, version);
    const name = `Warren-${version}-windows-x64-setup.exe`;
    files.set(name, installer); files.set(`${name}.sig`, Buffer.from(signature));
    files.set('latest.json', json(releaseMetadata({ repository, version, notes, publishedAt, windows: { signature } }).windows));
  }
  return { repository, version, publicKey: signer.publicKey, notes, files };
}

test('accepts a complete Windows release verified by the official Tauri CLI fixture', () => {
  const bundle = windows();
  assert.deepEqual(validateReleaseBundle(bundle), ['Warren-2.0.0-windows-x64-setup.exe', 'Warren-2.0.0-windows-x64-setup.exe.sig', 'latest.json']);
});
test('accepts a complete Android release whose exact payload and APK bytes match', () => {
  assert.deepEqual(validateReleaseBundle(android()), ['Warren-0.2.1-android.apk', 'android.json']);
});
test('accepts both complete platform sets and returns names in canonical order', () => {
  assert.deepEqual(validateReleaseBundle(android({ withWindows: true })), ['Warren-0.2.1-windows-x64-setup.exe', 'Warren-0.2.1-windows-x64-setup.exe.sig', 'latest.json', 'Warren-0.2.1-android.apk', 'android.json']);
});
test('rejects altered Windows bytes, stale signed versions and sidecar signatures', () => {
  const bundle = windows(); bundle.files.set('Warren-2.0.0-windows-x64-setup.exe', Buffer.from('changed'));
  assert.throws(() => validateReleaseBundle(bundle), /signature/i);
  assert.throws(() => validateReleaseBundle(windows({ version: '2.0.1' })), /version/i);
  const wrongSidecar = windows(); wrongSidecar.files.set('Warren-2.0.0-windows-x64-setup.exe.sig', Buffer.from('PRIVATE-TEST-SENTINEL'));
  assert.throws(() => validateReleaseBundle(wrongSidecar), error => !error.message.includes('PRIVATE-TEST-SENTINEL'));
});
test('rejects Windows manifest repository, notes, date, schema and version changes', () => {
  for (const mutateManifest of [m => { m.version = '9.0.0'; }, m => { m.notes = 'different'; }, m => { m.pub_date = '2026-02-30T00:00:00Z'; }, m => { m.pub_date = 'tomorrow'; }, m => { m.platforms['windows-x86_64'].url = 'https://github.com/other/repo/file.exe'; }, m => { m.extra = 'unexpected'; }, m => { m.platforms['windows-aarch64'] = m.platforms['windows-x86_64']; }]) {
    assert.throws(() => validateReleaseBundle(windows({ mutateManifest })));
  }
});
test('rejects altered Android bytes or signed payload, and requires the expected signing version', () => {
  const changedBytes = android(); changedBytes.files.set('Warren-0.2.1-android.apk', Buffer.from('changed'));
  assert.throws(() => validateReleaseBundle(changedBytes), /manifest|APK|metadata/i);
  const changedPayload = android(); const envelope = JSON.parse(changedPayload.files.get('android.json'));
  envelope.payload = json({ tampered: true }).toString('base64'); changedPayload.files.set('android.json', json(envelope));
  assert.throws(() => validateReleaseBundle(changedPayload), /signature/i);
  assert.throws(() => validateReleaseBundle(android({ signVersion: '0.2.0' })), /version/i);
});
test('rejects correctly signed but noncanonical Android metadata', () => {
  for (const patch of [{ schemaVersion: 2 }, { packageName: 'another.app' }, { version: '0.2.2' }, { versionCode: 5 }, { url: 'https://github.com/other/repo/app.apk' }, { notes: 'other notes' }, { sha256: 'a'.repeat(64) }, { size: 10 }, { size: 536870913 }, { extra: true }, { publishedAt: '2026' }]) {
    assert.throws(() => validateReleaseBundle(android({ patch })));
  }
});
test('rejects partial platform sets, manifest-only packages, and extra files', () => {
  for (const file of windows().files.keys()) { const bundle = windows(); bundle.files.delete(file); assert.throws(() => validateReleaseBundle(bundle), /complete|asset/i); }
  for (const file of android().files.keys()) { const bundle = android(); bundle.files.delete(file); assert.throws(() => validateReleaseBundle(bundle), /complete|asset/i); }
  const extra = windows(); extra.files.set('private.key', Buffer.from('PRIVATE-TEST-SENTINEL'));
  assert.throws(() => validateReleaseBundle(extra), error => !error.message.includes('PRIVATE-TEST-SENTINEL'));
  assert.throws(() => validateReleaseBundle({ ...windows(), files: new Map() }));
});
test('rejects duplicate JSON keys including escaped aliases and unexpected envelope fields', () => {
  const win = windows(); const text = win.files.get('latest.json').toString();
  win.files.set('latest.json', Buffer.from(text.replace('"version":', '"\\u0076ersion":"0.0.1","version":')));
  assert.throws(() => validateReleaseBundle(win), /duplicate/i);
  const duplicateEnvelope = android(); const envelope = duplicateEnvelope.files.get('android.json').toString();
  duplicateEnvelope.files.set('android.json', Buffer.from(envelope.replace('"payload":', '"payload":"e30=","payload":')));
  assert.throws(() => validateReleaseBundle(duplicateEnvelope), /duplicate/i);
  const extraEnvelope = android(); const parsed = JSON.parse(extraEnvelope.files.get('android.json')); parsed.extra = true; extraEnvelope.files.set('android.json', json(parsed));
  assert.throws(() => validateReleaseBundle(extraEnvelope));
  const originalPayload = Buffer.from(JSON.parse(android().files.get('android.json')).payload, 'base64').toString();
  const duplicatePayload = android({ payloadText: originalPayload.replace('"version":', '"version":"0.0.1","version":') });
  assert.throws(() => validateReleaseBundle(duplicatePayload), /duplicate/i);
});
test('rejects malformed JSON, private keys, oversized notes, invalid repositories and invalid file containers', () => {
  const malformed = windows(); malformed.files.set('latest.json', Buffer.from('{PRIVATE-TEST-SENTINEL'));
  assert.throws(() => validateReleaseBundle(malformed), error => !error.message.includes('PRIVATE-TEST-SENTINEL'));
  assert.throws(() => validateReleaseBundle({ ...windows(), publicKey: encoded('untrusted comment: minisign encrypted secret key\nPRIVATE-TEST-SENTINEL') }));
  assert.throws(() => validateReleaseBundle({ ...windows(), notes: 'é'.repeat(4001) }));
  assert.throws(() => validateReleaseBundle({ ...windows(), repository: 'https://example.com/repo' }));
  assert.throws(() => validateReleaseBundle({ ...windows(), version: '0.2.1-beta' }));
  assert.throws(() => validateReleaseBundle({ ...windows(), files: {} }));
  const nonBuffer = windows(); nonBuffer.files.set('latest.json', '{}'); assert.throws(() => validateReleaseBundle(nonBuffer));
  const emptyFile = windows(); emptyFile.files.set('Warren-2.0.0-windows-x64-setup.exe', Buffer.alloc(0)); assert.throws(() => validateReleaseBundle(emptyFile));
  const oversizedManifest = windows(); oversizedManifest.files.set('latest.json', Buffer.alloc(128 * 1024 + 1, 0x20)); assert.throws(() => validateReleaseBundle(oversizedManifest), /oversized/i);
});
