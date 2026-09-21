import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AssistantSetup } from "@/components/assistant-setup";
export const dynamic = "force-static";
export default function SetupAssistant() {
  return <AssistantSetup sql={readFileSync(join(process.cwd(), "supabase/migrations/005_assistant.sql"), "utf8")}/>;
}
