import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { verifyTauriSignature } from './verify-signature.mjs';

const encode = text => Buffer.from(text, 'utf8').toString('base64');
const decode = text => Buffer.from(text, 'base64').toString('utf8');

// Keys only exist in memory during a test; no private signing material is embedded or written.
function fixture({ data = Buffer.from('test artifact'), version = '0.2.1', algorithm = 'ED', comment, keyId = randomBytes(8) } = {}) {
  const keys = generateKeyPairSync('ed25519');
  const publicBytes = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const publicKey = encode(`untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), keyId, publicBytes]).toString('base64')}\n`);
  const trustedComment = comment ?? `timestamp:1700000000\tfile:artifact.bin\tversion:${version}`;
  const digest = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
  const dataSignature = sign(null, digest, keys.privateKey);
  const packet = Buffer.concat([Buffer.from(algorithm), keyId, dataSignature]);
  const globalSignature = sign(null, Buffer.concat([dataSignature, Buffer.from(trustedComment)]), keys.privateKey);
  const signature = encode(`untrusted comment: signature from tauri secret key\n${packet.toString('base64')}\ntrusted comment: ${trustedComment}\n${globalSignature.toString('base64')}\n`);
  return { publicKey, signature, data, version };
}
function check(item, version = item.version) { return verifyTauriSignature(item.publicKey, item.signature, item.data, version); }

test('verifies prehashed ED and legacy Ed signatures with authenticated versions', () => {
  for (const algorithm of ['ED', 'Ed']) assert.equal(check(fixture({ algorithm })), true);
});

test('uses the supplied Uint8Array view rather than unrelated backing bytes', () => {
  const item = fixture();
  const backing = Buffer.concat([Buffer.from('prefix'), item.data, Buffer.from('suffix')]);
  assert.equal(verifyTauriSignature(item.publicKey, item.signature, backing.subarray(6, 6 + item.data.length), item.version), true);
});

test('rejects wrong bytes, wrong key material, and wrong key IDs', () => {
  const item = fixture();
  assert.throws(() => check({ ...item, data: Buffer.from('changed artifact') }), /signature/i);
  const other = fixture();
  assert.throws(() => check({ ...item, publicKey: other.publicKey }), /key|signature/i);
  const publicLines = decode(item.publicKey).trimEnd().split('\n');
  const packet = Buffer.from(publicLines[1], 'base64');
  packet[2] ^= 1; publicLines[1] = packet.toString('base64');
  assert.throws(() => check({ ...item, publicKey: encode(publicLines.join('\n')) }), /key/i);
  const sameKeyIdDifferentKey = Buffer.from(decode(other.publicKey).trimEnd().split('\n')[1], 'base64');
  sameKeyIdDifferentKey.copy(packet, 10, 10);
  publicLines[1] = packet.toString('base64');
  packet[2] ^= 1; publicLines[1] = packet.toString('base64');
  assert.throws(() => check({ ...item, publicKey: encode(publicLines.join('\n')) }), /signature/i);
});

test('authenticates the trusted comment and its separate global signature', () => {
  const item = fixture();
  const changedComment = encode(decode(item.signature).replace('version:0.2.1', 'version:9.9.9'));
  assert.throws(() => check({ ...item, signature: changedComment }, '9.9.9'), /signature/i);
  const lines = decode(item.signature).trimEnd().split('\n');
  const global = Buffer.from(lines[3], 'base64'); global[0] ^= 1; lines[3] = global.toString('base64');
  assert.throws(() => check({ ...item, signature: encode(lines.join('\n')) }), /signature/i);
});

test('requires the exact tab-separated version field and rejects stale versions', () => {
  assert.throws(() => check(fixture(), '0.2.2'), /version/i);
  for (const comment of ['timestamp:1\tfile:app-version:0.2.1', 'timestamp:1 version:0.2.1', 'timestamp:1\tappversion:0.2.1', 'timestamp:1\tversion:']) {
    assert.throws(() => check(fixture({ comment })), /version/i);
  }
  assert.equal(check(fixture(), 'v0.2.1'), true);
  assert.equal(check(fixture({ version: 'v0.2.1' }), '0.2.1'), true);
  assert.equal(check(fixture({ version: '2026-10-22' })), true);
  assert.throws(() => check(fixture({ version: '0.2.1+build.1' }), '0.2.1+build.2'), /version/i);
});

test('rejects malformed encoding, packet shapes, unsupported algorithms, and private-key files', () => {
  const item = fixture();
  for (const signature of ['', 'not base64!', item.signature.slice(0, -3), encode('untrusted comment: minisign encrypted secret key\nPRIVATE-TEST-SENTINEL'), encode(decode(item.signature) + '\nPRIVATE-TEST-SENTINEL')]) {
    assert.throws(() => check({ ...item, signature }), error => !error.message.includes('PRIVATE-TEST-SENTINEL'));
  }
  for (const publicKey of ['', encode('untrusted comment: minisign encrypted secret key\nPRIVATE-TEST-SENTINEL'), encode(decode(item.publicKey).replace('public key', 'private key'))]) {
    assert.throws(() => check({ ...item, publicKey }), error => !error.message.includes('PRIVATE-TEST-SENTINEL'));
  }
  assert.throws(() => check(fixture({ algorithm: 'XX' })), /algorithm/i);
  const lines = decode(item.signature).trimEnd().split('\n');
  lines[1] = Buffer.alloc(73).toString('base64');
  assert.throws(() => check({ ...item, signature: encode(lines.join('\n')) }), /signature/i);
  const invalidUtf8 = Buffer.from([0xc3, 0x28]).toString('base64');
  assert.throws(() => check({ ...item, publicKey: invalidUtf8 }), /public key/i);
});

test('does not accept high-bit aliases of Minisign algorithm identifiers', () => {
  const item = fixture();
  const signatureLines = decode(item.signature).trimEnd().split('\n');
  const signaturePacket = Buffer.from(signatureLines[1], 'base64');
  signaturePacket[0] |= 0x80; signatureLines[1] = signaturePacket.toString('base64');
  assert.throws(() => check({ ...item, signature: encode(signatureLines.join('\n')) }), /algorithm/i);
  const publicLines = decode(item.publicKey).trimEnd().split('\n');
  const publicPacket = Buffer.from(publicLines[1], 'base64');
  publicPacket[0] |= 0x80; publicLines[1] = publicPacket.toString('base64');
  assert.throws(() => check({ ...item, publicKey: encode(publicLines.join('\n')) }), /public key/i);
});

// Independent Tauri CLI fixture from tauri-plugin-updater 2.14.0, updater.rs
// offline_tests::PUBLIC_KEY/SIGNATURE. Upstream generated it with `tauri signer
// sign --app-version 2.0.0` for the public payload "test". Only public data follows.
test('cross-checks the official Tauri CLI signed-version fixture', () => {
  const publicKey = encode('untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe');
  const signature = encode('untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==');
  assert.equal(verifyTauriSignature(publicKey, signature, Buffer.from('test'), '2.0.0'), true);
  assert.throws(() => verifyTauriSignature(publicKey, signature, Buffer.from('tampered'), '2.0.0'), /signature/i);
  assert.throws(() => verifyTauriSignature(publicKey, signature, Buffer.from('test'), '3.0.0'), /version/i);
});
