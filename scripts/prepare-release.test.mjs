import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareRelease } from './prepare-release.mjs';

const publicKey = Buffer.from('untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe').toString('base64');
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const files = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.release.conf.json'];
const read = (root, name) => fs.readFile(path.join(root, name), 'utf8');
const readJson = async (root, name) => JSON.parse(await read(root, name));
const snapshot = async root => Object.fromEntries(await Promise.all(files.map(async name => [name, await read(root, name)])));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'warren-prepare-release-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src-tauri'));
  const data = {
    'package.json': pretty({ name: 'warren', version: '0.2.0', scripts: { test: 'node --test' } }),
    'package-lock.json': pretty({ name: 'warren', version: '0.2.0', lockfileVersion: 3, packages: { '': { name: 'warren', version: '0.2.0' }, 'node_modules/example': { version: '0.2.0' } } }),
    'src-tauri/tauri.conf.json': pretty({ productName: 'Warren', version: '0.2.0', identifier: 'dev.harbor.workspace', bundle: { active: true } }),
    'src-tauri/Cargo.toml': '# App manifest\n[package]\nname = "harbor"\nversion = "0.2.0" # Application version\n\n[dependencies]\nexample = { version = "0.2.0" }\n',
    'src-tauri/Cargo.lock': '# Generated lockfile\nversion = 4\n\n[[package]]\nname = "example"\nversion = "0.2.0"\nsource = "registry+https://example.com/index"\n\n[[package]]\nname = "harbor"\nversion = "0.2.0"\ndependencies = [\n "example",\n]\n',
    'src-tauri/tauri.release.conf.json': pretty({ bundle: { createUpdaterArtifacts: true, android: { versionCode: 2000 } }, plugins: { updater: { pubkey: publicKey, endpoints: ['https://github.com/example/warren/releases/latest/download/latest.json'], requireSignedVersion: true, allowDowngrades: false, windows: { installMode: 'passive' } }, 'harbor-android-updater': { pubkey: publicKey, endpoint: 'https://github.com/example/warren/releases/latest/download/android.json' } } }),
  };
  for (const [name, contents] of Object.entries(data)) await fs.writeFile(path.join(root, name), contents);
  return root;
}

async function changeJson(root, name, change) {
  const value = await readJson(root, name);
  change(value);
  await fs.writeFile(path.join(root, name), pretty(value));
}

test('bumps every application version while preserving dependencies and updater identity', async t => {
  const root = await fixture(t);
  const before = await snapshot(root);
  await prepareRelease(root, '0.2.1');
  assert.equal((await readJson(root, 'package.json')).version, '0.2.1');
  const lock = await readJson(root, 'package-lock.json');
  assert.equal(lock.version, '0.2.1');
  assert.equal(lock.packages[''].version, '0.2.1');
  assert.equal(lock.packages['node_modules/example'].version, '0.2.0');
  assert.deepEqual(await readJson(root, 'src-tauri/tauri.conf.json'), { ...JSON.parse(before['src-tauri/tauri.conf.json']), version: '0.2.1' });
  assert.equal(await read(root, 'src-tauri/Cargo.toml'), before['src-tauri/Cargo.toml'].replace('version = "0.2.0" # Application', 'version = "0.2.1" # Application'));
  assert.equal(await read(root, 'src-tauri/Cargo.lock'), before['src-tauri/Cargo.lock'].replace('name = "harbor"\nversion = "0.2.0"', 'name = "harbor"\nversion = "0.2.1"'));
  const expectedOverlay = JSON.parse(before['src-tauri/tauri.release.conf.json']);
  expectedOverlay.bundle.android.versionCode = 2001;
  assert.deepEqual(await readJson(root, 'src-tauri/tauri.release.conf.json'), expectedOverlay);
  assert.deepEqual((await fs.readdir(root)).sort(), ['package-lock.json', 'package.json', 'src-tauri']);
  assert.deepEqual((await fs.readdir(path.join(root, 'src-tauri'))).sort(), ['Cargo.lock', 'Cargo.toml', 'tauri.conf.json', 'tauri.release.conf.json']);
});

test('compares stable versions numerically across minor and major boundaries', async t => {
  const root = await fixture(t);
  await prepareRelease(root, '0.10.0');
  assert.equal((await readJson(root, 'src-tauri/tauri.release.conf.json')).bundle.android.versionCode, 10000);
  await prepareRelease(root, '1.0.0');
  assert.equal((await readJson(root, 'package.json')).version, '1.0.0');
  assert.equal((await readJson(root, 'src-tauri/tauri.release.conf.json')).bundle.android.versionCode, 1000000);
});

