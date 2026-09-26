import {mkdir,copyFile,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
// Build-time copies only. Private documents never go to a CDN or OCR server.
const root=process.cwd(),out=join(root,'public/document-runtime');
const require=createRequire(import.meta.url);
const pdfRoot=dirname(require.resolve('pdfjs-dist/package.json'));
const tesseractPackage=require.resolve('tesseract.js/package.json');
const tesseractRoot=dirname(tesseractPackage);
// Resolve the transitive engine from its owner, not from a hoisted node_modules.
const coreRoot=dirname(createRequire(tesseractPackage).resolve('tesseract.js-core/package.json'));
await mkdir(out,{recursive:true});
await copyFile(join(pdfRoot,'build/pdf.worker.min.mjs'),join(out,'pdf.worker.min.mjs'));
await copyFile(join(tesseractRoot,'dist/worker.min.js'),join(out,'worker.min.js'));
for(const file of await readdir(coreRoot)){if(/\.(wasm|js)$/.test(file))await copyFile(join(coreRoot,file),join(out,file));}
for(const language of ['por','eng']){
 const languageRoot=dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
 await copyFile(join(languageRoot,`4.0.0/${language}.traineddata.gz`),join(out,`${language}.traineddata.gz`));
}
for(const [folder,target] of [['cmaps','cmaps'],['standard_fonts','standard_fonts'],['wasm','wasm']]){
 const source=join(pdfRoot,folder);await mkdir(join(out,target),{recursive:true});
 for(const name of await readdir(source))await copyFile(join(source,name),join(out,target,name));
}
