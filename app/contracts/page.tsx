"use client";
import { CompanyWorkspace } from "@/components/company-workspace";
import { ContractLibrary } from "@/components/contract-library";
export default function Contracts() {
  return <CompanyWorkspace title="Contratos" description="Documentos privados, partilhados apenas com a sua empresa.">{company => <ContractLibrary company={company}/>}</CompanyWorkspace>;
}
