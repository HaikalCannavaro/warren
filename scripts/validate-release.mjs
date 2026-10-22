import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { releaseMetadata, validateRepository, versionCode } from './release-lib.mjs';
import { verifyTauriSignature } from './verify-signature.mjs';

const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const ownObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

function utf8(bytes, maximum) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0 || bytes.byteLength > maximum) throw new Error('Release asset is empty, oversized, or not a Buffer.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Release metadata is not valid UTF-8.'); }
}

function parseMetadata(bytes, maximum = MAX_MANIFEST_BYTES) {
  const text = utf8(bytes, maximum);
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Release metadata contains invalid JSON.'); }
  if (!ownObject(parsed)) throw new Error('Release metadata must be a JSON object.');
  // JSON.parse silently keeps the last duplicate key, while native deserializers
  // may reject it. Tokenize valid JSON and reject duplicates, including escaped
  // aliases, before comparing the parsed schema. No JSON values enter errors.
  const stack = [];
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ?? [];
  for (const token of tokens) {
    if (token === '{') stack.push({ keys: new Set(), needsKey: true });
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') { const top = stack.at(-1); if (top) top.needsKey = true; }
    else if (token[0] === '"') {
      const top = stack.at(-1);
      if (top?.needsKey) {
        const key = JSON.parse(token);
        if (top.keys.has(key)) throw new Error('Release metadata contains duplicate JSON keys.');
        top.keys.add(key); top.needsKey = false;
      }
    }
  }
  return parsed;
}

function requireDate(value) {
  if (typeof value !== 'string' || value.length > 64) throw new Error('Release publication date is invalid.');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) throw new Error('Release publication date must be RFC3339.');
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || Number(offsetHour ?? 0) > 23 || Number(offsetMinute ?? 0) > 59) throw new Error('Release publication date is invalid.');
  return value;
}

function payloadBytes(value) {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_PAYLOAD_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Android manifest payload is invalid or too large.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength > MAX_PAYLOAD_BYTES || bytes.toString('base64') !== value) throw new Error('Android manifest payload is invalid or too large.');
  return bytes;
}

/** Validate the complete immutable set of publishable release assets.
 * Input files must be a Map of exact filenames to snapshotted Buffers. Duplicate
 * filenames must be rejected before constructing the Map (a Map cannot retain them).
 * Returns canonical filenames; never includes unrecognized files in the result.
 */
export function validateReleaseBundle({ repository, version, publicKey, notes, files }) {
  validateRepository(repository);
  if (typeof version !== 'string') throw new Error('Release version is invalid.');
  versionCode(version);
  if (typeof notes !== 'string' || Buffer.byteLength(notes, 'utf8') > 8000) throw new Error('Release notes are invalid or exceed 8000 bytes.');
  if (!(files instanceof Map) || files.size === 0) throw new Error('Release assets must be a nonempty Map.');
  const windowsName = `Warren-${version}-windows-x64-setup.exe`;
  const androidName = `Warren-${version}-android.apk`;
  const windowsFiles = [windowsName, `${windowsName}.sig`, 'latest.json'];
  const androidFiles = [androidName, 'android.json'];
  const allowed = new Set([...windowsFiles, ...androidFiles]);
  for (const [name, bytes] of files) {
    if (!allowed.has(name) || !Buffer.isBuffer(bytes) || bytes.byteLength === 0 || bytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error('Release contains an unknown, empty, oversized, or invalid asset.');
  }
  const hasWindows = windowsFiles.some(name => files.has(name));
  const hasAndroid = androidFiles.some(name => files.has(name));
  if ((hasWindows && !windowsFiles.every(name => files.has(name))) || (hasAndroid && !androidFiles.every(name => files.has(name)))) throw new Error('Each platform requires its complete release asset set.');

  if (hasWindows) {
    const signature = utf8(files.get(`${windowsName}.sig`), 32770).trim();
    verifyTauriSignature(publicKey, signature, files.get(windowsName), version);
    const manifest = parseMetadata(files.get('latest.json'));
    const expected = releaseMetadata({ repository, version, notes, publishedAt: requireDate(manifest.pub_date), windows: { signature } }).windows;
    if (!isDeepStrictEqual(manifest, expected)) throw new Error('Windows manifest does not match the verified release assets and canonical metadata.');
  }

  if (hasAndroid) {
    const envelope = parseMetadata(files.get('android.json'));
    if (Object.keys(envelope).length !== 2 || !Object.hasOwn(envelope, 'payload') || !Object.hasOwn(envelope, 'signature') || typeof envelope.signature !== 'string') throw new Error('Android envelope schema is invalid.');
    const payload = payloadBytes(envelope.payload);
    // Authenticate the exact payload bytes before reading its version, URL or hash.
    verifyTauriSignature(publicKey, envelope.signature, payload, version);
    const manifest = parseMetadata(payload, MAX_PAYLOAD_BYTES);
    if (!Number.isSafeInteger(manifest.size) || manifest.size < 1 || manifest.size > MAX_ARTIFACT_BYTES) throw new Error('Signed APK size is invalid or exceeds 512 MB.');
    const apk = files.get(androidName);
    const expected = releaseMetadata({ repository, version, notes, publishedAt: requireDate(manifest.publishedAt), android: { size: apk.byteLength, sha256: createHash('sha256').update(apk).digest('hex') } }).android;
    if (!isDeepStrictEqual(manifest, expected)) throw new Error('Android manifest does not match the APK bytes and canonical release metadata.');
  }
  return [...(hasWindows ? windowsFiles : []), ...(hasAndroid ? androidFiles : [])];
}
