'use server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {runClaudePilot} from '@/lib/claude-pilot';
import {pilotMessages} from '@/lib/ai-pilot';
export async function testClaude(consent:boolean){
 try{
  const client=await createClient();const user=(await client?.auth.getUser())?.data.user;
  const admin=createAdminClient();if(!user||!admin)return 'Entre com a conta de teste autorizada.';
  return await runClaudePilot(admin,user,consent===true);
 }catch(error){
  const code=error instanceof Error?error.message:'';
  if(code==='PILOT_SETUP')return 'Falta preparar o teste Claude (SQL 017), a chave ou os interruptores do piloto. Não foi iniciada geração.';
  if(code==='CLAUDE_UNCERTAIN')return 'A tentativa não ficou concluída. Pode ter tido custos. A reserva mantém-se e não será repetida. Consulte o resultado guardado nesta página após actualizar.';
  return pilotMessages[code]||'Não foi possível confirmar o acesso ao modelo. O teste não foi iniciado.';
 }
}
