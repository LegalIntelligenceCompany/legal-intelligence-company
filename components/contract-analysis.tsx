"use client";
import { exportAnalysis } from "@/lib/report-export";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { analysisMessage, analysisStages, UUID_PATTERN, MAX_ANALYSIS_BYTES, type AnalysisStage, type AnalysisJob } from "@/lib/analysis";
import type { Contract } from "@/lib/documents";
import { COUNTRY_CODES, countryName, safeSourceUrl, TOPICS } from "@/lib/legal-research";

const severityLabels = { high: "Prioridade alta", medium: "Prioridade média", low: "Prioridade baixa" };
const categoryLabels = { policy_deviation: "Desvio da política", general_review: "Revisão geral", missing_clause: "Possível cláusula em falta", legal_issue: "Questão jurídica a rever" };
const temporalLabels = { current_indicated: "Vigência indicada pela pesquisa — conferir", historical: "Fonte histórica — confirmar aplicação temporal", unconfirmed: "Vigência/aplicabilidade por confirmar" };
const countryOptions = COUNTRY_CODES.map(code => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));

export function ContractAnalysis({ contract }: { contract: Contract }) {
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [jurisdiction, setJurisdiction] = useState("AUTO");
  const [copyMessage, setCopyMessage] = useState("");
  const [error, setError] = useState("");
  const [loadCode, setLoadCode] = useState("");
  const [now, setNow] = useState(Date.now());
  const [diagnostic, setDiagnostic] = useState<{ reference: string; stage: AnalysisStage } | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const url = `/api/analyse?contractId=${encodeURIComponent(contract.id)}&organizationId=${encodeURIComponent(contract.organization_id)}`;
  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();
      if (!mounted.current) return;
      if (!response.ok) { setJob(null); setConfigured(false); setLoadCode(data.code ?? "INTERNAL"); return; }
      setJob(data.job); setConfigured(data.configured); setLoadCode("");
      if (data.job?.status === "completed") { setError(""); setDiagnostic(null); }
    } catch { if (mounted.current) setLoadCode("INTERNAL"); }
    finally { if (mounted.current) { setLoading(false); setNow(Date.now()); } }
  }, [url]);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);
  const stale = job?.status === "processing" && new Date(job.lease_until).getTime() <= now;
  const processing = job?.status === "processing" && !stale;
  useEffect(() => {
    if (!busy && !processing) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [busy, processing, load]);

  async function analyse() {
    if (inFlight.current || !consent) return;
    const rerun = job?.status === "completed";
    if (rerun && !window.confirm("Criar nova análise com as políticas actuais e uma nova pesquisa jurídica na web? Isto tem novos custos de IA e pesquisa. O relatório anterior fica guardado na base de dados.")) return;
    inFlight.current = true; setBusy(true); setError(""); setDiagnostic(null);
    try {
      const response = await fetch("/api/analyse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: contract.id, organizationId: contract.organization_id, consent: true, researchConsent: true, jurisdiction, rerun }),
      });
      const result = await response.json();
      if (!response.ok && mounted.current) {
        setError(analysisMessage(result.code));
        if (typeof result.diagnostic?.reference === "string" && UUID_PATTERN.test(result.diagnostic.reference) && Object.hasOwn(analysisStages, result.diagnostic.stage)) {
          setDiagnostic({ reference: result.diagnostic.reference, stage: result.diagnostic.stage });
        }
      }
    } catch { if (mounted.current) setError("A ligação foi interrompida. Actualize o estado antes de tentar novamente: a análise pode continuar no servidor."); }
    finally {
      await load(); inFlight.current = false;
      if (mounted.current) { setBusy(false); setConsent(false); }
    }
  }
  const supported = contract.mime_type === "application/pdf" && !!contract.byte_size && contract.byte_size <= MAX_ANALYSIS_BYTES;
  const report = job?.status === "completed" ? job.report : null;
  return <section className="card team-panel" aria-labelledby="analysis-title">
    <div className="workspace-toolbar"><h2 id="analysis-title">Análise contratual</h2><span className="team-badge">Assistida por IA · revisão humana obrigatória</span></div>
    <p>Compara este PDF com as políticas activas e procura legislação, acórdãos e orientações relevantes na web. Apresenta fontes e propõe alterações para revisão. A pesquisa é limitada ao que conseguir encontrar e consultar — não cobre todo o direito nem substitui um jurista.</p>
    {loading && <p role="status">A verificar a análise…</p>}
    {loadCode && <p role="alert" className="workspace-error">{analysisMessage(loadCode)}</p>}
    {loadCode === "SETUP_REQUIRED" && <Link href="/setup/analysis" className="btn btn-primary">Preparar análise</Link>}
    {!loading && !loadCode && !configured && <p className="team-notice">{analysisMessage("NOT_CONFIGURED")} <Link href="/setup/analysis" className="btn btn-secondary">Ver instruções</Link></p>}
    {!supported && <p className="team-notice">{analysisMessage("UNSUPPORTED_FILE")}</p>}
    {(busy || processing) && <div className="team-notice" role="status"><strong>A analisar e pesquisar…</strong><p>O processo inclui identificar os temas, procurar fontes jurídicas e preparar as alterações propostas. Pode demorar alguns minutos. Não é necessário voltar a clicar; o estado actualiza-se automaticamente.</p></div>}
    {(error || stale || job?.status === "failed") && <div role="alert" className="workspace-error">
      <p>{error || analysisMessage(stale ? "TIMEOUT" : job?.error_code)}</p>
      {diagnostic && <p>Etapa: {analysisStages[diagnostic.stage]}.</p>}
      {(diagnostic?.reference || job?.id) && <p>Referência de diagnóstico: {diagnostic?.reference || job?.id}</p>}
      <p>Antes de repetir a análise, consulte o diagnóstico no Terminal. Uma nova tentativa pode ter custos.</p>
    </div>}
    {report && <div className="analysis-report">
      <button className="btn btn-secondary" onClick={() => { const url = URL.createObjectURL(new Blob([exportAnalysis(job!)], { type: "text/plain;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "analise-contratual-lic.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Exportar relatório completo (.txt)</button>
      <div className="workspace-row"><div className="eyebrow">Relatório guardado</div><p className="team-muted">{new Date(job!.created_at).toLocaleString("pt-PT")} · {job!.model} · {job!.policy_snapshot.length} política(s) nesta análise</p><p className="policy-text">{report.summary}</p></div>
      <p className="team-notice">As citações e páginas do PDF foram identificadas pela IA e devem ser conferidas no original. As citações das políticas foram comparadas com o texto guardado. Nenhum resultado garante que o contrato está livre de riscos.</p>
      {report.research ? <section className="workspace-row" aria-label="Âmbito da pesquisa jurídica">
        <h3>{report.research.status === "completed" ? "Pesquisa jurídica com fontes" : "Pesquisa jurídica incompleta"}</h3>
        <p className={report.research.status === "completed" ? "team-notice" : "workspace-error"}>{report.research.warning}</p>
        <p className="team-muted">Pesquisa em {new Date(report.research.researched_at).toLocaleString("pt-PT")} · Modelo: {report.research.model} · {report.research.search_calls} chamada(s) de pesquisa</p>
        <p><strong>Lei(s) investigada(s):</strong> {report.research.countries.length ? report.research.countries.map(countryName).join(", ") : "Não determinada"}. {report.research.jurisdiction_basis === "user" ? "Âmbito indicado pelo utilizador; sujeito à verificação das normas aplicáveis." : report.research.jurisdiction_basis === "contract" ? "Identificado pela IA a partir do contrato; confirmar." : "Precisa de esclarecimento."}</p>
        <p className="team-muted">Temas seleccionados: {report.research.topics.map(topic => TOPICS[topic]).join("; ")}. Direito regional, datas dos factos e normas imperativas podem exigir pesquisa adicional.</p>
      </section> : <p className="team-notice">Este relatório é anterior à pesquisa jurídica na web. Crie uma nova análise para procurar legislação e jurisprudência.</p>}
      {report.limitations.length > 0 && <div className="workspace-row"><h3>Limitações e pontos a confirmar</h3><ul>{report.limitations.map((item, index) => <li key={index} className="policy-text">{item}</li>)}</ul></div>}
      <div className="workspace-row"><h3>{report.findings.length} ponto(s) de revisão</h3>{report.findings.length === 0 && <p>Não foram identificados pontos específicos nesta análise. Isto não equivale a aprovação jurídica.</p>}</div>
      {report.findings.map((finding, index) => {
        const policy = job!.policy_snapshot.find(item => item.id === finding.policy_id);
        return <article key={index} className={`analysis-finding analysis-${finding.severity}`}>
          <div className="workspace-toolbar"><span className="team-badge">{severityLabels[finding.severity]}</span><span className="team-muted">{categoryLabels[finding.category]}</span></div>
          <h3>{finding.title}</h3><p className="policy-text">{finding.detail}</p>
          {finding.contract_quote && <><h4>Trecho do contrato{finding.page ? ` · página ${finding.page}` : " · página não identificada"}</h4><blockquote className="policy-text">{finding.contract_quote}</blockquote></>}
          {policy && <><h4>Política: {policy.title}</h4><blockquote className="policy-text">{finding.policy_quote}</blockquote></>}
          <h4>Sugestão para revisão</h4><p className="policy-text">{finding.recommendation}</p>
          {!!finding.legal_basis?.length && <div className="legal-basis"><h4>Fundamentação e aplicabilidade</h4>{finding.legal_basis.map((basis, basisIndex) => {
            const source = report.research?.sources.find(item => item.id === basis.source_id && item.cited);
            const url = source ? safeSourceUrl(source.url) : null;
            return <div key={basisIndex} className="workspace-row"><p><strong>{basis.reference}</strong>{source && url && <> · <a className="source-link" href={url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.title} ↗</a></>}</p><p className="policy-text">{basis.applicability}</p><p className="team-muted">{temporalLabels[basis.temporal_status]}: {basis.temporal_note}</p></div>;
          })}</div>}
          {finding.proposed_wording && <div className="proposed-wording"><h4>Redacção alternativa proposta — sujeita a revisão</h4><p className="policy-text">{finding.proposed_wording}</p><button className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(finding.proposed_wording!); setCopyMessage(`Proposta ${index + 1} copiada. Confirme os termos antes de a utilizar.`); } catch { setCopyMessage("Não foi possível copiar automaticamente. Seleccione a proposta e use ⌘ + C."); } }}>Copiar proposta</button></div>}
        </article>;
      })}
      {copyMessage && <p role="status" className="team-notice">{copyMessage}</p>}
      {!!report.research?.sources.length && <section className="workspace-row" aria-label="Fontes da pesquisa"><h3>Fontes devolvidas pela pesquisa</h3><p className="team-muted">Um link encontrado não prova, por si só, a vigência da norma nem a sua aplicação ao contrato. As classificações abaixo indicam apenas a origem e utilização na pesquisa.</p><ul className="research-sources">{report.research.sources.map(source => {
        const url = safeSourceUrl(source.url); if (!url) return null;
        return <li key={source.id}><a className="source-link" href={url} target="_blank" rel="noopener noreferrer">[{source.id}] {source.title} ↗</a><p className="team-muted">{new URL(url).hostname} · {source.official_domain ? "Domínio oficial identificado" : "Natureza da fonte por confirmar"} · {source.cited ? "Citada na síntese de pesquisa" : "Devolvida pelo motor; não usada como fundamento"}</p></li>;
      })}</ul></section>}
      <details className="workspace-row"><summary>Políticas usadas nesta versão</summary><p className="team-muted">Alterações posteriores às políticas não modificam este relatório. Para as considerar, crie uma nova análise.</p>{job!.policy_snapshot.length === 0 ? <p>Não existiam políticas activas.</p> : job!.policy_snapshot.map(policy => <details key={policy.id}><summary>{policy.title} · {new Date(policy.updated_at).toLocaleString("pt-PT")}</summary><p className="policy-text">{policy.content}</p></details>)}</details>
    </div>}
    {!loading && !loadCode && configured && supported && contract.status === "uploaded" && !busy && !processing && <div className="workspace-row">
      <label htmlFor="analysis-jurisdiction">País da lei aplicável</label><select id="analysis-jurisdiction" value={jurisdiction} onChange={event => { setJurisdiction(event.target.value); setConsent(false); }}><option value="AUTO">Identificar no contrato (se estiver expresso)</option>{countryOptions.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select>
      <p className="team-muted">Indique a lei aplicável, não apenas o país da empresa. Se a IA não a conseguir identificar com segurança, pedirá esclarecimento no relatório. O direito da UE será considerado quando relevante.</p>
      <label className="analysis-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>Autorizo o envio deste contrato e das políticas à OpenAI, e a pesquisa web de temas jurídicos genéricos através dos seus fornecedores de pesquisa. Confirmo que posso partilhar os dados e aceito os custos de IA e pesquisa na conta API.</span></label>
      <p className="team-muted">A pesquisa recebe apenas países e temas de uma lista controlada, não o PDF, cláusulas ou nomes. O pedido usa store:false, que não garante retenção zero pelo fornecedor. Limite: 20 tentativas por empresa em 24 horas; uma de cada vez. As alterações propostas não são aplicadas ao documento.</p>
      <button className="btn btn-primary" disabled={!consent} onClick={analyse}>{report ? "Criar nova análise" : job ? "Tentar análise novamente" : "Analisar contrato"}</button>
    </div>}
    <div className="workspace-toolbar" style={{ marginTop: 20 }}><button className="btn btn-secondary" disabled={loading} onClick={() => { setError(""); setDiagnostic(null); void load(); }}>Actualizar estado</button><Link href="/policies" className="btn btn-secondary">Ver políticas</Link></div>
  </section>;
}
