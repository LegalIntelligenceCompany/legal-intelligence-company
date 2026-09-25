// Disposable synthetic files for testing the local DOCX import UI. No user data.
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {wordZip} from '../lib/word-review.ts';
const dir=mkdtempSync(join(tmpdir(),'lic-word-fixture-'));
const base={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>','_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'};
const simple='<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Documento fictício</w:t></w:r></w:p><w:p><w:r><w:t>Texto original para revisão.</w:t></w:r></w:p>';
for(const [name,body] of [['simple',simple],['table','<w:tbl><w:tr><w:tc>'+simple+'</w:tc></w:tr></w:tbl>']]){const path=join(dir,name+'.docx');writeFileSync(path,wordZip({...base,'word/document.xml':`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`}));console.log(path);}
