import { MarketingNav } from "@/components/marketing-nav";
import { ResearchPanel } from "@/components/research-panel";
export const metadata = { title: "Chat jurídico | Legal Intelligence Company" };
export default function ChatPage() {
  return <><MarketingNav/><main className="shell assistant-page"><div className="eyebrow">Legal Intelligence Company</div><h1>Clareza para cada questão.</h1><p>Investigação jurídica para estudar, ensinar e trabalhar — com fontes que pode conferir.</p><ResearchPanel/></main></>;
}
