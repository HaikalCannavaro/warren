import {expect,it} from 'vitest';
import {FLEET_AGENTS} from './fleet';
import {allocateIdleBurrows,type IdleAssignments} from './idleBurrows';

it('splits every idle population from zero to eleven evenly without duplicating a rabbit',()=>{
  for(let count=0;count<=11;count++){
    const idle=FLEET_AGENTS.slice(0,count),result=allocateIdleBurrows(idle,{},.371);
    const first=Object.values(result).filter(room=>room==='sleep').length;
    expect(Object.keys(result)).toHaveLength(count);expect(Math.abs(first-(count-first))).toBeLessThanOrEqual(1);
    if(count===11)expect([first,count-first].sort()).toEqual([5,6]);
  }
});
it('randomizes identities with the session seed and is reproducible within that session',()=>{
  const one=allocateIdleBurrows(FLEET_AGENTS,{},.1),two=allocateIdleBurrows(FLEET_AGENTS,{},.9);
  expect(one).toEqual(allocateIdleBurrows(FLEET_AGENTS,{},.1));expect(one).not.toEqual(two);
});
it('retains each rabbit’s home across unchanged polling snapshots',()=>{
  const first=allocateIdleBurrows(FLEET_AGENTS,{},.4);
  expect(allocateIdleBurrows([...FLEET_AGENTS].reverse(),first,.8)).toEqual(first);
});
it('rebalances only one existing rabbit when an idle agent leaves the smaller den',()=>{
  const first=allocateIdleBurrows(FLEET_AGENTS,{},.6);
  const smaller=Object.values(first).filter(room=>room==='sleep').length===5?'sleep':'sleep-two';
  const leaving=FLEET_AGENTS.find(agent=>first[agent]===smaller)!;
  const remaining=FLEET_AGENTS.filter(agent=>agent!==leaving),next=allocateIdleBurrows(remaining,first,.6);
  expect(next[leaving]).toBeUndefined();expect(remaining.filter(agent=>next[agent]!==first[agent])).toHaveLength(1);
  expect(Object.values(next).filter(room=>room==='sleep')).toHaveLength(5);
});
it('drops old memberships and balances new arrivals without assigning active agents a sleeping room',()=>{
  const previous:IdleAssignments={Leveret:'sleep',Forge:'sleep-two'};
  const next=allocateIdleBurrows(['Forge','Atlas','Nexus'],previous,.3);
  expect(next.Leveret).toBeUndefined();expect(next.Forge).toBe('sleep-two');expect(Object.keys(next).sort()).toEqual(['Atlas','Forge','Nexus']);
});
