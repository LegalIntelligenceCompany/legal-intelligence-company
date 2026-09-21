import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Legal Intelligence Company | Análise contratual", description: "Análise contratual inteligente para equipas." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-PT"><body>{children}</body></html>;
}
