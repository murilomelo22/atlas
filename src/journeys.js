import { request, currentUser, signedURL, deleteObjects } from './cloud.js';
import { getMeta, setMeta, getDestinations } from './db.js';
import { processPhoto, blobAsDataURL } from './photos.js';
import { tripGallery } from './trip-gallery.js';
import { cleanTrip, recordedVisits } from './trip-data.js';
import { displayDate } from './dates.js';
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
  const completedDialog = document.createElement('dialog'); completedDialog.id='completed-dialog'; completedDialog.className='wide-dialog'; completedDialog.setAttribute('aria-labelledby','completed-title');
  completedDialog.innerHTML='<header class="dialog-header"><h2 id="completed-title">Adicionar viagens já feitas</h2><button type="button" class="icon-button" aria-label="Fechar viagens realizadas">×</button></header><form id="completed-form" class="account-body"><p class="field-hint">Escolha visitas da sua coleção. Datas e duração são copiadas para o roteiro. Suas fotos continuam na postagem original.</p><div id="completed-list"></div><label class="manual-toggle"><input id="completed-notes" type="checkbox"> Incluir minhas notas</label><p class="field-hint">As notas copiadas poderão ser vistas pelos participantes e, se publicar o roteiro, por qualquer pessoa.</p><p id="completed-status" class="field-hint" role="status"></p><button id="completed-add" class="primary" type="submit">Adicionar selecionadas</button></form>';
  document.body.append(completedDialog); $('.icon-button',completedDialog).onclick=()=>completedDialog.close();
  let recorded=[];
  completedDialog.addEventListener('close',()=>{recorded=[];$('#completed-list').replaceChildren();});
  async function chooseRecorded() {
    const token=epoch,who=account();
    $('#completed-list').replaceChildren(); $('#completed-status').textContent='Buscando suas viagens…'; $('#completed-notes').checked=false; $('#completed-notes').disabled=!permission('edit_description'); $('#completed-add').disabled=true;
    completedDialog.showModal();
    try {
      const own = await getDestinations(); if(token!==epoch || who!==account() || !completedDialog.open)return;
      recorded=recordedVisits(own); const existing=readStops();
      $('#completed-list').innerHTML=recorded.map((row,i)=>{
        const duplicate=existing.some(s=>s.sourceDestinationId===row.stop.sourceDestinationId && s.sourceVisitId===row.stop.sourceVisitId);
        return `<label class="recorded-visit"><input type="checkbox" value="${i}" ${duplicate?'disabled':''}><span><strong>${esc(row.stop.name)}</strong><small>${esc(row.destination.countryName)} · ${row.stop.date?`${displayDate(row.stop.date)} — ${displayDate(row.stop.departure)}`:row.stop.manualDays?`${row.stop.manualDays} dias · sem datas`:'Sem datas'}${duplicate?' · Já adicionada':''}</small></span></label>`;
      }).join('');
      $('#completed-status').textContent=recorded.length?'Selecione uma ou mais visitas.':'Não há viagens realizadas nesta coleção. Registre um destino primeiro; moradias e exemplos não entram nesta lista.';
      $('#completed-add').disabled=!recorded.length;
    } catch(error) { $('#completed-status').textContent=error.message; }
  }
  $('#completed-form').onsubmit=e=>{
    e.preventDefault(); if(!permission('edit_itinerary'))return;
    const chosen=[...document.querySelectorAll('#completed-list input:checked')].map(input=>recorded[Number(input.value)]);
    if(!chosen.length){$('#completed-status').textContent='Selecione pelo menos uma visita.';return;}
    if(readStops().length+chosen.length>200){$('#completed-status').textContent='O roteiro aceita até 200 destinos.';return;}
    chosen.forEach(row=>addStop({...row.stop,notes:permission('edit_description') && $('#completed-notes').checked?row.destination.notes.slice(0,2000):''}));completedDialog.close();notify('Viagens adicionadas. Salve o roteiro para confirmar.');
  };
  let trips=[],memberships=[],current=null,people=[],coverFile=null,busy=false,epoch=0;
  let returnHash=location.hash.startsWith('#/roteiro/')?'':location.hash;
  dialog.addEventListener('close',()=>{if(!dialog.open && location.hash.startsWith('#/roteiro/'))history.replaceState(null,'',location.pathname+location.search+returnHash);});
  function backToList() { current=null; people=[]; coverFile=null; $('#trip-editor-view').replaceChildren(); $('#trip-editor-view').hidden=true; $('#trip-list-view').hidden=false; return load(); }
  const account=()=>currentUser()?.id || null;
  const access=(trip)=> !account() && !trip.owner_id ? 'owner' : trip.owner_id===account() ? 'owner' : memberships.find(m=>m.trip_id===trip.id)?.status==='accepted' ? memberships.find(m=>m.trip_id===trip.id)?.role : 'viewer';
  const permission=(action)=> {
    if(!current)return false;
    if(access(current)==='owner')return true;
    const member=memberships.find(m=>m.trip_id===current.id);
    return member?.status==='accepted' && (member[`can_${action}`] ?? (['edit_itinerary','edit_description'].includes(action) && member.role==='editor'));
  };
  const canEdit=()=>permission('edit_itinerary') || permission('edit_description');
  const permissionFields=[['edit_itinerary','Editar roteiro, nome e capa'],['edit_description','Escrever descrições e planos'],['add_photos','Adicionar fotos e vídeos / Live Photos'],['publish_profile','Publicar no próprio perfil (roteiro público)']];
  const checks=(member={})=>permissionFields.map(([key,label])=>`<label class="manual-toggle"><input type="checkbox" data-permission="${key}" ${(member[`can_${key}`] ?? (key.startsWith('edit_') && member.role==='editor'))?'checked':''}> ${label}</label>`).join('');
  const permissionBody=(container)=>Object.fromEntries(permissionFields.map(([key])=>[`p_${({edit_itinerary:'itinerary',edit_description:'description',add_photos:'photos',publish_profile:'publish'})[key]}`,container.querySelector(`[data-permission="${key}"]`).checked]));
  const fail=(error)=>{
    const text=['42P01','PGRST202','PGRST205'].includes(error.code)?'As trips na nuvem ainda precisam ser ativadas pelo responsável pelo site. Seus destinos continuam disponíveis.':error.message.startsWith('Sem conexão')?'Sem conexão. Não foi possível confirmar o envio. Mantenha esta tela aberta e tente novamente.':error.message;
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
      $('#trip-list-status').textContent=account()?'Convites aparecem aqui. As permissões de cada colaborador são definidas pelo criador; aceite para participar.':'Roteiros locais. Exporte o JSON para levar à sua conta ou a outro dispositivo.';
      $('#trip-list').innerHTML=trips.length?trips.map(t=>`<button class="trip-card" data-trip="${esc(t.id)}"><strong>${esc(t.name)}</strong><span>${t.stops.length} destinos · ${t.is_public?'Pública por link':'Privada'}</span><small>${memberships.find(m=>m.trip_id===t.id)?.status==='invited'?'Convite pendente':access(t)==='owner'?'Você organiza':access(t)==='editor'?'Você edita':'Você acompanha'}</small></button>`).join(''):'<p class="field-hint">Sua próxima viagem começa com um roteiro. Crie a primeira trip.</p>';
      $('#trip-list').querySelectorAll('[data-trip]').forEach(b=>b.onclick=()=>open(trips.find(t=>t.id===b.dataset.trip)));
    } catch(error) { if(token===epoch) fail(error); }
  }
  function readStops() {
    return [...$('#trip-stops').children].map(row=>({...row.recordedVisit,id:row.dataset.stop,name:$('[data-stop-name]',row).value,lat:$('[data-stop-lat]',row).value,lng:$('[data-stop-lng]',row).value,date:$('[data-stop-date]',row).value,notes:$('[data-stop-notes]',row).value,...(row.recordedVisit?.completed?{departure:$('[data-stop-departure]',row).value}:{})}));
  }
  function renumber() { [...$('#trip-stops').children].forEach((row,i)=>$('[data-stop-number]',row).textContent=`Destino ${i+1}`); }
  function addStop(stop={}) {
    const row=document.createElement('div'); row.className='trip-stop'; row.dataset.stop=stop.id || crypto.randomUUID();
    if(stop.completed)row.recordedVisit={completed:true,departure:stop.departure || '',manualDays:stop.manualDays ?? null,sourceDestinationId:stop.sourceDestinationId,sourceVisitId:stop.sourceVisitId};
    row.innerHTML=`<div class="trip-stop-heading"><strong data-stop-number></strong><div><button type="button" data-up aria-label="Mover destino para cima">↑</button><button type="button" data-down aria-label="Mover destino para baixo">↓</button><button type="button" data-remove aria-label="Remover destino do roteiro">×</button></div></div><label>Destino<input data-stop-name maxlength="120" required value="${esc(stop.name || '')}"></label><div class="form-row"><label>Latitude<input data-stop-lat type="number" min="-90" max="90" step="any" required value="${esc(stop.lat ?? '')}"></label><label>Longitude<input data-stop-lng type="number" min="-180" max="180" step="any" required value="${esc(stop.lng ?? '')}"></label><label>Data planejada<input data-stop-date type="date" value="${esc(stop.date || '')}"></label></div><label>Plano para este destino<textarea data-stop-notes maxlength="2000" rows="2">${esc(stop.notes || '')}</textarea></label>`;
    $('[data-up]',row).onclick=()=>{if(row.previousElementSibling) row.parentNode.insertBefore(row,row.previousElementSibling);renumber();};
    $('[data-down]',row).onclick=()=>{if(row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling,row);renumber();};
    $('[data-remove]',row).onclick=()=>{row.remove();renumber();};
    if(stop.completed) {
      $('[data-stop-date]',row).parentElement.firstChild.textContent='Chegada da viagem realizada';
      const badge=document.createElement('p');badge.className='highlight-badge';badge.textContent=`✓ Viagem realizada${stop.manualDays?` · ${stop.manualDays} dias sem datas`:''}`;$('.trip-stop-heading',row).after(badge);
      const label=document.createElement('label');label.textContent='Partida da viagem realizada';const input=document.createElement('input');input.type='date';input.dataset.stopDeparture='';input.value=stop.departure || '';label.append(input);$('[data-stop-date]',row).closest('.form-row').after(label);
    }
    for(const input of row.querySelectorAll('input,textarea')) input.disabled=!permission(input.hasAttribute('data-stop-notes')?'edit_description':'edit_itinerary');
    for(const button of row.querySelectorAll('button')) {button.disabled=!permission('edit_itinerary');button.hidden=!permission('edit_itinerary');}
    $('#trip-stops').append(row); renumber();
  }
  function renderPeople() {
    const owner=access(current)==='owner';
    $('#trip-people').innerHTML=people.length?people.map(p=>`<div class="trip-person" data-person="${esc(p.user_id)}"><div><strong>@${esc(p.username)}</strong><p class="field-hint">${p.role==='editor'?'Editor':'Acompanhante'} · ${p.status==='invited'?'Convite pendente':'Participando'}</p><fieldset class="trip-permissions" ${owner?'':'disabled'}><legend>Permissões de @${esc(p.username)}</legend>${checks(p)}</fieldset></div>${owner?`<div class="person-actions"><button type="button" class="quiet" data-save-person="${esc(p.user_id)}">Salvar permissões</button><button type="button" class="text-button" data-remove-person="${esc(p.user_id)}">Remover</button></div>`:''}</div>`).join(''):'<p class="field-hint">Nenhum participante adicionado.</p>';
    $('#trip-people').querySelectorAll('[data-save-person]').forEach(b=>b.onclick=()=>mutate(async()=>{
      const id=current.id,token=epoch,body={p_trip:id,p_user:b.dataset.savePerson,...permissionBody(b.closest('[data-person]'))};
      await rpc('atlas_set_trip_permissions',body); if(token!==epoch)return;
      people=await rpc('atlas_trip_collaborators',{p_trip:id});if(token!==epoch)return;renderPeople();$('#trip-message').textContent='Permissões atualizadas.';
    }));
    $('#trip-people').querySelectorAll('[data-remove-person]').forEach(b=>b.onclick=()=>mutate(async()=>{const id=current.id,token=epoch;await rpc('atlas_remove_trip_member',{p_trip:id,p_user:b.dataset.removePerson});if(token!==epoch)return;people=await rpc('atlas_trip_collaborators',{p_trip:id});if(token===epoch)renderPeople();}));
  }
  function mutate(action) {
    if(busy)return;
    const token=epoch,who=account(),key=Symbol('mutation'); busy=key;
    const buttons=[...$('#trip-editor-view').querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
    return Promise.resolve().then(action).catch(error=>{if(token===epoch && who===account())fail(error);}).finally(()=>{if(busy!==key)return;busy=false;if(token===epoch && who===account())buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});});
  }
  async function open(trip,options={}) {
    const token=++epoch; current=trip?structuredClone(trip):{id:crypto.randomUUID(),name:'',notes:'',stops:[],is_public:false,owner_id:account(),revision:null,cover_path:null}; coverFile=null; people=[];
    $('#trip-list-view').hidden=true; $('#trip-editor-view').hidden=false;
    const editable=canEdit(),itinerary=permission('edit_itinerary'),owner=access(current)==='owner',invited=memberships.find(m=>m.trip_id===current.id)?.status==='invited',saved=Boolean(current.revision || trips.some(t=>t.id===current.id));
    $('#trip-editor-view').innerHTML=`<button id="trip-back" class="text-button" type="button">← Todas as trips</button><form id="trip-form"><fieldset id="trip-fields" ${editable?'':'disabled'}><label>Nome da trip<input id="trip-name" maxlength="120" required value="${esc(current.name)}"></label><label>Descrição<textarea id="trip-notes" maxlength="5000" rows="3">${esc(current.notes || '')}</textarea></label><div id="trip-cover-preview" class="trip-cover-preview"></div><label ${itinerary?'':'hidden'}>Foto de capa<input id="trip-cover" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="manual-toggle"><input id="trip-public" type="checkbox" ${current.is_public?'checked':''} ${owner && account()?'':'disabled'}> Roteiro público por link</label><p class="field-hint">Um roteiro público mostra nome, capa, descrição, destinos e planos, mesmo se seu perfil estiver privado. Postagens pessoais não são copiadas automaticamente.</p><h3>Destinos na ordem do roteiro</h3><div id="trip-stops"></div><div class="account-actions" ${itinerary?'':'hidden'}><button type="button" id="trip-add-stop" class="quiet">＋ Novo destino</button><label>Adicionar do meu atlas<select id="trip-existing"><option value="">Escolher destino…</option>${callbacks.destinations().map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></label></div></fieldset><p id="trip-message" class="field-hint" role="status"></p><div class="account-actions"><button type="submit" id="trip-save" class="primary" ${editable?'':'hidden'}>Salvar roteiro</button><button type="button" id="trip-share" class="quiet" ${saved?'':'hidden'}>Compartilhar roteiro</button><button type="button" id="trip-export" class="quiet">Exportar JSON</button><button type="button" id="trip-map" class="quiet">Ver no mapa</button><button type="button" id="trip-delete" class="text-button" ${saved && owner?'':'hidden'}>Excluir trip</button></div></form><section id="trip-members-section" ${account() && saved?'':'hidden'}><h3>Grupo da viagem</h3>${invited?'<p>Você recebeu um convite para esta trip.</p><div class="account-actions"><button id="trip-accept" class="primary">Aceitar convite</button><button id="trip-decline" class="quiet">Recusar</button></div>':''}<div id="trip-people"></div><form id="trip-invite-form" ${owner?'':'hidden'}><div class="form-row"><label>Nome de usuário<input id="trip-invite-username" required pattern="[a-z0-9_]{3,30}" maxlength="30" placeholder="ex.: murilo_viagens"></label><label>Modelo de permissões<select id="trip-invite-role"><option value="viewer">Acompanhar</option><option value="editor">Editar roteiro</option></select></label></div><fieldset id="trip-invite-permissions" class="trip-permissions"><legend>Permissões do novo colaborador</legend>${checks()}</fieldset><button class="quiet" type="submit">Enviar convite</button><p class="field-hint">O usuário precisa ter um perfil encontrável. O convite aparece em Trips e roteiros. Só você gerencia participantes e torna o roteiro público. Autorizar publicação no perfil não torna uma trip privada pública.</p></form>${!owner && !invited && memberships.some(m=>m.trip_id===current.id)?'<button id="trip-leave" class="text-button">Sair do grupo</button>':''}</section><section id="trip-gallery-section" ${account() && saved || options.publicVisitor?'':'hidden'}></section><section id="trip-publication-section" ${account() && saved && (owner || memberships.some(m=>m.trip_id===current.id && m.status==='accepted'))?'':'hidden'}><h3>No meu perfil</h3><p class="field-hint">Com autorização do criador, uma trip pública pode aparecer no seu perfil encontrável. As postagens pessoais continuam separadas.</p><button id="trip-publish-profile" type="button" class="quiet" disabled>Publicar no meu perfil</button><p id="trip-publication-status" class="field-hint" role="status"></p></section>`;
    for(const stop of current.stops)addStop(stop);
    $('#trip-name').disabled=!itinerary;$('#trip-cover').disabled=!itinerary;$('#trip-notes').disabled=!permission('edit_description');
    $('#trip-add-stop').disabled=!itinerary;$('#trip-existing').disabled=!itinerary;
    $('#trip-invite-role').onchange=e=>{for(const key of ['edit_itinerary','edit_description'])$('#trip-invite-permissions').querySelector(`[data-permission="${key}"]`).checked=e.target.value==='editor';};
    $('#trip-back').onclick=backToList;
    $('#trip-add-stop').onclick=()=>addStop();
    const completedButton=document.createElement('button');completedButton.type='button';completedButton.id='trip-add-completed';completedButton.className='quiet';completedButton.textContent='Adicionar viagens já feitas';$('#trip-add-stop').after(completedButton);completedButton.onclick=chooseRecorded;
    $('#trip-existing').onchange=e=>{const d=callbacks.destinations().find(d=>d.id===e.target.value);if(d)addStop({name:d.name,lat:d.lat,lng:d.lng});e.target.value='';};
    $('#trip-cover').onchange=e=>{coverFile=e.target.files[0] || null;};
    const draft=()=>cleanTrip({...current,name:$('#trip-name').value,notes:$('#trip-notes').value,stops:readStops(),is_public:$('#trip-public').checked});
    $('#trip-form').onsubmit=e=>{e.preventDefault();if(!canEdit())return;mutate(async()=>{
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
    $('#trip-invite-form').onsubmit=e=>{e.preventDefault();mutate(async()=>{const id=current.id,token=epoch;await rpc('atlas_invite_trip_permissions',{p_trip:id,p_username:$('#trip-invite-username').value.trim().toLowerCase(),...permissionBody($('#trip-invite-permissions'))});if(token!==epoch)return;people=await rpc('atlas_trip_collaborators',{p_trip:id});if(token!==epoch)return;renderPeople();$('#trip-message').textContent='Convite enviado. Ele aparece na conta do participante.';});};
    const respond=accept=>mutate(async()=>{await rpc('atlas_respond_trip_invite',{p_trip:current.id,p_accept:accept});if(accept){const member=memberships.find(m=>m.trip_id===current.id);member.status='accepted';await open(current);}else await backToList();});
    $('#trip-accept')?.addEventListener('click',()=>respond(true));$('#trip-decline')?.addEventListener('click',()=>respond(false));$('#trip-leave')?.addEventListener('click',async()=>{if(await confirmAction('Sair da trip?','Você perderá o acesso ao roteiro privado.','Sair'))respond(false);});
    if(current.cover_data){const image=document.createElement('img');image.src=current.cover_data;image.alt='Capa da trip';$('#trip-cover-preview').append(image);}
    if(current.cover_path) signedURL('atlas-trip-covers',current.cover_path,Boolean(account())).then(url=>{if(token!==epoch)return;const image=document.createElement('img');image.src=url;image.alt='Capa da trip';$('#trip-cover-preview').append(image);}).catch(()=>{});
    if(account() && saved && ['owner','editor','viewer'].includes(access(current)) && !invited && !options.publicVisitor) {
      try{people=await rpc('atlas_trip_collaborators',{p_trip:current.id});if(token!==epoch)return;renderPeople();}catch(error){if(token===epoch)fail(error);}
    }
    if(token!==epoch)return;
    if(!dialog.open)dialog.showModal();
    if(saved && (account() || options.publicVisitor)) {
      const valid=()=>token===epoch && Boolean(current) && current.id===trip.id;
      const gallery=tripGallery({container:$('#trip-gallery-section'),trip:current,canAdd:permission('add_photos'),owner,valid,mutate});
      gallery.load().catch(error=>{if(valid())fail(error);});
      if(account() && !$('#trip-publication-section').hidden) {
        try {
          const publications=await query('trip_publications',{trip_id:`eq.${current.id}`,user_id:`eq.${account()}`});if(!valid())return;
          let published=publications.length>0;const button=$('#trip-publish-profile');
          const render=()=>{button.textContent=published?'Retirar do meu perfil':'Publicar no meu perfil';button.disabled=!published && (!permission('publish_profile') || !current.is_public);$('#trip-publication-status').textContent=published?'Esta trip está no seu perfil público.':!permission('publish_profile')?'O criador não autorizou a publicação no seu perfil.':!current.is_public?'O criador precisa tornar o roteiro público para publicar no perfil.':'Seu perfil precisa estar encontrável para que outras pessoas vejam a trip.';};render();
          button.onclick=()=>mutate(async()=>{await rpc('atlas_publish_trip_profile',{p_trip:current.id,p_publish:!published});if(!valid())return;published=!published;render();});
        } catch(error) {if(valid())fail(error);}
      }
    }
  }
  $('#trips-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('#trips-button').onclick=()=>{current=null;$('#trip-editor-view').hidden=true;$('#trip-list-view').hidden=false;dialog.showModal();load();};
  $('#trip-new').onclick=()=>open();$('#trip-refresh').onclick=load;
  $('#trip-import').onclick=()=>$('#trip-file').click();
  $('#trip-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>3*1024*1024)throw new Error('Use um roteiro JSON de até 3 MB.');const data=JSON.parse(await file.text());if(data.format!=='atlas-roteiro'||data.version!==1)throw new Error('Selecione um roteiro exportado pelo Atlas.');const clean=cleanTrip(data.trip);await open({...clean,id:crypto.randomUUID(),is_public:false,owner_id:account(),revision:null});}catch(error){fail(error);}};
  async function route() {
    const match=location.hash.match(/^#\/roteiro\/([a-f0-9-]{36})$/i);if(!match)return;
    const token=++epoch;
    current=null;$('#trip-editor-view').replaceChildren();
    try{
      const rows=await request(`/rest/v1/trips?${new URLSearchParams({select:'*',id:`eq.${match[1]}`})}`,{authenticated:Boolean(account())});
      if(token!==epoch || location.hash!==match[0])return;if(!rows?.[0])throw new Error('Este roteiro não existe ou você não tem acesso.');
      if(account()) memberships=await query('trip_members',{user_id:`eq.${account()}`});
      if(token!==epoch)return;await open(rows[0],{publicVisitor:access(rows[0])==='viewer' && !memberships.some(m=>m.trip_id===rows[0].id)});
    }catch(error){if(token===epoch)fail(error);}
  }
  window.addEventListener('hashchange',event=>{if(!location.hash.startsWith('#/roteiro/'))dialog.close();else {const previous=new URL(event.oldURL).hash;if(!previous.startsWith('#/roteiro/'))returnHash=previous;route();}});
  return { route,reset(){epoch++;completedDialog.close();$('#completed-list').replaceChildren();recorded=[];dialog.close();$('#share-dialog')?.close();$('#trip-editor-view').replaceChildren();current=null;trips=[];memberships=[];people=[];coverFile=null;busy=false;} };
}
