import type { FleetAgent } from './fleet';

export type IdleBurrow = 'sleep' | 'sleep-two';
export type IdleAssignments = Partial<Record<FleetAgent,IdleBurrow>>;

/** A session-seeded visual allocation: stable on polls, balanced when idle membership changes. */
export function allocateIdleBurrows(idle:readonly FleetAgent[],previous:IdleAssignments,seed:number):IdleAssignments{
  const rank=(agent:FleetAgent)=>{
    let hash=(Math.floor((Number.isFinite(seed)?seed:0)*0xffffffff)^0x811c9dc5)>>>0;
    for(const letter of agent)hash=Math.imul(hash^letter.charCodeAt(0),0x01000193)>>>0;
    return hash;
  };
  const agents=[...new Set(idle)].sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b));
  const result:IdleAssignments={},counts:Record<IdleBurrow,number>={sleep:0,'sleep-two':0};
  for(const agent of agents){
    const room=previous[agent];
    if(room==='sleep'||room==='sleep-two'){result[agent]=room;counts[room]++;}
  }
  for(const agent of agents){
    if(result[agent])continue;
    const room:IdleBurrow=counts.sleep===counts['sleep-two']?(rank(agent)%2?'sleep':'sleep-two'):counts.sleep<counts['sleep-two']?'sleep':'sleep-two';
    result[agent]=room;counts[room]++;
  }
  while(Math.abs(counts.sleep-counts['sleep-two'])>1){
    const from:IdleBurrow=counts.sleep>counts['sleep-two']?'sleep':'sleep-two',to:IdleBurrow=from==='sleep'?'sleep-two':'sleep';
    const agent=agents.find(name=>result[name]===from)!;
    result[agent]=to;counts[from]--;counts[to]++;
  }
  return result;
}
