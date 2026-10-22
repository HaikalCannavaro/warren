import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { Stronghold } from '@tauri-apps/plugin-stronghold';
import type { Store } from '@tauri-apps/plugin-stronghold';
import type { SavedState } from '../types';
import { emptyState, recoverState } from './domain';

export class WorkspaceVault {
  private queue: Promise<void> = Promise.resolve();
  private constructor(private stronghold: Stronghold, private store: Store) {}

  static async open(password:string):Promise<{vault:WorkspaceVault;state:SavedState}> {
    if (password.length < 12) throw new Error('Password utama minimal 12 karakter. Simpan dengan aman; tidak ada pemulihan password.');
    const path=await join(await appLocalDataDir(),'harbor.hold');
    let stronghold:Stronghold;
    try { stronghold=await Stronghold.load(path,password); }
    catch { throw new Error('Brankas tidak dapat dibuka. Periksa password utama dan akses penyimpanan.'); }
    let client;
    try { client=await stronghold.loadClient('harbor-workspace-v1'); }
    catch { client=await stronghold.createClient('harbor-workspace-v1'); }
    const store=client.getStore();
    const data=await store.get('workspace');
    const state=data ? recoverState(JSON.parse(new TextDecoder().decode(data))) : emptyState();
    const vault=new WorkspaceVault(stronghold,store);
    await vault.write(state);
    return {vault,state};
  }

  write(state:SavedState):Promise<void> {
    // Capture at enqueue time so a late save cannot serialize newer mutable state by accident.
    const bytes=Array.from(new TextEncoder().encode(JSON.stringify(state)));
    const next=this.queue.catch(()=>undefined).then(async()=>{
      await this.store.insert('workspace',bytes);
      await this.stronghold.save();
    });
    this.queue=next;
    return next;
  }

  async close():Promise<void> { await this.queue; await this.stronghold.unload(); }
}
