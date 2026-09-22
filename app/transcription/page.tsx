import { AppShell } from '@/components/app-shell';
import { TranscriptionPanel } from '@/components/transcription-panel';
export default function Page(){return <AppShell><h1>Transcrição de áudio</h1><p>Grave directamente ou carregue áudio. Ouça antes de enviar e reveja o texto com o original. Não é uma transcrição certificada.</p><TranscriptionPanel/></AppShell>;}
