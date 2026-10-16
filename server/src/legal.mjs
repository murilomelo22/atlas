export function legalService({db,version}) {
 const approved=typeof version==='string'&&/^[a-zA-Z0-9._-]{1,64}$/.test(version)&&!/draft|rascunho/i.test(version);
 async function status(user) {
  const accepted=approved&&(await db.query('select 1 from atlas_commercial.consents where user_id=$1 and document_version=$2',[user.id,version])).rows.length>0;
  return {available:approved,version:approved?version:null,accepted:Boolean(accepted)};
 }
 async function accept(user,input) {
  if(!approved)throw Object.assign(new Error('Documentos finais ainda não foram aprovados.'),{status:503});
  if(input?.accepted!==true||input.version!==version)throw Object.assign(new Error('Revise e aceite a versão atual dos documentos.'),{status:400});
  await db.query('insert into atlas_commercial.consents(user_id,document_version) values($1,$2) on conflict do nothing',[user.id,version]);
  return status(user);
 }
 async function requireAccepted(user) {
  if(!(await status(user)).accepted)throw Object.assign(new Error('Revise os documentos finais em Privacidade e conta antes de contratar.'),{status:412});
 }
 return {status,accept,requireAccepted};
}
