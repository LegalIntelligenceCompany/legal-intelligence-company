import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import {AccountPanel} from '@/components/account-panel';
import {isSiteOwner} from '@/lib/site-owner';
export const dynamic='force-dynamic';
export default async function Settings() {
 return <AppShell><h1>Definições da conta</h1><AccountPanel/>{await isSiteOwner()&&<section className="card team-panel"><h2>Administração — apenas titular</h2><p>Estas opções não são apresentadas aos clientes.</p><div className="workspace-toolbar"><Link href="/setup/launch">Preparar lançamento</Link><Link href="/setup/models">Modelos</Link><Link href="/setup/assistant">Instalar limites do assistente</Link><Link href="/setup/reconciliation">Rever reservas</Link><Link href="/setup/pilot">Orçamento do piloto</Link></div></section>}</AppShell>;
}
