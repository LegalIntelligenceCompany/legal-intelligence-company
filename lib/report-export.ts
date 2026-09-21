import type { AnalysisJob } from "./analysis";
export function exportAnalysis(job: AnalysisJob) {
  if (!job.report || job.status !== "completed") return "";
  const r = job.report;
  return ["LEGAL INTELLIGENCE COMPANY — RELATÓRIO DE APOIO À REVISÃO", `Gerado: ${job.created_at}`, "Revisão humana obrigatória. Não constitui aprovação ou aconselhamento jurídico.", "", r.summary,
    "", "LIMITAÇÕES", ...r.limitations,
    ...r.findings.flatMap((f, i) => ["", `${i + 1}. ${f.title} (${f.severity})`, f.detail, `Recomendação: ${f.recommendation}`, `Excerto: ${f.contract_quote ?? "Não identificado"}`, `Página: ${f.page ?? "A confirmar"}`, `Política: ${f.policy_quote ?? "Não indicada"}`, `Redacção proposta: ${f.proposed_wording ?? "Não indicada"}`, ...(f.legal_basis ?? []).map(b => `${b.reference}: ${b.applicability} (${b.temporal_note})`)]),
    "", "FONTES — CONFIRMAR VIGÊNCIA E APLICABILIDADE", r.research?.warning ?? "Sem pesquisa jurídica registada.", ...(r.research?.sources ?? []).map(s => `[${s.id}] ${s.title}: ${s.url}`),
    "", "POLÍTICAS CONSIDERADAS", ...job.policy_snapshot.map(p => `${p.title}\n${p.content}`),
  ].join("\n");
}
