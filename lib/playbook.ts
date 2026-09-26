export type PlaybookRule={id:string;kind:'required'|'prohibited'|'preferred';phrase:string;alternative:string;reason:string};
export type Playbook={version:1;name:string;rules:PlaybookRule[]};
export type PlaybookFinding={rule:PlaybookRule;start:number;end:number;original:string;proposal:string;state:'missing'|'found'};
export function parsePlaybook(value:unknown):Playbook{
 const p=value as Playbook;if(!p||p.version!==1||typeof p.name!=='string'||!p.name.trim()||p.name.length>160||!Array.isArray(p.rules)||p.rules.length>100)throw Error('Manual de revisão inválido (máximo 100 regras).');
 const ids=new Set();for(const r of p.rules){if(!r||!['required','prohibited','preferred'].includes(r.kind)||typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id))throw Error('Regra inválida ou repetida.');ids.add(r.id);for(const key of ['phrase','alternative','reason'] as const)if(typeof r[key]!=='string'||r[key].length>4000)throw Error('Texto da regra inválido.');if(!r.phrase.trim()||!r.reason.trim())throw Error('Indique expressão e motivo de cada regra.');}
 return p;
}
export function applyPlaybook(text:string,book:Playbook):PlaybookFinding[]{
 if(text.length>60000)throw Error('Texto demasiado extenso.');parsePlaybook(book);const findings:PlaybookFinding[]=[];
 for(const rule of book.rules){let index=text.indexOf(rule.phrase);if(index<0&&rule.kind==='required')findings.push({rule,start:text.length,end:text.length,original:'',proposal:rule.alternative,state:'missing'});
  let count=0;while(index>=0&&count++<50){if(rule.kind!=='required')findings.push({rule,start:index,end:index+rule.phrase.length,original:rule.phrase,proposal:rule.alternative,state:'found'});index=text.indexOf(rule.phrase,index+rule.phrase.length);}
 }
 return findings;
}
export function acceptPlaybookFinding(text:string,f:PlaybookFinding){
 if(!f.proposal||f.state==='missing')throw Error('Cláusula ausente: escolha manualmente onde a inserir; não há substituição automática.');
 if(text.slice(f.start,f.end)!==f.original)throw Error('O texto mudou. Volte a executar a revisão antes de aplicar.');
 const next=text.slice(0,f.start)+f.proposal+text.slice(f.end);if(next.length>60000)throw Error('Limite de texto atingido.');return next;
}
