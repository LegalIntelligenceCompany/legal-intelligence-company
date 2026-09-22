import Image from 'next/image';
export function Brand({compact=false}:{compact?:boolean}) {
 return <span className={compact?'lic-brand compact':'lic-brand'}><span className="lic-logo"><Image src="/brand/lic-original.png" alt="Legal Intelligence Company" width={2000} height={2000} priority/></span></span>;
}
