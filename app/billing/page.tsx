import { AppShell } from "@/components/app-shell";
import { BillingPanel } from "@/components/billing-panel";
export const metadata = { title: "Pagamentos de teste | Legal Intelligence Company", robots: { index: false, follow: false } };
export default function BillingPage() {
  return <AppShell><div className="eyebrow">Configuração · apenas teste</div><h1 className="workspace-title">Pagamentos</h1><BillingPanel /></AppShell>;
}
