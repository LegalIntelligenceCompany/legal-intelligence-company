import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BillingSetup } from "@/components/billing-setup";
export const dynamic = "force-dynamic";
export default function SetupBilling() { return <BillingSetup sql={readFileSync(join(process.cwd(), "supabase/migrations/006_billing.sql"), "utf8")} />; }
