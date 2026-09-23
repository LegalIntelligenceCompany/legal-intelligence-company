import 'server-only';
import type {createAdminClient} from './supabase/admin';
import {paidAIAccessError} from './billing-access';
import {reservePilot, type PilotKind} from './ai-pilot';
import {commercialMeterEnabled, reserveCommercialService, type MeterRequest, type MeterService} from './commercial-meter';
type Admin=NonNullable<ReturnType<typeof createAdminClient>>;
type User={id:string;email?:string;email_confirmed_at?:string|null};
export function serviceAccessError(user:User) {
 const pilot=paidAIAccessError(user);
 return !pilot?'':commercialMeterEnabled()?'':pilot;
}
export async function reserveService(db:Admin,user:User,id:string,service:MeterService,pilotKind:PilotKind,request:Request):Promise<MeterRequest|null> {
 // Explicit commercial wallet selection always uses real credits, never the pilot.
 const wallet=request.headers.get('x-credit-wallet');
 if(!wallet&&!paidAIAccessError(user)){await reservePilot(db,user.id,id,pilotKind);return null;}
 if(!wallet||!/^[0-9a-f-]{36}$/i.test(wallet))throw Error('METER_FORBIDDEN');
 const raw=request.headers.get('x-max-debit-cents');
 if(!raw||!/^\d+$/.test(raw))throw Error('METER_QUOTE_CHANGED');
 return reserveCommercialService(db,user.id,id,service,wallet,Number(raw));
}
