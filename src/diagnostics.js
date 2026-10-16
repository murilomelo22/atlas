export const APP_VERSION='0.1.2';
export const EVENT_CODES=['app_open','backup_export','sync_success','UNHANDLED_ERROR','UNHANDLED_REJECTION'];
const ring=[];
export function diagnosticEntry(code) {
 if(!EVENT_CODES.includes(code))return null;
 const entry={code,version:APP_VERSION};ring.push(entry);if(ring.length>50)ring.shift();return entry;
}
export const diagnosticSnapshot=()=>ring.map(e=>({...e}));
export function supportMailto({email,includeLogs=false,logs=[]}) {
 if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email||''))throw new Error('O canal de suporte ainda está sendo configurado.');
 const clean=logs.filter(e=>EVENT_CODES.includes(e.code)).slice(-50).map(e=>({code:e.code,version:APP_VERSION}));
 const body=`Olá, equipe Atlas.\n\nDescreva aqui o que ocorreu:\n\nVersão: ${APP_VERSION}\n${includeLogs?'\nRelatório autorizado (sem conteúdo de viagens):\n'+JSON.stringify(clean,null,2):'Nenhum relatório foi incluído.'}`;
 return `mailto:${email}?subject=${encodeURIComponent(`Suporte Atlas ${APP_VERSION}`)}&body=${encodeURIComponent(body)}`;
}
