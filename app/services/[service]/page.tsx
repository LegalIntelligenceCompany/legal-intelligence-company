import { notFound } from 'next/navigation';
import { isWorkflow } from '@/lib/services';
import { ServiceWorkbench } from '@/components/service-workbench';
export default async function Service({params}:{params:Promise<{service:string}>}) { const {service}=await params; if(!isWorkflow(service))notFound(); return <ServiceWorkbench workflow={service}/>; }
