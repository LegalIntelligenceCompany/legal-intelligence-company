"use client";
import Link from "next/link";
import { CompanyWorkspace } from "@/components/company-workspace";
const roles = { owner: "Proprietário", admin: "Administrador", member: "Membro" };
export default function CompanyPage() {
  return <CompanyWorkspace title="Empresa" description="A empresa seleccionada é usada nos contratos, nas políticas e no dashboard.">{company => <section className="card team-panel"><h2>{company.name}</h2><p>O seu perfil: <strong>{roles[company.role]}</strong></p><div className="workspace-toolbar"><Link className="btn btn-primary" href="/team">Gerir equipa</Link><Link className="btn btn-secondary" href="/contracts">Ver contratos</Link></div></section>}</CompanyWorkspace>;
}
