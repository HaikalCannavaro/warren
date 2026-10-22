import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';

// Format and verification are matched to minisign-verify 0.3.0 (PublicKey,
// Signature, verify_ed25519) and tauri-plugin-updater 2.14.0 (verify_signature,
// signed_version). Only Node's Ed25519 and BLAKE2b implementations do crypto.
const PUBLIC_KEY_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const MAX_ENCODED_LENGTH = 32768;

function decodeBase64(value, message) {
  if (typeof value !== 'string' || !value.length || value.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(message);
  const decoded = Buffer.from(value, 'base64');
  // Buffer.from is permissive; require canonical standard Base64 as Tauri does.
  if (decoded.toString('base64') !== value) throw new Error(message);
  return decoded;
}

function decodeLines(encoded, count, message) {
  if (typeof encoded !== 'string') throw new Error(message);
  const bytes = decodeBase64(encoded.trim(), message);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error(message); }
  const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length !== count || lines.some(line => line.includes('\r')) || !lines[0].startsWith('untrusted comment:')) throw new Error(message);
  return lines;
}

function semanticSpelling(value) {
  const normalized = value.replace(/^v+/, '');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(normalized);
  if (!match || match.slice(1, 4).some(part => BigInt(part) > 18446744073709551615n)) return null;
  if (match[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === '0')) return null;
  // Rust semver::Version equality includes prerelease AND build metadata.
  return normalized;
}

/** Verify a Tauri encoded Minisign signature, including its signed release version.
 * Returns true on success; every failure throws a fixed error without input data.
 */
export function verifyTauriSignature(publicKeyEncoded, signatureEncoded, bytes, expectedVersion) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Artifact data must be bytes.');
  if (typeof expectedVersion !== 'string' || !expectedVersion || expectedVersion.length > 256 || /[\x00-\x20\x7f]/.test(expectedVersion)) throw new Error('Invalid expected release version.');
  const keyError = 'Invalid Tauri public key; private signing material is not accepted.';
  const signatureError = 'Invalid Tauri signature encoding or packet.';
  const publicLines = decodeLines(publicKeyEncoded, 2, keyError);
  if (/\b(?:private|secret)\s+key\b/i.test(publicLines[0])) throw new Error(keyError);
  const publicPacket = decodeBase64(publicLines[1], keyError);
  if (publicPacket.length !== 42 || !['Ed', 'ED'].includes(publicPacket.subarray(0, 2).toString('latin1'))) throw new Error(keyError);
  const signatureLines = decodeLines(signatureEncoded, 4, signatureError);
  if (/^untrusted comment:\s*(?:minisign\s+)?(?:encrypted\s+)?(?:private|secret)\s+key\b/i.test(signatureLines[0])) throw new Error(signatureError);
  const signaturePacket = decodeBase64(signatureLines[1], signatureError);
  const globalSignature = decodeBase64(signatureLines[3], signatureError);
  if (signaturePacket.length !== 74 || globalSignature.length !== 64 || !signatureLines[2].startsWith('trusted comment: ')) throw new Error(signatureError);
  const algorithm = signaturePacket.subarray(0, 2).toString('latin1');
  if (algorithm !== 'ED' && algorithm !== 'Ed') throw new Error('Unsupported Minisign signature algorithm.');
  if (!timingSafeEqual(publicPacket.subarray(2, 10), signaturePacket.subarray(2, 10))) throw new Error('Signature key ID does not match the configured public key.');
  const dataSignature = signaturePacket.subarray(10);
  const trustedComment = signatureLines[2].slice('trusted comment: '.length);
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let valid;
  try {
    const publicKey = createPublicKey({ key: Buffer.concat([PUBLIC_KEY_DER_PREFIX, publicPacket.subarray(10)]), format: 'der', type: 'spki' });
    const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
    valid = verify(null, message, publicKey, dataSignature)
      && verify(null, Buffer.concat([dataSignature, Buffer.from(trustedComment, 'utf8')]), publicKey, globalSignature);
  } catch { throw new Error('Signature verification failed.'); }
  if (!valid) throw new Error('Signature verification failed.');

  // The comment is trusted only after BOTH signatures verify. Match the first
  // exact tab-separated version: field, as the official updater does.
  const signedVersion = trustedComment.split('\t').find(field => field.startsWith('version:'))?.slice('version:'.length);
  if (!signedVersion) throw new Error('Signature does not contain a signed release version.');
  const signedSemantic = semanticSpelling(signedVersion);
  const expectedSemantic = semanticSpelling(expectedVersion);
  const matches = signedSemantic !== null && expectedSemantic !== null
    ? signedSemantic === expectedSemantic : signedVersion === expectedVersion;
  if (!matches) throw new Error('Signed release version does not match the expected version.');
  return true;
}
