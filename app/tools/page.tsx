"use client";
import { CompanyWorkspace } from "@/components/company-workspace";
import { AssistantPanel } from "@/components/assistant-panel";
export default function ToolsPage() {
  return <CompanyWorkspace title="Ferramentas documentais" description="Compare versões, pergunte aos documentos e identifique obrigações e prazos.">{company => <AssistantPanel organizationId={company.id}/>}</CompanyWorkspace>;
}
