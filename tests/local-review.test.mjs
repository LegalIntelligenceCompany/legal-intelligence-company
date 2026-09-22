import test from 'node:test';
import assert from 'node:assert/strict';
import {findPersonalData,replaceCandidates,compareLegalTexts} from '../lib/local-review.ts';
import {readClause} from '../lib/clauses.ts';
test('anonymization detects patterns and literal custom terms with stable placeholders',()=>{
 const text='Ana: ana@example.pt; 912 345 678; PT50 0002 0123 1234 5678 9015 4. Ana';
 const c=findPersonalData(text,['Ana']);
 assert.equal(c.length,5);assert.equal(c[0].replacement,c.at(-1).replacement);
 const out=replaceCandidates(text,c);assert.ok(!out.includes('ana@example.pt'));assert.ok(!out.includes('912'));assert.ok(!out.includes('Ana'));assert.ok(out.includes('[IBAN_'));
 assert.equal(replaceCandidates(text,[]),text);
});
test('overlaps do not corrupt text; only confirmed selections are replaced',()=>{
 const text='Ana Silva: ana@example.pt';const c=findPersonalData(text,['Ana','Ana Silva','ana@example.pt']);
 assert.equal(c[0].value,'Ana Silva');assert.equal(c.length,2);
 assert.match(replaceCandidates(text,[c[0]]),/ana@example.pt/);
 assert.throws(()=>replaceCandidates('alterado',c));
 assert.equal(findPersonalData('<script>x</script>',[]).length,0);
});
test('anonymization is bounded, treats metacharacters literally and does not infer names',()=>{
 assert.throws(()=>findPersonalData('x'.repeat(40001)));assert.throws(()=>findPersonalData('x',Array(51).fill('x')));
 assert.equal(findPersonalData('João Silva').length,0);
 assert.equal(findPersonalData('a.*b',['.*'])[0].value,'.*');
 assert.throws(()=>findPersonalData('ana@b.pt '.repeat(501)));
});
test('legislative diff preserves duplicate lines, order, whitespace and Unicode',()=>{
 const result=compareLegalTexts('Artigo 1\nA\nA\nFim','Artigo 1\nA\nB\nFim');
 assert.deepEqual(result.filter(x=>x.kind==='removed').map(x=>x.text),['A']);
 assert.deepEqual(result.filter(x=>x.kind==='added').map(x=>x.text),['B']);
 for(const [a,b] of [['á\nβ','β\ná'],[' a','a'],['a\r\nb','a\nb'],['','novo']]){
 const d=compareLegalTexts(a,b);assert.equal(d.filter(x=>x.kind!=='added').map(x=>x.text).join('\n'),a.replace(/\r\n?/g,'\n'));assert.equal(d.filter(x=>x.kind!=='removed').map(x=>x.text).join('\n'),b);
 }
 assert.throws(()=>compareLegalTexts('x'.repeat(40001),''));assert.throws(()=>compareLegalTexts('x\n'.repeat(600),''));
});
test('clause versions parse explicit personal approval only, old text remains draft',()=>{
 assert.equal(readClause('Aprovada').approved,false);
 assert.equal(readClause('{"approved":true}').approved,false);
 const v={type:'lic-clause-v1',text:'cláusula',usage:'contexto',approved:true};assert.equal(readClause(JSON.stringify(v)).approved,true);
 assert.equal(readClause(JSON.stringify({...v,approved:'true'})).approved,false);
});
