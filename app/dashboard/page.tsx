"use client";
import { CompanyWorkspace } from "@/components/company-workspace";
import { CompanyDashboard } from "@/components/company-dashboard";
export default function Dashboard() {
  return <CompanyWorkspace title="Visão geral" description="Contratos e políticas da sua empresa, num só lugar.">{company => <CompanyDashboard company={company}/>}</CompanyWorkspace>;
}
