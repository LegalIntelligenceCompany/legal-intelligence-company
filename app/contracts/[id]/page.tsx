"use client";
import { use } from "react";
import { CompanyWorkspace } from "@/components/company-workspace";
import { ContractDetail } from "@/components/contract-detail";
export default function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CompanyWorkspace title="Contrato" description="Documento privado da sua empresa.">{company => <ContractDetail company={company} id={id}/>}</CompanyWorkspace>;
}
