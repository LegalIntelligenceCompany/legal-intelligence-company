import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { BillingSettingsLink } from "@/components/billing-settings-link";
export default function Settings() {
  return <AppShell><div className="eyebrow">Conta</div><h1 className="workspace-title">Definições</h1><section className="card team-panel"><h2>Integrações</h2><p>O Supabase guarda as contas e os documentos privados. A OpenAI recebe o contrato e as políticas apenas quando autoriza uma análise. Configure as chaves privadas no servidor, nunca nesta página ou num comentário.</p><div className="workspace-toolbar"><Link href="/setup/documents" className="btn btn-secondary">Preparar documentos</Link><Link href="/setup/analysis" className="btn btn-primary">Preparar análise com IA</Link><BillingSettingsLink /></div></section></AppShell>;
}
