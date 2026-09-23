'use server';
import {createClient} from '@/lib/supabase/server';
import {isBillingTester} from '@/lib/billing';
import {reviewerCatalogue,reviewerKey} from '@/lib/reviewer-catalogue';
import {checkExternalModel} from '@/lib/external-review';

export async function verifyModelAccess(id:string):Promise<string>{
 const client=await createClient();const user=(await client?.auth.getUser())?.data.user;
 if(!user?.email_confirmed_at||!isBillingTester(user.email,(process.env.BILLING_TEST_EMAIL||'').trim().toLowerCase()))return 'Verificação reservada ao titular. Entre novamente.';
 try{
  const model=reviewerCatalogue().find(row=>row.id===id);
  if(!model||!process.env[reviewerKey(model.provider)])return 'Modelo ou chave não configurados.';
  await checkExternalModel(model);
  return 'Acesso confirmado ao identificador deste modelo. Não foi gerada nenhuma resposta. Compatibilidade, qualidade e tarifas continuam por validar; o modelo não foi activado.';
 }catch{
  return 'Não foi possível confirmar o acesso. Verifique o identificador do modelo e as permissões da chave no fornecedor. Uma falha de ligação também pode causar este resultado. Não foi gerada nenhuma resposta nem alterada a configuração.';
 }
}
