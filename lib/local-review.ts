export const LOCAL_TEXT_LIMIT = 40000;
export type Candidate = {start:number;end:number;value:string;kind:string;replacement:string};
export function findPersonalData(text:string, terms:string[] = []): Candidate[] {
  if(text.length>LOCAL_TEXT_LIMIT || terms.length>50 || terms.some(t=>t.length>200)) throw Error('Limites: 40 000 caracteres e 50 termos de até 200 caracteres.');
  const found: Omit<Candidate,'replacement'>[]=[];
  const patterns: [string,RegExp][] = [
    ['EMAIL', /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}.-]{1,253}\.[\p{L}]{2,63}/gu],
    ['IBAN', /\bPT\d{2}(?:[ -]?\d){21}\b/gi],
    ['IDENTIFICADOR', /(?<![\p{L}\p{N}])(?:\+351[ -]?)?\d{3}[ -]?\d{3}[ -]?\d{3}(?![\p{L}\p{N}])/gu],
  ];
  for(const [kind,pattern] of patterns) for(const match of text.matchAll(pattern)) found.push({start:match.index,end:match.index+match[0].length,value:match[0],kind});
  for(const term of new Set(terms.map(t=>t.trim()).filter(Boolean))) {
    // Literal, case-sensitive terms: no user-supplied regular expressions.
    let pos=0; while((pos=text.indexOf(term,pos))!==-1){found.push({start:pos,end:pos+term.length,value:term,kind:'TERMO'});pos+=term.length;if(found.length>5000)throw Error('Demasiadas ocorrências. Divida o texto.');}
  }
  found.sort((a,b)=>a.start-b.start || b.end-a.end);
  const result:Candidate[]=[],labels=new Map<string,string>();
  for(const c of found){if(result.length&&c.start<result[result.length-1].end)continue;const key=c.kind+':'+c.value; if(!labels.has(key))labels.set(key,`[${c.kind}_${labels.size+1}]`);result.push({...c,replacement:labels.get(key)!});}
  if(result.length>500)throw Error('Mais de 500 ocorrências. Divida o texto antes de rever.');
  return result;
}
export function replaceCandidates(text:string,candidates:Candidate[]):string {
  let out='',last=0;
  for(const c of [...candidates].sort((a,b)=>a.start-b.start)){
    if(c.start<last||c.end<=c.start||text.slice(c.start,c.end)!==c.value)throw Error('O texto mudou. Repita a revisão.');
    out+=text.slice(last,c.start)+c.replacement;last=c.end;
  }
  return out+text.slice(last);
}
export type DiffLine = {kind:'same'|'added'|'removed';text:string};
/** Bounded line LCS. Preserves duplicates, whitespace and order; not a legal analysis. */
export function compareLegalTexts(before:string,after:string):DiffLine[] {
  if(before.length>LOCAL_TEXT_LIMIT||after.length>LOCAL_TEXT_LIMIT)throw Error('Cada texto pode ter até 40 000 caracteres.');
  const a=before.replace(/\r\n?/g,'\n').split('\n'),b=after.replace(/\r\n?/g,'\n').split('\n');
  if(a.length>600||b.length>600)throw Error('Cada versão pode ter até 600 linhas. Compare por artigo ou capítulo.');
  const matrix=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)matrix[i][j]=a[i]===b[j]?1+matrix[i+1][j+1]:Math.max(matrix[i+1][j],matrix[i][j+1]);
  const out:DiffLine[]=[];let i=0,j=0;
  while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){out.push({kind:'same',text:a[i++]});j++;}else if(i<a.length&&(j===b.length||matrix[i+1][j]>=matrix[i][j+1]))out.push({kind:'removed',text:a[i++]});else out.push({kind:'added',text:b[j++]});}
  return out;
}
