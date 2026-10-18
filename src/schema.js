export const DATA_SCHEMA_VERSION=2;
export function schemaTransition(previous=1,target=DATA_SCHEMA_VERSION) {
 if(!Number.isInteger(previous)||![1,2].includes(previous)||![1,2].includes(target))throw new Error('Versão de dados não suportada. Preserve seu backup e atualize o aplicativo.');
 return {version:target,previous,changed:previous!==target};
}
export async function migrateDatabase(database,target=DATA_SCHEMA_VERSION) {
 // Physical IndexedDB version stays 1: 0.1.1 can still open it on rollback.
 // This release changes metadata only; memory and media stores are untouched.
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('meta','readwrite'),store=tx.objectStore('meta');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Migração cancelada.'));
  const read=store.get('data-schema');read.onsuccess=()=>{
   try{const next=schemaTransition(read.result?.value||1,target);if(next.changed){store.put({key:'data-schema-rollback',value:{version:next.previous,at:new Date().toISOString()}});store.put({key:'data-schema',value:next.version});}}
   catch(e){tx.abort();reject(e);}
  };
 });
}
