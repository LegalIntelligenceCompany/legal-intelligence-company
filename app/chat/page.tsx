import { MarketingNav } from "@/components/marketing-nav";
import { AssistantPanel } from "@/components/assistant-panel";
export const metadata = { title: "Chat jurídico | Legal Intelligence Company" };
export default function ChatPage() {
  return <><MarketingNav/><main className="shell assistant-page"><div className="eyebrow">Legal Intelligence Company</div><h1>Chat jurídico</h1><p>Um espaço para estudantes, professores, profissionais e quem queira compreender o direito.</p><AssistantPanel/></main></>;
}
