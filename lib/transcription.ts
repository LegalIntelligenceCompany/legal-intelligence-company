// Conservative upload bound; audio travels as binary, never base64/JSON.
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 300;
export const AUDIO_ACCEPT = '.mp3,.mpeg,.mpga,.m4a,.mp4,.wav,.webm';
export function audioExtension(name:string) {
 const ext=name.toLowerCase().split('.').pop();
 if(!ext||!['mp3','mpeg','mpga','m4a','mp4','wav','webm'].includes(ext))throw Error('FORMAT');
 return ext;
}
export function validateAudio(bytes:Uint8Array, ext:string) {
 if(!bytes.length||bytes.length>MAX_AUDIO_BYTES)throw Error('SIZE');
 const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 const valid=ext==='wav'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE':
 ext==='webm'?bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3:
 ['m4a','mp4'].includes(ext)?ascii(4,8)==='ftyp':
 ['mp3','mpeg','mpga'].includes(ext)?ascii(0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&0xe0)===0xe0):false;
 if(!valid)throw Error('FORMAT');
 // Container sniffing is not decoding. Provider must also validate the media.
}
export function transcriptionText(value:unknown) {
 const text=(value as {text?:unknown}|null)?.text;
 if(typeof text!=='string'||!text.trim()||text.length>60000)throw Error('EMPTY');
 return text.trim();
}
