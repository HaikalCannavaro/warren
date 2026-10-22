import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { createReleaseConfig, releaseMetadata, validateRepository, versionCode } from './release-lib.mjs';
import { verifyTauriSignature } from './verify-signature.mjs';
import { validateReleaseBundle } from './validate-release.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const command=process.argv[2];
const {values}=parseArgs({args:process.argv.slice(3),options:{repository:{type:'string'},'public-key':{type:'string'},windows:{type:'string'},android:{type:'string'},notes:{type:'string'},out:{type:'string'},directory:{type:'string'}}});
const pretty=value=>JSON.stringify(value,null,2)+'\n';
const run=(executable,args,env=process.env)=>{const r=spawnSync(executable,args,{cwd:root,stdio:'inherit',shell:false,env});if(r.error||r.status!==0)throw new Error(`Perintah ${path.basename(executable)} gagal. Rilis tidak diteruskan.`);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function artifactBytes(file){
  const stat=await fs.stat(file);
  if(!stat.isFile()||stat.size<1||stat.size>536870912)throw new Error('Artifact harus file dengan ukuran 1 byte sampai 512 MiB.');
  const bytes=await fs.readFile(file);
  if(bytes.length<1||bytes.length>536870912)throw new Error('Ukuran artifact berubah atau melebihi batas.');
  return bytes;
}
async function signingEnvironment(){
  const env={...process.env};
  if(!env.TAURI_SIGNING_PRIVATE_KEY_PATH&&env.TAURI_SIGNING_PRIVATE_KEY){
    const isFile=await fs.stat(env.TAURI_SIGNING_PRIVATE_KEY).then(s=>s.isFile()).catch(()=>false);
    if(isFile)env.TAURI_SIGNING_PRIVATE_KEY_PATH=path.resolve(env.TAURI_SIGNING_PRIVATE_KEY);
  }
  if(env.TAURI_SIGNING_PRIVATE_KEY_PATH){
    env.TAURI_SIGNING_PRIVATE_KEY_PATH=path.resolve(env.TAURI_SIGNING_PRIVATE_KEY_PATH);
    delete env.TAURI_SIGNING_PRIVATE_KEY;
  }
  delete env.TAURI_PRIVATE_KEY;
  delete env.TAURI_PRIVATE_KEY_PATH;
  delete env.TAURI_KEY_PASSWORD;
  delete env.TAURI_PRIVATE_KEY_PASSWORD;
  return env;
}

try {
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const config=JSON.parse(await fs.readFile(path.join(root,'src-tauri/tauri.conf.json'),'utf8'));
  const cargo=await fs.readFile(path.join(root,'src-tauri/Cargo.toml'),'utf8');
  const version=pkg.version;versionCode(version);
  if(config.version!==version||cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]!==version)throw new Error('Versi package.json, tauri.conf.json, dan Cargo.toml harus sama.');
  if(command==='configure'){
    if(!values.repository||!values['public-key'])throw new Error('Gunakan configure --repository OWNER/REPO --public-key PATH.pub');
    const key=await fs.readFile(path.resolve(values['public-key']),'utf8');
    const overlay=createReleaseConfig(values.repository,key,version);
    await fs.writeFile(path.join(root,'src-tauri/tauri.release.conf.json'),pretty(overlay));
    console.log(`Konfigurasi rilis ${version} disiapkan untuk ${values.repository}. Tidak ada private key disalin.`);
  } else if(command==='package'){
    if(!values.repository||(!values.windows&&!values.android))throw new Error('Gunakan package --repository OWNER/REPO --windows FILE.exe --android FILE.apk --notes NOTES.md');
    validateRepository(values.repository);
    const overlay=JSON.parse(await fs.readFile(path.join(root,'src-tauri/tauri.release.conf.json'),'utf8'));
    const expected=createReleaseConfig(values.repository,overlay.plugins.updater.pubkey,version);
    if(JSON.stringify(overlay)!==JSON.stringify(expected))throw new Error('Konfigurasi rilis tidak cocok. Jalankan release:configure untuk versi/repository ini.');
    const notes=values.notes?await fs.readFile(path.resolve(values.notes),'utf8'):'';
    let windows,android,windowsBytes,androidBytes;
    if(values.windows){
      const windowsPath=path.resolve(values.windows);if(!windowsPath.toLowerCase().endsWith('.exe'))throw new Error('Artifact Windows harus installer NSIS .exe x64.');
      windowsBytes=await artifactBytes(windowsPath);
      windows={signature:await fs.readFile(windowsPath+'.sig','utf8')};
      verifyTauriSignature(overlay.plugins.updater.pubkey,windows.signature,windowsBytes,version);
    }
    if(values.android){
      if(!process.env.TAURI_SIGNING_PRIVATE_KEY&&!process.env.TAURI_SIGNING_PRIVATE_KEY_PATH)throw new Error('Tetapkan TAURI_SIGNING_PRIVATE_KEY untuk menandatangani metadata Android.');
      const androidPath=path.resolve(values.android);if(!androidPath.toLowerCase().endsWith('.apk'))throw new Error('Artifact Android harus APK rilis yang sudah ditandatangani.');
      androidBytes=await artifactBytes(androidPath);
      android={size:androidBytes.length,sha256:digest(androidBytes)};
    }
    const metadata=releaseMetadata({repository:values.repository,version,notes,publishedAt:new Date().toISOString(),windows,android});
    const out=path.resolve(values.out||path.join(root,'release',`v${version}`));
    await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out); // Refuse to overwrite an existing release.
    const files=[];
    if(windows){
      const name=`Warren-${version}-windows-x64-setup.exe`;
      await fs.writeFile(path.join(out,name),windowsBytes);await fs.writeFile(path.join(out,name+'.sig'),windows.signature);
      await fs.writeFile(path.join(out,'latest.json'),pretty(metadata.windows));files.push(name,name+'.sig','latest.json');
    }
    if(android){
      const name=`Warren-${version}-android.apk`;await fs.writeFile(path.join(out,name),androidBytes);
      const payload=Buffer.from(pretty(metadata.android));const payloadPath=path.join(out,'android-payload.json');await fs.writeFile(payloadPath,payload);
      run(process.execPath,[path.join(root,'node_modules/@tauri-apps/cli/tauri.js'),'signer','sign','--app-version',version,payloadPath],await signingEnvironment());
      const signature=(await fs.readFile(payloadPath+'.sig','utf8')).trim();
      await fs.writeFile(path.join(out,'android.json'),pretty({payload:payload.toString('base64'),signature}));files.push(name,'android.json');
    }
    const publishedFiles=new Map(await Promise.all(files.map(async name=>[name,await artifactBytes(path.join(out,name))])));
    validateReleaseBundle({repository:values.repository,version,publicKey:overlay.plugins.updater.pubkey,notes,files:publishedFiles});
    const hashes=Object.fromEntries([...publishedFiles].map(([name,bytes])=>[name,digest(bytes)]));
    hashes['notes.md']=digest(Buffer.from(notes));
    await fs.writeFile(path.join(out,'notes.md'),notes);
    await fs.writeFile(path.join(out,'release-index.json'),pretty({repository:values.repository,version,files,hashes}));
    console.log(`Paket rilis dibuat: ${out}. Periksa APK/installer dan manifest sebelum membuat draft rilis.`);
  } else if(command==='publish'){
    if(!values.directory)throw new Error('Gunakan publish --directory release/vVERSI');
    const out=path.resolve(values.directory);const index=JSON.parse(await fs.readFile(path.join(out,'release-index.json'),'utf8'));
    validateRepository(index.repository);versionCode(index.version);
    if(index.version!==version)throw new Error('Versi paket rilis berbeda dari source.');
    const allowed=new Set(['latest.json','android.json',`Warren-${version}-android.apk`,`Warren-${version}-windows-x64-setup.exe`,`Warren-${version}-windows-x64-setup.exe.sig`]);
    if(!Array.isArray(index.files)||index.files.length===0||new Set(index.files).size!==index.files.length||index.files.some(name=>!allowed.has(name)))throw new Error('Daftar artifact rilis tidak valid.');
    const overlay=JSON.parse(await fs.readFile(path.join(root,'src-tauri/tauri.release.conf.json'),'utf8'));
    if(JSON.stringify(overlay)!==JSON.stringify(createReleaseConfig(index.repository,overlay.plugins.updater.pubkey,version)))throw new Error('Konfigurasi source tidak sesuai paket rilis.');
    const publishedFiles=new Map(await Promise.all(index.files.map(async name=>[name,await artifactBytes(path.join(out,name))])));
    const notes=await fs.readFile(path.join(out,'notes.md'),'utf8');
    for(const [name,bytes] of [...publishedFiles,['notes.md',Buffer.from(notes)]])if(index.hashes?.[name]!==digest(bytes))throw new Error('Isi paket rilis berubah setelah pengemasan. Buat paket baru.');
    validateReleaseBundle({repository:index.repository,version,publicKey:overlay.plugins.updater.pubkey,notes,files:publishedFiles});
    run('gh',['release','create',`v${version}`,...index.files.map(name=>path.join(out,name)),'--repo',index.repository,'--verify-tag','--draft','--title',`Warren ${version}`,'--notes-file',path.join(out,'notes.md')]);
    console.log('Draft rilis dibuat. Uji kedua platform lalu publish draft untuk mengaktifkan update.');
  } else throw new Error('Pilih configure, package, atau publish. Lihat docs/UPDATES.md.');
} catch(error) {
  console.error(error instanceof Error?error.message:'Penyiapan rilis gagal.');process.exitCode=1;
}
