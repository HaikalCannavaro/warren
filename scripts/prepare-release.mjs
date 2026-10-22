import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createReleaseConfig, versionCode } from './release-lib.mjs';

const files = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.release.conf.json'];
const pretty = value => JSON.stringify(value, null, 2) + '\n';

function stableVersionCode(version) {
  if (typeof version !== 'string' || version.trim() !== version) throw new Error('Use a stable MAJOR.MINOR.PATCH version.');
  return versionCode(version);
}

function json(text, name) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${name} contains invalid JSON.`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must contain an object.`);
  return value;
}

// Only edit a scalar inside the selected Cargo table. Dependency versions and
// Cargo.lock's format version must retain their exact original text.
function tables(text, header) {
  const headings = [...text.matchAll(/^[ \t]*(\[\[?[^\]\r\n]+\]\]?)[ \t]*(?:#[^\r\n]*)?\r?$/gm)];
  return headings.flatMap((match, index) => match[1] === header ? [{ start: match.index, end: headings[index + 1]?.index ?? text.length, text: text.slice(match.index, headings[index + 1]?.index ?? text.length) }] : []);
}

function scalar(table, field, name) {
  const matches = [...table.text.matchAll(new RegExp(`^([ \\t]*${field}[ \\t]*=[ \\t]*)(["'])([^\\r\\n]*?)\\2[ \\t]*(?:#[^\\r\\n]*)?\\r?$`, 'gm'))];
  if (matches.length !== 1) throw new Error(`${name} must contain exactly one ${field} in its application package.`);
  const match = matches[0];
  return { value: match[3], start: table.start + match.index + match[1].length + 1 };
}

function replaceScalar(text, scalar, value) {
  return text.slice(0, scalar.start) + value + text.slice(scalar.start + scalar.value.length);
}

/** Prepare local source metadata for a new release. Never signs or publishes. */
export async function prepareRelease(root, version) {
  const nextCode = stableVersionCode(version);
  const source = Object.fromEntries(await Promise.all(files.map(async name => [name, await fs.readFile(path.join(root, name), 'utf8')])));
  const pkg = json(source['package.json'], 'package.json');
  const lock = json(source['package-lock.json'], 'package-lock.json');
  const tauri = json(source['src-tauri/tauri.conf.json'], 'tauri.conf.json');
  const overlay = json(source['src-tauri/tauri.release.conf.json'], 'tauri.release.conf.json');
  const previousVersion = pkg.version;
  const currentCode = stableVersionCode(previousVersion);
  if (nextCode <= currentCode) throw new Error(`New release version must be higher than ${previousVersion}.`);
  if (tauri.identifier !== 'dev.harbor.workspace') throw new Error('Application identifier must remain dev.harbor.workspace.');

  const cargoTables = tables(source['src-tauri/Cargo.toml'], '[package]');
  if (cargoTables.length !== 1 || scalar(cargoTables[0], 'name', 'Cargo.toml').value !== 'harbor') throw new Error('Cargo.toml must contain the harbor application package.');
  const cargoVersion = scalar(cargoTables[0], 'version', 'Cargo.toml');
  const lockTables = tables(source['src-tauri/Cargo.lock'], '[[package]]').filter(table => scalar(table, 'name', 'Cargo.lock').value === 'harbor' && !/^[ \t]*source[ \t]*=/m.test(table.text));
  if (lockTables.length !== 1) throw new Error('Cargo.lock must contain exactly one local harbor application package.');
  const cargoLockVersion = scalar(lockTables[0], 'version', 'Cargo.lock');
  if ([lock.version, lock.packages?.['']?.version, tauri.version, cargoVersion.value, cargoLockVersion.value].some(value => value !== previousVersion)) throw new Error('Application versions in package.json, package-lock.json, Tauri and Cargo files must match.');

  const endpoint = overlay.plugins?.updater?.endpoints?.[0];
  const repository = typeof endpoint === 'string' && /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/latest\/download\/latest\.json$/.exec(endpoint)?.[1];
  const publicKey = overlay.plugins?.updater?.pubkey;
  if (!repository || typeof publicKey !== 'string') throw new Error('Existing updater repository and public key are required.');
  const expected = createReleaseConfig(repository, publicKey, previousVersion);
  if (!isDeepStrictEqual(overlay, expected)) throw new Error('Existing release configuration is inconsistent with its version, public key, repository or updater policy.');
  const nextOverlay = createReleaseConfig(repository, publicKey, version);

  pkg.version = version;
  lock.version = version;
  lock.packages[''].version = version;
  tauri.version = version;
  const updates = {
    'package.json': pretty(pkg),
    'package-lock.json': pretty(lock),
    'src-tauri/tauri.conf.json': pretty(tauri),
    'src-tauri/Cargo.toml': replaceScalar(source['src-tauri/Cargo.toml'], cargoVersion, version),
    'src-tauri/Cargo.lock': replaceScalar(source['src-tauri/Cargo.lock'], cargoLockVersion, version),
    'src-tauri/tauri.release.conf.json': pretty(nextOverlay),
  };
  // Read and validate every input before the first write so invalid requests
  // cannot leave only some of the application versions updated.
  for (const [name, contents] of Object.entries(updates)) await fs.writeFile(path.join(root, name), contents);
  return { previousVersion, version, files: [...files] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-release.mjs MAJOR.MINOR.PATCH');
    const result = await prepareRelease(fileURLToPath(new URL('../', import.meta.url)), process.argv[2]);
    console.log(`Release version prepared: ${result.previousVersion} -> ${result.version}. Review the six changed files before building.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release preparation failed.');
    process.exitCode = 1;
  }
}
