import {AppShell} from '@/components/app-shell';
import {isSiteOwner} from '@/lib/site-owner';
import {createAdminClient} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export default async function Reconciliation(){
 if(!await isSiteOwner())return null;
 const admin=createAdminClient();
 const result=admin?await admin.from('ai_meter_requests').select('id,actor_id,ceiling_cents,created_at').eq('state','reserved').order('created_at',{ascending:true}).limit(100):null;
 return <AppShell><h1>Reservas por reconciliar</h1><section className="card team-panel"><p>Consulta apenas. Não chama modelos, não altera saldos e não liberta reservas automaticamente.</p>{!result||result.error?<p role="alert">Não foi possível consultar as reservas.</p>:!result.data.length?<p>Não existem reservas comerciais pendentes.</p>:<ul>{result.data.map(row=><li key={row.id}><p><strong>{row.id}</strong></p><p>Conta: {row.actor_id} · Máximo: {(row.ceiling_cents/100).toFixed(2)} € · {new Date(row.created_at).toLocaleString('pt-PT',{timeZone:'Europe/Lisbon'})}</p></li>)}</ul>}<h2>Como resolver sem cobrar duas vezes</h2><ol><li>Localizar o pedido pelo identificador nos registos do servidor e os recibos das suas etapas.</li><li>Confirmar o consumo com o fornecedor. Um erro de ligação não prova ausência de consumo.</li><li>Quando todos os recibos estiverem presentes, utilizar o mecanismo existente de acerto idempotente. Nunca editar directamente o saldo nem reenviar a geração.</li><li>Se faltar confirmação, manter a reserva identificada para investigação e informar o cliente.</li></ol><p>Esta lista apresenta no máximo as 100 reservas mais antigas. A reconciliação de consumos incertos exige verificação, não uma estimativa apresentada como custo real.</p></section></AppShell>;
}
