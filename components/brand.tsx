import Image from 'next/image';
export function Brand({compact=false}:{compact?:boolean}) {
 return <span className={compact?'lic-brand compact':'lic-brand'} aria-label="Legal Intelligence Company"><span className="lic-monogram"><Image src="/brand/lic-original.png" alt="" width={2000} height={2000} priority/></span><span className="lic-wordmark">LEGAL INTELLIGENCE<small>COMPANY</small></span></span>;
}
