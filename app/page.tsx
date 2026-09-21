import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";
import { Icon } from "@/components/icons";

const services = [
  ["Pesquisa jurídica", "Pesquise legislação e jurisprudência disponíveis na web, com fontes para consultar e limites de vigência explicitados.", "/chat", "Abrir chat jurídico"],
  ["Estudo e ensino", "Explore conceitos, organize perguntas e peça explicações adaptadas a estudantes e professores.", "/chat", "Começar uma pesquisa"],
  ["Análise de contratos", "Compare contratos com as políticas da empresa, investigue questões jurídicas e reveja propostas de redacção.", "/contracts", "Abrir contratos"],
  ["Comparação de versões", "Identifique adições, remoções e alterações de sentido entre dois PDFs, com excertos para revisão.", "/tools", "Comparar documentos"],
  ["Perguntas aos documentos", "Interrogue um PDF privado e obtenha respostas com excertos e páginas, quando identificáveis.", "/tools", "Consultar um documento"],
  ["Obrigações e prazos", "Extraia obrigações e datas. Após confirmação, exporte lembretes para o seu calendário e relatórios em texto.", "/tools", "Explorar prazos"],
];
export default function Home() {
  return <main><MarketingNav/>
    <section className="shell home-hero">
      <div><div className="eyebrow">Inteligência artificial aplicada ao direito</div><h1 className="hero-title">Direito mais claro.<br/>Decisões mais informadas.</h1><p className="hero-description">Uma plataforma para pesquisar, estudar e trabalhar com o direito. Para advogados, estudantes, professores, empresas e quem procura compreender melhor uma questão jurídica.</p><div className="workspace-toolbar"><Link href="/chat" className="btn btn-primary">Abrir chat jurídico <Icon name="arrow" size={16}/></Link><Link href="/contracts" className="btn btn-secondary">Analisar contratos</Link></div><p className="assistant-small">Pesquisa com fontes · Documentos privados · Revisão humana necessária</p></div>
      <div className="card hero-preview"><div className="preview-label">EXEMPLO ILUSTRATIVO · CHAT JURÍDICO</div><h2>Por onde começar a pesquisar?</h2><div className="preview-question">Quero compreender uma cláusula contratual e encontrar fontes relevantes.</div><p>Comece pelo contexto: qual é a jurisdição, o tipo de contrato e a questão que pretende esclarecer?</p><div className="preview-step"><strong>01</strong><span>Formule a questão jurídica</span></div><div className="preview-step"><strong>02</strong><span>Consulte legislação e jurisprudência</span></div><div className="preview-step"><strong>03</strong><span>Verifique a vigência e a aplicabilidade</span></div><p className="assistant-small">O chat pesquisa o que conseguir encontrar e consultar. Não cobre todo o direito nem substitui um jurista.</p><Link href="/chat" className="source-link">Fazer a minha pergunta →</Link></div>
    </section>
    <section id="como-funciona" className="home-services"><div className="shell"><div className="eyebrow">Uma plataforma, vários serviços</div><h2>Da investigação à revisão documental.</h2><div className="service-grid">{services.map(([title, description, href, label], i) => <article className="card service-card" key={title}><span className="service-number">0{i + 1}</span><h3>{title}</h3><p>{description}</p><Link className="btn btn-secondary" href={href}>{label}</Link></article>)}</div></div></section>
    <section id="seguranca" className="shell home-security"><Icon name="shield" size={30}/><div><h2>Pesquisa pública. Documentos privados.</h2><p>O chat jurídico não exige uma empresa. Os documentos são acessíveis apenas aos membros autorizados da organização. A partilha com a IA exige consentimento; nunca coloque dados confidenciais na pesquisa pública.</p><p>Fontes citadas não são uma garantia de correcção jurídica. Confirme o texto original, a versão aplicável e as conclusões antes de agir.</p></div></section>
    <footer className="shell home-footer">© 2026 Legal Intelligence Company. Informação e apoio à revisão — não constitui aconselhamento jurídico.</footer>
  </main>;
}
