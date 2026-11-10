import {test} from 'node:test';
import assert from 'node:assert/strict';
import {directoryRows,directoryKey,filterPeople} from '../src/lib/people.ts';
test('directory cache allowlists profile fields and bounds phone values',()=>{
 assert.deepEqual(directoryRows(null),[]);
 const rows=directoryRows([{id:'a',displayName:'Alex',secret:'omit',businessPhones:['123',42],department:'IT'},null,{id:2}]);
 assert.deepEqual(rows,[{id:'a',displayName:'Alex',department:'IT',businessPhones:['123']}]);
 assert.notEqual(directoryKey('a'),directoryKey('b'));assert.equal(directoryKey('A'),directoryKey('a'));
});
test('directory filters role, department and email, sorts without mutating roster',()=>{
 const rows=[{id:'b',displayName:'Blair',department:'Finance',mail:'blair@example.com'},{id:'a',displayName:'Alex',department:'IT',jobTitle:'Engineer'}];
 assert.equal(filterPeople(rows,'engineer','','az')[0].id,'a');
 assert.equal(filterPeople(rows,'','Finance','az')[0].id,'b');
 assert.equal(filterPeople(rows,'EXAMPLE','','az')[0].id,'b');
 assert.deepEqual(filterPeople(rows,'','','az').map(p=>p.id),['a','b']);
 assert.deepEqual(filterPeople(rows,'','','za').map(p=>p.id),['b','a']);assert.equal(rows[0].id,'b');
});
