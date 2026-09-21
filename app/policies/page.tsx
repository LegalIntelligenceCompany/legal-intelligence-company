"use client";
import { CompanyWorkspace } from "@/components/company-workspace";
import { PolicyLibrary } from "@/components/policy-library";
export default function Policies() {
  return <CompanyWorkspace title="Políticas" description="Defina as regras que orientam a revisão dos contratos da sua empresa.">{company => <PolicyLibrary company={company}/>}</CompanyWorkspace>;
}
