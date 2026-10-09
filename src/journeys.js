import { request, currentUser, signedURL, deleteObjects } from './cloud.js';
import { getMeta, setMeta } from './db.js';
import { processPhoto, blobAsDataURL } from './photos.js';
import { cleanTrip } from './trip-data.js';
import { haversine } from './stats.js';
import { $, escapeHTML as esc, notify, confirmAction } from './ui.js';
import { appLink, shareText, downloadText } from './sharing.js';
const rpc = (name,body) => request(`/rest/v1/rpc/${name}`,{method:'POST',authenticated:true,body});
async function query(table,parameters) {
  const rows=[];
  for(let offset=0;;offset+=1000) {
    const page=await request(`/rest/v1/${table}?${new URLSearchParams({select:'*',...parameters,limit:'1000',offset:String(offset)})}`,{authenticated:true});
    rows.push(...page); if(page.length<1000) return rows;
  }
}
export function initializeJourneys(callbacks) {
  const dialog=document.createElement('dialog'); dialog.id='trips-dialog'; dialog.className='wide-dialog'; dialog.setAttribute('aria-labelledby','trips-title');
  dialog.innerHTML='<header class="dialog-header"><div><p class="eyebrow">PRÓXIMOS CAMINHOS</p><h2 id="trips-title">Trips e roteiros</h2></div><button class="icon-button" id="trips-close" aria-label="Fechar trips">×</button></header><div class="account-body"><div id="trip-list-view"><p id="trip-list-status" class="field-hint" role="status"></p><div class="account-actions"><button id="trip-new" class="primary">＋ Criar trip</button><button id="trip-import" class="quiet">Importar roteiro JSON</button><button id="trip-refresh" class="quiet">Atualizar</button><input id="trip-file" type="file" accept="application/json,.json" hidden></div><div id="trip-list" class="trip-list"></div></div><section id="trip-editor-view" hidden></section></div>';
  document.body.append(dialog);
  let trips=[],memberships=[],current=null,people=[],coverFile=null,busy=false,epoch=0;
  function backToList() { current=null; people=[]; coverFile=null; $('#trip-editor-view').replaceChildren(); $('#trip-editor-view').hidden=true; $('#trip-list-view').hidden=false; return load(); }
  const account=()=>currentUser()?.id || null;
  const access=(trip)=> !account() && !trip.owner_id ? 'owner' : trip.owner_id===account() ? 'owner' : memberships.find(m=>m.trip_id===trip.id)?.status==='accepted' ? memberships.find(m=>m.trip_id===trip.id)?.role : 'viewer';
  const canEdit=()=>current && ['owner','editor'].includes(access(current));
  const fail=(error)=>{
    const text=['42P01','PGRST202','PGRST205'].includes(error.code)?'As trips na nuvem ainda precisam ser ativadas pelo responsável pelo site. Seus destinos continuam disponíveis.':error.message.startsWith('Sem conexão')?'Sem conexão. O roteiro não foi enviado. Mantenha esta tela aberta e tente novamente.':error.message;
    const target=$('#trip-message') || $('#trip-list-status'); target.textContent=text; notify(text,true);
  };
  async function load() {
    const token=++epoch;
    $('#trip-list-status').textContent=account()?'Buscando trips e convites…':'Roteiros salvos neste navegador. Entre na conta para criar grupos e links públicos.';
    $('#trip-list').replaceChildren();
    try {
      if(account()) {
        const myId=account(); const membership=await query('trip_members',{user_id:`eq.${myId}`});
        const ids=membership.map(m=>m.trip_id);
        const rows=await query('trips',{or:`(owner_id.eq.${myId}${ids.length?`,id.in.(${ids.join(',')})`:''})`,order:'updated_at.desc'});
        if(token!==epoch || account()!==myId) return;
        memberships=membership; trips=rows;
      } else { const rows=await getMeta('trips') || []; if(token!==epoch)return; trips=rows; memberships=[]; }
      if(token!==epoch)return;
      $('#trip-list-status').textContent=account()?'Convites aparecem aqui. Acompanhantes podem ver; editores podem alterar o roteiro após aceitar.':'Roteiros locais. Exporte o JSON para levar à sua conta ou a outro dispositivo.';
      $('#trip-list').innerHTML=trips.length?trips.map(t=>`<button class="trip-card" data-trip="${esc(t.id)}"><strong>${esc(t.name)}</strong><span>${t.stops.length} destinos · ${t.is_public?'Pública por link':'Privada'}</span><small>${memberships.find(m=>m.trip_id===t.id)?.status==='invited'?'Convite pendente':access(t)==='owner'?'Você organiza':access(t)==='editor'?'Você edita':'Você acompanha'}</small></button>`).join(''):'<p class="field-hint">Sua próxima viagem começa com um roteiro. Crie a primeira trip.</p>';
      $('#trip-list').querySelectorAll('[data-trip]').forEach(b=>b.onclick=()=>open(trips.find(t=>t.id===b.dataset.trip)));
    } catch(error) { if(token===epoch) fail(error); }
  }
  function readStops() {
    return [...$('#trip-stops').children].map(row=>({id:row.dataset.stop,name:$('[data-stop-name]',row).value,lat:$('[data-stop-lat]',row).value,lng:$('[data-stop-lng]',row).value,date:$('[data-stop-date]',row).value,notes:$('[data-stop-notes]',row).value}));
  }
  function renumber() { [...$('#trip-stops').children].forEach((row,i)=>$('[data-stop-number]',row).textContent=`Destino ${i+1}`); }
  function addStop(stop={}) {
    const row=document.createElement('div'); row.className='trip-stop'; row.dataset.stop=stop.id || crypto.randomUUID();
    row.innerHTML=`<div class="trip-stop-heading"><strong data-stop-number></strong><div><button type="button" data-up aria-label="Mover destino para cima">↑</button><button type="button" data-down aria-label="Mover destino para baixo">↓</button><button type="button" data-remove aria-label="Remover destino do roteiro">×</button></div></div><label>Destino<input data-stop-name maxlength="120" required value="${esc(stop.name || '')}"></label><div class="form-row"><label>Latitude<input data-stop-lat type="number" min="-90" max="90" step="any" required value="${esc(stop.lat ?? '')}"></label><label>Longitude<input data-stop-lng type="number" min="-180" max="180" step="any" required value="${esc(stop.lng ?? '')}"></label><label>Data planejada<input data-stop-date type="date" value="${esc(stop.date || '')}"></label></div><label>Plano para este destino<textarea data-stop-notes maxlength="2000" rows="2">${esc(stop.notes || '')}</textarea></label>`;
    $('[data-up]',row).onclick=()=>{if(row.previousElementSibling) row.parentNode.insertBefore(row,row.previousElementSibling);renumber();};
    $('[data-down]',row).onclick=()=>{if(row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling,row);renumber();};
    $('[data-remove]',row).onclick=()=>{row.remove();renumber();};
    $('#trip-stops').append(row); renumber();
  }
  function renderPeople() {
    $('#trip-people').innerHTML=people.length?people.map(p=>`<div class="trip-person"><span>@${esc(p.username)} · ${p.role==='editor'?'Editor':'Acompanhante'} · ${p.status==='invited'?'Convite pendente':'Participando'}</span>${access(current)==='owner'?`<button type="button" class="text-button" data-remove-person="${esc(p.user_id)}">Remover</button>`:''}</div>`).join(''):'<p class="field-hint">Nenhum participante adicionado.</p>';
    $('#trip-people').querySelectorAll('[data-remove-person]').forEach(b=>b.onclick=()=>mutate(async()=>{await rpc('atlas_remove_trip_member',{p_trip:current.id,p_user:b.dataset.removePerson});people=await rpc('atlas_trip_people',{p_trip:current.id});renderPeople();}));
  }
  function mutate(action) {
    if(busy)return;
    const token=epoch,who=account(); busy=true;
    $('#trip-editor-view').querySelectorAll('button').forEach(b=>b.disabled=true);
    return Promise.resolve().then(action).catch(error=>{if(token===epoch && who===account())fail(error);}).finally(()=>{busy=false;if(token===epoch)$('#trip-editor-view').querySelectorAll('button').forEach(b=>b.disabled=false);});
  }
  async function open(trip,options={}) {
    const token=++epoch; current=trip?structuredClone(trip):{id:crypto.randomUUID(),name:'',notes:'',stops:[],is_public:false,owner_id:account(),revision:null,cover_path:null}; coverFile=null; people=[];
    $('#trip-list-view').hidden=true; $('#trip-editor-view').hidden=false;
    const editable=canEdit(),owner=access(current)==='owner',invited=memberships.find(m=>m.trip_id===current.id)?.status==='invited',saved=Boolean(current.revision || trips.some(t=>t.id===current.id));
    $('#trip-editor-view').innerHTML=`<button id="trip-back" class="text-button" type="button">← Todas as trips</button><form id="trip-form"><fieldset id="trip-fields" ${editable?'':'disabled'}><label>Nome da trip<input id="trip-name" maxlength="120" required value="${esc(current.name)}"></label><label>Descrição<textarea id="trip-notes" maxlength="5000" rows="3">${esc(current.notes || '')}</textarea></label><div id="trip-cover-preview" class="trip-cover-preview"></div><label ${editable?'':'hidden'}>Foto de capa<input id="trip-cover" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="manual-toggle"><input id="trip-public" type="checkbox" ${current.is_public?'checked':''} ${owner && account()?'':'disabled'}> Roteiro público por link</label><p class="field-hint">Um roteiro público mostra nome, capa, descrição, destinos e planos, mesmo se seu perfil estiver privado. Postagens pessoais não são copiadas automaticamente.</p><h3>Destinos na ordem do roteiro</h3><div id="trip-stops"></div><div class="account-actions" ${editable?'':'hidden'}><button type="button" id="trip-add-stop" class="quiet">＋ Novo destino</button><label>Adicionar do meu atlas<select id="trip-existing"><option value="">Escolher destino…</option>${callbacks.destinations().map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></label></div></fieldset><p id="trip-message" class="field-hint" role="status"></p><div class="account-actions"><button type="submit" id="trip-save" class="primary" ${editable?'':'hidden'}>Salvar roteiro</button><button type="button" id="trip-share" class="quiet" ${saved?'':'hidden'}>Compartilhar roteiro</button><button type="button" id="trip-export" class="quiet">Exportar JSON</button><button type="button" id="trip-map" class="quiet">Ver no mapa</button><button type="button" id="trip-delete" class="text-button" ${saved && owner?'':'hidden'}>Excluir trip</button></div></form><section id="trip-members-section" ${account() && saved?'':'hidden'}><h3>Grupo da viagem</h3>${invited?'<p>Você recebeu um convite para esta trip.</p><div class="account-actions"><button id="trip-accept" class="primary">Aceitar convite</button><button id="trip-decline" class="quiet">Recusar</button></div>':''}<div id="trip-people"></div><form id="trip-invite-form" ${owner?'':'hidden'}><div class="form-row"><label>Nome de usuário<input id="trip-invite-username" required pattern="[a-z0-9_]{3,30}" maxlength="30" placeholder="ex.: murilo_viagens"></label><label>Permissão<select id="trip-invite-role"><option value="viewer">Acompanhar</option><option value="editor">Editar roteiro</option></select></label></div><button class="quiet" type="submit">Enviar convite</button><p class="field-hint">O usuário precisa ter um perfil encontrável. O convite aparece em Trips e roteiros. Só você gerencia participantes e publicação.</p></form>${!owner && !invited && memberships.some(m=>m.trip_id===current.id)?'<button id="trip-leave" class="text-button">Sair do grupo</button>':''}</section>`;
    for(const stop of current.stops)addStop(stop);
    // Disabled fieldsets cover inputs and reorder controls; sharing remains available.
    $('#trip-back').onclick=backToList;
    $('#trip-add-stop').onclick=()=>addStop();
    $('#trip-existing').onchange=e=>{const d=callbacks.destinations().find(d=>d.id===e.target.value);if(d)addStop({name:d.name,lat:d.lat,lng:d.lng});e.target.value='';};
    $('#trip-cover').onchange=e=>{coverFile=e.target.files[0] || null;};
    const draft=()=>cleanTrip({...current,name:$('#trip-name').value,notes:$('#trip-notes').value,stops:readStops(),is_public:$('#trip-public').checked});
    $('#trip-form').onsubmit=e=>{e.preventDefault();mutate(async()=>{
      const clean=draft(),who=account(),saveToken=epoch; let cover=current.cover_path,coverData=current.cover_data;
      $('#trip-message').textContent='Salvando roteiro…';
      if(coverFile) {
        const image=await processPhoto(coverFile,current.id);
        if(who) {
          cover=`${who}/${crypto.randomUUID()}.jpg`;
          await request(`/storage/v1/object/atlas-trip-covers/${cover}`,{method:'POST',authenticated:true,body:image.thumbnail,headers:{'Content-Type':image.thumbnail.type,'x-upsert':'false'}});
        } else coverData=await blobAsDataURL(image.thumbnail);
      } else if(who && clean.cover_data && !cover) {
        const blob=await (await fetch(clean.cover_data)).blob();cover=`${who}/${crypto.randomUUID()}.jpg`;
        await request(`/storage/v1/object/atlas-trip-covers/${cover}`,{method:'POST',authenticated:true,body:blob,headers:{'Content-Type':blob.type,'x-upsert':'false'}});
      }
      if(who!==account() || saveToken!==epoch)return;
      const savedTrip=who?await rpc('atlas_save_trip',{p_id:current.id,p_expected_revision:current.revision || null,p_name:clean.name,p_notes:clean.notes,p_cover_path:cover || null,p_public:clean.is_public,p_stops:clean.stops}):{...clean,is_public:false,cover_data:coverData};
      if(who!==account() || saveToken!==epoch)return;
      if(!who) {trips=trips.filter(t=>t.id!==savedTrip.id);trips.unshift(savedTrip);await setMeta('trips',trips);}
      notify(who?'Roteiro salvo na nuvem.':'Roteiro salvo neste navegador.');await open(savedTrip);
    });};
    $('#trip-export').onclick=()=>{try{const clean=draft();downloadText(`atlas-roteiro-${clean.id}.json`,JSON.stringify({format:'atlas-roteiro',version:1,trip:{...clean,is_public:false}},null,2),'application/json');}catch(error){fail(error);}};
    $('#trip-map').onclick=()=>{try{const stops=draft().stops;if(!stops.length)throw new Error('Adicione um destino ao roteiro.');callbacks.preview(stops);dialog.close();}catch(error){fail(error);}};
    $('#trip-share').onclick=async()=>{
      if(!current.is_public && !await confirmAction('Compartilhar roteiro privado?', 'A mensagem incluirá os destinos, datas e notas do roteiro salvo. Quem receber poderá copiar essas informações. O grupo continuará privado.', 'Compartilhar mensagem'))return;
      let distance=0;current.stops.slice(1).forEach((s,i)=>distance+=haversine(current.stops[i],s));
      shareText(`${current.name}\n${current.stops.map((s,i)=>`${i+1}. ${s.name}${s.date?' — '+s.date:''}${s.notes?'\n'+s.notes:''}`).join('\n')}\n${Math.round(distance)} km entre paradas em linha reta.`,current.is_public && current.owner_id?appLink(`#/roteiro/${current.id}`):'');
    };
    $('#trip-delete').onclick=()=>mutate(async()=>{if(!await confirmAction('Excluir esta trip?', 'O roteiro e os convites serão removidos. Suas postagens pessoais serão preservadas.'))return;if(account())await rpc('atlas_delete_trip',{p_trip:current.id,p_expected_revision:current.revision});else{trips=trips.filter(t=>t.id!==current.id);await setMeta('trips',trips);}await backToList();});
    $('#trip-invite-form').onsubmit=e=>{e.preventDefault();mutate(async()=>{await rpc('atlas_invite_trip',{p_trip:current.id,p_username:$('#trip-invite-username').value.trim().toLowerCase(),p_role:$('#trip-invite-role').value});people=await rpc('atlas_trip_people',{p_trip:current.id});renderPeople();$('#trip-message').textContent='Convite enviado. Ele aparece na conta do participante.';});};
    const respond=accept=>mutate(async()=>{await rpc('atlas_respond_trip_invite',{p_trip:current.id,p_accept:accept});if(accept){const member=memberships.find(m=>m.trip_id===current.id);member.status='accepted';await open(current);}else await backToList();});
    $('#trip-accept')?.addEventListener('click',()=>respond(true));$('#trip-decline')?.addEventListener('click',()=>respond(false));$('#trip-leave')?.addEventListener('click',async()=>{if(await confirmAction('Sair da trip?','Você perderá o acesso ao roteiro privado.','Sair'))respond(false);});
    if(current.cover_data){const image=document.createElement('img');image.src=current.cover_data;image.alt='Capa da trip';$('#trip-cover-preview').append(image);}
    if(current.cover_path) signedURL('atlas-trip-covers',current.cover_path,Boolean(account())).then(url=>{if(token!==epoch)return;const image=document.createElement('img');image.src=url;image.alt='Capa da trip';$('#trip-cover-preview').append(image);}).catch(()=>{});
    if(account() && saved && ['owner','editor','viewer'].includes(access(current)) && !invited && !options.publicVisitor) {
      try{people=await rpc('atlas_trip_people',{p_trip:current.id});if(token!==epoch)return;renderPeople();}catch(error){if(token===epoch)fail(error);}
    }
    if(!dialog.open)dialog.showModal();
  }
  $('#trips-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('#trips-button').onclick=()=>{current=null;$('#trip-editor-view').hidden=true;$('#trip-list-view').hidden=false;dialog.showModal();load();};
  $('#trip-new').onclick=()=>open();$('#trip-refresh').onclick=load;
  $('#trip-import').onclick=()=>$('#trip-file').click();
  $('#trip-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>3*1024*1024)throw new Error('Use um roteiro JSON de até 3 MB.');const data=JSON.parse(await file.text());if(data.format!=='atlas-roteiro'||data.version!==1)throw new Error('Selecione um roteiro exportado pelo Atlas.');const clean=cleanTrip(data.trip);await open({...clean,id:crypto.randomUUID(),is_public:false,owner_id:account(),revision:null});}catch(error){fail(error);}};
  async function route() {
    const match=location.hash.match(/^#\/roteiro\/([a-f0-9-]{36})$/i);if(!match)return;
    const token=++epoch;
    try{
      const rows=await request(`/rest/v1/trips?${new URLSearchParams({select:'*',id:`eq.${match[1]}`})}`,{authenticated:Boolean(account())});
      if(token!==epoch)return;if(!rows?.[0])throw new Error('Este roteiro não existe ou você não tem acesso.');
      if(account()) memberships=await query('trip_members',{user_id:`eq.${account()}`});
      if(token!==epoch)return;await open(rows[0],{publicVisitor:access(rows[0])==='viewer' && !memberships.some(m=>m.trip_id===rows[0].id)});
    }catch(error){if(token===epoch)fail(error);}
  }
  window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#/roteiro/'))dialog.close();else route();});
  return { route,reset(){epoch++;dialog.close();$('#share-dialog')?.close();$('#trip-editor-view').replaceChildren();current=null;trips=[];memberships=[];people=[];coverFile=null;busy=false;} };
}
