import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SqlSetup } from "@/components/sql-setup";

export const dynamic = "force-dynamic";
export default function AnalysisSetup() {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/004_analysis.sql"), "utf8");
  return <SqlSetup sql={sql} analysis/>;
}
