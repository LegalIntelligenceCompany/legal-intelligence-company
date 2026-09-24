import 'server-only';
import {createClient} from '@/lib/supabase/server';
export async function isSiteOwner() {
 try {
 const client=await createClient();
 const {data,error}=client?await client.auth.getUser():{data:{user:null},error:null};
 const email=(process.env.BILLING_TEST_EMAIL||'').trim().toLowerCase();
 return !error && !!email && !!data.user?.email_confirmed_at && data.user.email?.toLowerCase()===email;
 } catch {return false;}
}
