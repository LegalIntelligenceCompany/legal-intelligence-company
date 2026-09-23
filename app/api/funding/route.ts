import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {paidAIAccessError} from '@/lib/billing-access';
import {commercialMeterEnabled,commercialWallets,meterConfiguration,meterMessages,meterServices,type MeterService} from '@/lib/commercial-meter';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 try{
  const client=await createClient(true),auth=await client?.auth.getUser();
  if(!auth?.data.user||auth.error)return NextResponse.json({error:'Entre na sua conta.'},{status:401,headers});
  if(process.env.AI_EXECUTION_ENABLED!=='true')throw Error('METER_SETUP');
  if(!paidAIAccessError(auth.data.user))return NextResponse.json({mode:'pilot',wallets:[],ceiling:0},{headers});
  const service=new URL(request.url).searchParams.get('service') as MeterService;
  if(!meterServices.includes(service)||!commercialMeterEnabled())throw Error('METER_SETUP');
  const admin=createAdminClient();if(!admin)throw Error('METER_SETUP');
  const {ceiling}=meterConfiguration(service);
  return NextResponse.json({mode:'commercial',wallets:await commercialWallets(admin,auth.data.user.id),ceiling},{headers});
 }catch(error){const code=error instanceof Error?error.message:'METER_SETUP';return NextResponse.json({error:meterMessages[code]||meterMessages.METER_SETUP},{status:503,headers});}
}
