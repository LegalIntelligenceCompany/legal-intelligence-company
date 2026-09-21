"use client";
import { CompanyWorkspace } from "@/components/company-workspace";
import { ContractUpload } from "@/components/contract-upload";
export default function NewContract() {
  return <CompanyWorkspace title="Novo contrato" description="Guarde um PDF ou DOCX na biblioteca privada da empresa.">{company => <ContractUpload company={company}/>}</CompanyWorkspace>;
}
