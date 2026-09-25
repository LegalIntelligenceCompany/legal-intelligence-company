import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { workflows } from '@/lib/services';
const localServices = [
 ['/word-review','Revisão em Word','Compare textos e exporte inserções e eliminações controladas num DOCX. Sem IA; não preserva a formatação de ficheiros originais.'],
 ['/quality-review','Avaliação humana de respostas','Registe fontes, erros, vigência, tempo e custo. Exporte ou guarde a avaliação no seu dossier privado.'],
 ['/clauses','Biblioteca de cláusulas','Guarde versões, contexto de utilização e aprovação pessoal. Sem IA.'],
 ['/anonymize','Anonimização assistida','Detecte padrões de dados pessoais e escolha substituições. Processamento local com revisão humana.'],
 ['/legislation-compare','Comparar versões legislativas','Compare dois textos com fontes e datas indicadas por si. Diferenças literais, sem confirmar vigência.'],
];
export default function Services() { return <AppShell><h1>Serviços jurídicos</h1><p>Ferramentas de apoio à pesquisa, estudo e trabalho. Resultados sujeitos a revisão humana. IA sujeita a autorização e orçamento de teste.</p><p><Link href="/setup/pilot">Consultar orçamento do piloto</Link></p><div className="service-grid">{localServices.map(([href,title,description])=><article className="card team-panel" key={href}><h2>{title}</h2><p>{description}</p><Link className="btn btn-primary" href={href}>Abrir</Link></article>)}<article className="card team-panel"><h2>Transcrição de áudio</h2><p>Ouça, transcreva e exporte para revisão. No piloto económico, carregue um WAV PCM até 60 segundos; a gravação directa não está disponível neste teste.</p><Link className="btn btn-primary" href="/transcription">Abrir</Link></article>{Object.entries(workflows).map(([id,w])=><article className="card team-panel" key={id}><h2>{w.title}</h2><p>{w.description}</p><Link className="btn btn-primary" href={id==='watch'?'/alerts':`/services/${id}`}>Abrir</Link></article>)}<article className="card team-panel"><h2>Dossiers de pesquisa</h2><p>Guarde notas, relatórios e fontes e exporte o seu trabalho.</p><Link className="btn btn-primary" href="/library">Abrir dossiers</Link></article></div></AppShell>; }