for (const version of ['0.2.0', '0.1.999', '0.0.1', '', 'v0.2.1', '0.02.1', '0.2.1-beta', '0.2.1+build', ' 0.2.1', '0.2.1\n', '0.2.1000', '2101.0.0', undefined, 2]) {
  test(`rejects ${JSON.stringify(version)} before changing any file`, async t => {
    const root = await fixture(t);
    const before = await snapshot(root);
    await assert.rejects(prepareRelease(root, version));
    assert.deepEqual(await snapshot(root), before);
  });
}

const inconsistent = [
  ['package-lock.json top version', root => changeJson(root, 'package-lock.json', value => { value.version = '0.1.0'; })],
  ['package-lock.json root version', root => changeJson(root, 'package-lock.json', value => { value.packages[''].version = '0.1.0'; })],
  ['package-lock.json missing root', root => changeJson(root, 'package-lock.json', value => { delete value.packages['']; })],
  ['Tauri version', root => changeJson(root, 'src-tauri/tauri.conf.json', value => { value.version = '0.1.0'; })],
  ['application identifier', root => changeJson(root, 'src-tauri/tauri.conf.json', value => { value.identifier = 'different.app'; })],
  ['Cargo package version', async root => fs.writeFile(path.join(root, 'src-tauri/Cargo.toml'), (await read(root, 'src-tauri/Cargo.toml')).replace('version = "0.2.0" #', 'version = "0.1.0" #'))],
  ['Cargo lock root version', async root => fs.writeFile(path.join(root, 'src-tauri/Cargo.lock'), (await read(root, 'src-tauri/Cargo.lock')).replace('name = "harbor"\nversion = "0.2.0"', 'name = "harbor"\nversion = "0.1.0"'))],
  ['missing Cargo lock root', async root => fs.writeFile(path.join(root, 'src-tauri/Cargo.lock'), (await read(root, 'src-tauri/Cargo.lock')).replace('name = "harbor"', 'name = "another"'))],
  ['duplicate Cargo lock root', async root => fs.appendFile(path.join(root, 'src-tauri/Cargo.lock'), '\n[[package]]\nname = "harbor"\nversion = "0.2.0"\n')],
  ['duplicate Cargo package version', async root => fs.writeFile(path.join(root, 'src-tauri/Cargo.toml'), (await read(root, 'src-tauri/Cargo.toml')).replace('[package]', '[package]\nversion = "0.2.0"'))],
  ['Android version code', root => changeJson(root, 'src-tauri/tauri.release.conf.json', value => { value.bundle.android.versionCode = 1999; })],
  ['Android repository', root => changeJson(root, 'src-tauri/tauri.release.conf.json', value => { value.plugins['harbor-android-updater'].endpoint = 'https://github.com/other/warren/releases/latest/download/android.json'; })],
  ['Android public key', root => changeJson(root, 'src-tauri/tauri.release.conf.json', value => { value.plugins['harbor-android-updater'].pubkey = 'different-key'; })],
  ['invalid public key', root => changeJson(root, 'src-tauri/tauri.release.conf.json', value => { value.plugins.updater.pubkey = 'invalid-key'; })],
  ['downgrade policy', root => changeJson(root, 'src-tauri/tauri.release.conf.json', value => { value.plugins.updater.allowDowngrades = true; })],
  ['missing endpoint', root => changeJson(root, 'src-tauri/tauri.release.conf.json', value => { value.plugins.updater.endpoints = []; })],
  ['invalid JSON', root => fs.writeFile(path.join(root, 'src-tauri/tauri.release.conf.json'), '{')],
];
for (const [label, mutate] of inconsistent) {
  test(`rejects inconsistent ${label} without writing any changes`, async t => {
    const root = await fixture(t);
    await mutate(root);
    const before = await snapshot(root);
    await assert.rejects(prepareRelease(root, '0.2.1'));
    assert.deepEqual(await snapshot(root), before);
  });
}

test('CLI prepares its own repository and rejects missing or extra arguments', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'scripts'));
  for (const name of ['prepare-release.mjs', 'release-lib.mjs']) await fs.copyFile(fileURLToPath(new URL(name, import.meta.url)), path.join(root, 'scripts', name));
  const script = path.join(root, 'scripts/prepare-release.mjs');
  const before = await snapshot(root);
  for (const args of [[], ['0.2.1', 'extra']]) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: os.tmpdir(), encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(await snapshot(root), before);
  }
  const result = spawnSync(process.execPath, [script, '0.2.1'], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await readJson(root, 'package.json')).version, '0.2.1');
});
