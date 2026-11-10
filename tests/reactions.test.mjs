import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupReactions,reactionIdentities} from '../src/lib/reactions.ts';
const reaction=(reactionType,id,displayName,extra={})=>({reactionType,user:{user:{id,displayName}},...extra});
test('legacy likes and Unicode skin/presentation variants group with accurate unique-user counts',()=>{
 const groups=groupReactions([reaction('like','a','Alex'),reaction('👍🏻','b','Blair'),reaction('👍','ME','Me'),reaction('like','a','Alex')],{},'me');
 assert.equal(groups.length,1);assert.equal(groups[0].count,3);assert.equal(groups[0].emoji,'👍');assert.equal(groups[0].label,'Like');assert.equal(groups[0].mine,true);assert.deepEqual(groups[0].people,['You','Alex','Blair']);
});
test('heart aliases normalize and separate reaction types remain separate',()=>{
 const groups=groupReactions([reaction('heart','a','Alex'),reaction('❤️','b','Blair'),reaction('🔥','c','Casey')]);
 assert.equal(groups.length,2);assert.equal(groups.find(g=>g.label==='Heart').count,2);assert.equal(groups.find(g=>g.label==='Heart').emoji,'❤️');assert.equal(groups.find(g=>g.label==='Fire').count,1);
});
test('exact cached identities resolve names without showing raw IDs or merging tenants',()=>{
 const groups=groupReactions([reaction('like','id',null,{user:{user:{id:'id',tenantId:'first'}}}),reaction('like','id',null,{user:{user:{id:'id',tenantId:'second'}}})],{'first:id':'Alex','second:id':'Blair'});
 assert.deepEqual(groups[0].people,['Alex','Blair']);assert.equal(groups[0].count,2);
});
test('missing people remain distinct neutral participants and application identities are not guessed',()=>{
 const rows=[{reactionType:'like',user:null},{reactionType:'like',user:{application:{id:'private-id',displayName:'Bot'}}}];
 assert.deepEqual(groupReactions(rows)[0].people,['Participant unavailable','Participant unavailable']);assert.deepEqual(reactionIdentities(rows),[]);
});
test('custom and unknown reactions use text-only fallbacks and preserve distinct custom types',()=>{
 const groups=groupReactions([reaction('custom','a','Alex',{displayName:'Team logo',reactionContentUrl:'https://example.invalid/a'}),reaction('custom','b','Blair',{displayName:'Other logo',reactionContentUrl:'https://example.invalid/b'}),reaction('constructor','c','Casey')]);
 assert.equal(groups.length,3);assert.equal(groups.find(g=>g.label==='Reaction').emoji,'◇');assert.equal(groups.filter(g=>g.emoji==='✦').length,2);
});
test('empty, malformed, reordered and removed reaction lists are safe and deterministic',()=>{
 for(const value of [undefined,null,{},'like',[],[null,{},'👍']])assert.deepEqual(groupReactions(value),[]);
 const rows=[reaction('heart','b','Blair'),reaction('like','a','Alex')];assert.deepEqual(groupReactions(rows),groupReactions([...rows].reverse()));
 assert.deepEqual(groupReactions([]),[]);assert.deepEqual(reactionIdentities(rows).map(p=>p.id),['b','a']);
});
