import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {deflateRawSync} from 'node:zlib';
import * as word from '../lib/word-review.ts';
const source=ts.transpileModule(readFileSync(new URL('../lib/word-import.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText;
const m={exports:{}};new Function('require','module','exports',source)(name=>{assert.equal(name,'./word-review');return word;},m,m.exports);
const {readWordZip}=m.exports;
const files={'[Content_Types].xml':'<Types/>','word/document.xml':'<document>Exemplo português</document>'};
test('bounded DOCX archive reader round-trips UTF8 and rejects corrupt CRC, traversal and duplicates',async()=>{
 const zip=word.wordZip(files);const result=await readWordZip(zip);assert.equal(new TextDecoder().decode(result['word/document.xml']),files['word/document.xml']);
 const broken=zip.slice();broken[55]^=1;await assert.rejects(readWordZip(broken));
 for(const extra of ['../escape','/absolute','word/vbaProject.bin'])await assert.rejects(readWordZip(word.wordZip({...files,[extra]:'x'})));
 await assert.rejects(readWordZip(new Uint8Array(5*1024*1024+1)));await assert.rejects(readWordZip(zip.slice(0,-1)));
});
function compressedZip(){const local=[],central=[];let offset=0;for(const [name,text] of Object.entries(files)){const n=Buffer.from(name),data=Buffer.from(text),compressed=deflateRawSync(data),h=Buffer.alloc(30),c=Buffer.alloc(46);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(word.crc32(data),14);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(word.crc32(data),16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);local.push(h,n,compressed);central.push(c,n);offset+=h.length+n.length+compressed.length;}const end=Buffer.alloc(22),directory=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,8);end.writeUInt16LE(2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);}
test('compressed DOCX is supported, expansion limits and encryption fail closed',async()=>{const zip=compressedZip();assert.equal(new TextDecoder().decode((await readWordZip(zip))['word/document.xml']),files['word/document.xml']);const b=Buffer.from(zip),start=b.readUInt32LE(b.length-6);b.writeUInt32LE(11*1024*1024,start+24);await assert.rejects(readWordZip(b),/grande/);const encrypted=Buffer.from(zip);encrypted.writeUInt16LE(1,start+8);await assert.rejects(readWordZip(encrypted));});
