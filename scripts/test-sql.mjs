import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Independent in-memory PostgreSQL instances; no access to the deployed database.
for(const file of readdirSync(new URL('../tests/',import.meta.url)).filter(f=>/^sql-.*\.mjs$/.test(f)).sort()){
 const result=spawnSync(process.execPath,[new URL('../tests/'+file,import.meta.url).pathname],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status??1);
}
