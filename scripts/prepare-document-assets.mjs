import {mkdir,copyFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
// Build-time copies only. Private documents never go to a CDN or OCR server.
const root=process.cwd(),out=join(root,'public/document-runtime');
await mkdir(out,{recursive:true});
await copyFile(join(root,'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),join(out,'pdf.worker.min.mjs'));
await copyFile(join(root,'node_modules/tesseract.js/dist/worker.min.js'),join(out,'worker.min.js'));
for(const file of await readdir(join(root,'node_modules/tesseract.js-core'))){if(/\.(wasm|js)$/.test(file))await copyFile(join(root,'node_modules/tesseract.js-core',file),join(out,file));}
for(const language of ['por','eng'])await copyFile(join(root,`node_modules/@tesseract.js-data/${language}/4.0.0/${language}.traineddata.gz`),join(out,`${language}.traineddata.gz`));
for(const [folder,target] of [['cmaps','cmaps'],['standard_fonts','standard_fonts'],['wasm','wasm']]){
 const source=join(root,'node_modules/pdfjs-dist',folder);await mkdir(join(out,target),{recursive:true});
 for(const name of await readdir(source))await copyFile(join(source,name),join(out,target,name));
}
