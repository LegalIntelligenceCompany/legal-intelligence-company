import type {AssistantResult} from '@/lib/assistant';
import {safeSourceUrl} from '@/lib/legal-research';
export function ClaimEvidencePanel({result}:{result:AssistantResult}){
 if(!result.evidence?.length&&!result.originals?.length)return null;
 return <section className="evidence-panel"><h3>Conferência com excertos originais</h3><p>A presença literal é conferida por código; a avaliação de suporte é uma apreciação da IA, não uma certificação jurídica. Fragmentos podem omitir excepções, alterações e contexto.</p>
 {result.evidence?.map((e,i)=><details key={i}><summary>Bloco {e.block} — {e.heading||'Fundamento'} · {!e.literalMatch?'Excerto não confirmado':e.assessment==='contradicts'?'Possível contradição':e.assessment==='supports'?'Suporte indicado pela IA':'Fundamento insuficiente'}</summary><p>{e.literalMatch?'Texto localizado no fragmento recuperado.':'Não foi localizada uma correspondência literal. Não use como citação verificada.'}</p>{e.quote&&<blockquote>{e.quote}</blockquote>}{safeSourceUrl(e.url)&&<a target="_blank" rel="noopener noreferrer" href={e.literalMatch?e.url.split('#')[0]+'#:~:text='+encodeURIComponent(e.quote):e.url}>Abrir passagem no original (quando suportado)</a>}</details>)}
 {result.originals?.map(o=><details key={o.sourceId}><summary>Fragmento recuperado: {o.title}</summary><p>Consultado em {o.retrievedAt}. {o.truncated?'Conteúdo parcial.':''}</p><pre className="readable-pre">{o.text}</pre><p className="assistant-small">SHA-256 do texto extraído: {o.sha256}. Identifica a captura, não certifica autenticidade ou vigência.</p></details>)}
 </section>;
}
