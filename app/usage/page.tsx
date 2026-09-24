import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
const euros=(n:number)=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n/100);
export default async function Usage(){
 const client=await createClient();const auth=client?await client.auth.getUser():null;const user=auth?.data.user;
 if(!user||auth?.error||!user.email_confirmed_at)return <AppShell><h1>Histórico de consumo</h1><Link className="btn btn-primary" href="/login?next=/usage">Entrar para consultar</Link></AppShell>;
 const admin=createAdminClient();
 const result=admin?await admin.from('ai_meter_requests').select('id,state,ceiling_cents,actual_cents,created_at').eq('actor_id',user.id).order('created_at',{ascending:false}).limit(100):null;
 return <AppShell><h1>O meu consumo</h1><section className="card team-panel"><p>Últimos 100 pedidos comerciais efectuados por esta conta, incluindo pedidos com carteira partilhada. Não inclui o orçamento do piloto nem constitui uma factura.</p>{!result||result.error?<p role="alert">Não foi possível consultar o histórico. Isto não significa que o saldo seja zero.</p>:!result.data.length?<p>Ainda não existem pedidos comerciais registados nesta conta.</p>:<ul>{result.data.map(row=><li key={row.id}><p><strong>{row.state==='settled'?'Débito confirmado':'Reserva por reconciliar'}</strong> · {new Date(row.created_at).toLocaleString('pt-PT',{timeZone:'Europe/Lisbon'})}</p><p>Reserva máxima: {euros(row.ceiling_cents)} · Débito: {row.actual_cents===null?'a confirmar':euros(row.actual_cents)}</p><small>Referência: {row.id}</small></li>)}</ul>}<p>Uma reserva pendente não deve ser reenviada nem tratada como consumo gratuito. O acerto depende da confirmação do fornecedor.</p><Link href="/credits">Voltar aos planos e créditos</Link></section></AppShell>;
}
