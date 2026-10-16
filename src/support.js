import {commercialConfig,commercialRequest} from './commercial.js';
import {diagnosticEntry,diagnosticSnapshot,supportMailto} from './diagnostics.js';
const preferenceKey='atlas-diagnostics-consent-v1';
export function preferences() {
 try{const p=JSON.parse(localStorage.getItem(preferenceKey)||'{}');return {metrics:p.metrics===true,errors:p.errors===true};}catch{return {metrics:false,errors:false};}
}
export function setPreferences(value) {
 const clean={metrics:value.metrics===true,errors:value.errors===true};localStorage.setItem(preferenceKey,JSON.stringify(clean));return clean;
}
export async function recordEvent(code) {
 const entry=diagnosticEntry(code);if(!entry)return;
 const prefs=preferences(),isError=code.startsWith('UNHANDLED_');
 if(!(isError?prefs.errors:prefs.metrics))return;
 try{await commercialRequest('/v1/telemetry',{method:'POST',body:{event:entry.code,version:entry.version}});}catch{/* Collection never blocks the app or queues past events for future consent. */}
}
export function initializeSupport() {
 const dialog=document.getElementById('support-dialog'),status=document.getElementById('support-status');
 const metrics=document.getElementById('metrics-consent'),errors=document.getElementById('errors-consent'),logs=document.getElementById('support-logs');
 const updatePreview=()=>document.getElementById('support-preview').textContent=logs.checked?JSON.stringify(diagnosticSnapshot(),null,2):'Nenhum relatório será incluído.';
 document.getElementById('support-button').onclick=()=>{const p=preferences();metrics.checked=p.metrics;errors.checked=p.errors;logs.checked=false;status.textContent='';updatePreview();dialog.showModal();};
 document.getElementById('support-close').onclick=()=>dialog.close();logs.onchange=updatePreview;
 document.getElementById('save-consent').onclick=()=>{setPreferences({metrics:metrics.checked,errors:errors.checked});status.textContent='Preferências salvas neste dispositivo. Você pode revogar a qualquer momento.';};
 document.getElementById('support-email').onclick=()=>{try{window.open(supportMailto({email:commercialConfig.supportEmail,includeLogs:logs.checked,logs:diagnosticSnapshot()}),'_blank','noopener,noreferrer');status.textContent='Revise a mensagem no seu aplicativo de e-mail antes de enviar.';}catch(e){status.textContent=e.message;}};
 window.addEventListener('error',()=>recordEvent('UNHANDLED_ERROR'));window.addEventListener('unhandledrejection',()=>recordEvent('UNHANDLED_REJECTION'));recordEvent('app_open');
}
