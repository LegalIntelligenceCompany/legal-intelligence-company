import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SqlSetup } from "@/components/sql-setup";

export const dynamic = "force-dynamic";
export default function DocumentsSetup() {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/003_documents.sql"), "utf8");
  return <SqlSetup sql={sql}/>;
}
