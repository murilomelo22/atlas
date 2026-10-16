import { commercialRequest, commercialConfig } from './commercial.js';
import { currentUser, signIn, signOut } from './cloud.js';
export function downloadJSON(data,name) {
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function initializePrivacy() {
 const dialog=document.getElementById('privacy-dialog'),status=document.getElementById('privacy-status');
 document.getElementById('privacy-button').onclick=async()=>{
  dialog.showModal();status.textContent=commercialConfig.legalApproved?'Documentos aprovados disponíveis abaixo.':'Documentos em RASCUNHO, aguardando revisão jurídica. Não há aceite de contrato comercial final nesta versão.';
  const form=document.getElementById('legal-consent-form');form.hidden=true;
  if(commercialConfig.legalApproved&&currentUser())try{const legal=await commercialRequest('/v1/legal');form.hidden=!legal.available||legal.accepted;form.dataset.version=legal.version||'';}catch(e){status.textContent=e.message;}
 };
 document.getElementById('legal-consent-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget;
  try{await commercialRequest('/v1/consent',{method:'POST',body:{version:form.dataset.version,accepted:form.elements.accepted.checked}});form.hidden=true;status.textContent='Aceite da versão atual registrado. Você pode consultar os documentos a qualquer momento.';}catch(e){status.textContent=e.message;}
 };
 document.getElementById('privacy-close').onclick=()=>dialog.close();
 document.getElementById('portability-button').onclick=async()=>{
  try{status.textContent='Preparando dados da nuvem…';downloadJSON(await commercialRequest('/v1/export'),'atlas-portabilidade-nuvem.json');status.textContent='Manifesto exportado. Os links de mídia expiram em 1 hora. Exporte também seu backup local completo.';}catch(e){status.textContent=e.message;}
 };
 document.getElementById('account-delete-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;
  try {
   const user=currentUser();if(!user)throw new Error('Entre na conta que deseja excluir.');
   if(document.getElementById('delete-confirmation').value!=='EXCLUIR MINHA CONTA')throw new Error('Digite a confirmação exatamente como indicada.');
   await signIn(user.email,document.getElementById('delete-password').value,{expectedUserId:user.id});
   const result=await commercialRequest('/v1/account/delete',{method:'POST',body:{confirmation:'EXCLUIR MINHA CONTA'}});
   await signOut();form.reset();status.textContent=`${result.message} Prazo: ${new Date(result.deadline).toLocaleDateString('pt-BR')}.`;
  } catch(e){status.textContent=e.message;}finally{document.getElementById('delete-password').value='';button.disabled=false;}
 };
 document.getElementById('moderation-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget;
  try{await commercialRequest('/v1/moderation',{method:'POST',body:{action:form.elements.action.value,targetType:'profile',targetId:form.elements.target.value.trim(),blockedId:form.elements.target.value.trim(),reason:form.elements.reason.value}});status.textContent='Solicitação registrada. Bloqueios valem para a visualização autenticada; conteúdo público pode continuar acessível fora da sua conta.';}
  catch(e){status.textContent=e.message;}
 };
}
