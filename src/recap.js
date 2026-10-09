import { dateDays } from './dates.js';
import { haversine } from './stats.js';
import { $, escapeHTML } from './ui.js';
import { shareText, downloadText, xmlText } from './sharing.js';
const DAY = 86400000;
export function periodSummary(destinations, year, month = 0) {
  const start = Date.UTC(year, month ? month - 1 : 0, 1) / DAY;
  const end = Date.UTC(year + (month ? 0 : 1), month || 0, 1) / DAY - 1;
  const activity = new Map(), active = new Set(), stops = [];
  let undated = 0;
  for (const d of destinations.filter((d) => !d.example && d.kind !== 'home')) for (const visit of d.visits) {
    const a = dateDays(visit.arrival), b = dateDays(visit.departure);
    if (a == null || b == null || visit.manualDays != null) { undated++; continue; }
    if (a <= end && b >= start) {
      active.add(d);
      for (let day = Math.max(a, start); day <= Math.min(b, end); day++) {
        const key = new Date(day * DAY).toISOString().slice(0, 10);
        activity.set(key, (activity.get(key) || 0) + 1);
      }
    }
    if (a >= start && a <= end) stops.push({ ...d, date: visit.arrival });
  }
  stops.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const distance = Math.round(stops.slice(1).reduce((total, d, i) => total + haversine(stops[i], d), 0));
  return { year, month, start, end, activity, cities: active.size, days: activity.size, countries: new Set([...active].map((d) => d.countryId).filter(Boolean)).size, distance, walkingDays: Math.ceil(distance / 40), undated };
}
export function calendarCells(summary) {
  const offset = (new Date(summary.start * DAY).getUTCDay() + 6) % 7;
  return Array.from({ length: Math.ceil((summary.end - summary.start + 1 + offset) / 7) * 7 }, (_, i) => {
    const day = summary.start - offset + i;
    if (day < summary.start || day > summary.end) return null;
    const date = new Date(day * DAY).toISOString().slice(0, 10);
    return { date, count: summary.activity.get(date) || 0 };
  });
}
export function recapSVG(summary, label) {
  const cells = calendarCells(summary);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="520" viewBox="0 0 1100 520"><rect width="1100" height="520" rx="28" fill="#101310"/><g font-family="Arial, sans-serif" fill="#f0ece3"><text x="46" y="62" font-size="20" fill="#c09a71">ATLAS PESSOAL</text><text x="46" y="112" font-size="32">${xmlText(label)}</text><text x="46" y="168" font-size="23">${summary.cities} destinos · ${summary.countries} países · ${summary.days} dias registrados</text><text x="46" y="207" font-size="23">${summary.distance.toLocaleString('pt-BR')} km em linha reta entre visitas</text>${cells.map((cell, i) => cell ? `<rect x="${46 + Math.floor(i / 7) * 18}" y="${246 + i % 7 * 18}" width="14" height="14" rx="3" fill="${cell.count ? cell.count > 1 ? '#c09a71' : '#7b654d' : '#263329'}"/>` : '').join('')}<text x="46" y="422" font-size="19">Equivalência: ${summary.walkingDays} dias a pé, a 5 km/h durante 8 h/dia.</text><text x="46" y="453" font-size="15" fill="#abb2a5">Estimativa ilustrativa. Não representa uma rota real de caminhada.</text><text x="46" y="483" font-size="15" fill="#abb2a5">Dias sem datas não entram no período. Dias sobrepostos contam uma vez.</text></g></svg>`;
}
export function initializeRecaps(getDestinations) {
  const dialog = document.createElement('dialog'); dialog.id = 'recap-dialog'; dialog.className = 'wide-dialog'; dialog.setAttribute('aria-labelledby', 'recap-title');
  dialog.innerHTML = `<header class="dialog-header"><div><p class="eyebrow">SEUS CAMINHOS EM NÚMEROS</p><h2 id="recap-title">Resumo das viagens</h2></div><button class="icon-button" aria-label="Fechar resumo">×</button></header><div class="account-body"><div class="form-row"><label>Ano<input id="recap-year" type="number" min="1900" max="9999" value="${new Date().getFullYear()}"></label><label>Período<select id="recap-month"><option value="0">Ano inteiro</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}">${new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2024,i,1)))}</option>`).join('')}</select></label></div><div id="recap-content" aria-live="polite"></div><div class="account-actions"><button id="recap-share" class="quiet">Resumo no WhatsApp</button><button id="recap-image" class="primary">Baixar imagem SVG</button><button id="recap-csv" class="quiet">Baixar tabela CSV</button></div></div>`;
  document.body.append(dialog); $('.icon-button',dialog).onclick = () => dialog.close();
  let current, label, annual;
  function render() {
    const year = Number($('#recap-year').value), month = Number($('#recap-month').value);
    if (!Number.isInteger(year) || year < 1900 || year > 9999) return;
    const destinations = getDestinations(); current = periodSummary(destinations,year,month); annual = Array.from({length:12},(_,i)=>periodSummary(destinations,year,i+1));
    label = month ? `${new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)))} de ${year}` : `Meu ${year} em viagens`;
    $('#recap-content').innerHTML = `<h3>${escapeHTML(label)}</h3><div class="recap-stats"><strong>${current.cities}<small>destinos</small></strong><strong>${current.days}<small>dias registrados</small></strong><strong>${current.countries}<small>países</small></strong><strong>${current.distance.toLocaleString('pt-BR')}<small>km aproximados</small></strong></div><div class="activity-scroll"><div class="activity-grid" role="img" aria-label="Calendário: ${current.days} dias com viagens registradas">${calendarCells(current).map(cell=>cell?`<span class="activity-cell level-${Math.min(2,cell.count)}" title="${cell.date}: ${cell.count} visitas" aria-label="${cell.date}: ${cell.count} visitas"></span>`:'<span></span>').join('')}</div></div><p class="field-hint">Cada quadrado representa um dia. Datas sobrepostas contam uma vez; ${current.undated} visitas sem datas não entram no calendário.</p><p class="walking-comparison">Essa distância equivale a cerca de <strong>${current.walkingDays} dias a pé</strong>, considerando 5 km/h e 8 horas por dia.</p><p class="field-hint">Distância em linha reta entre chegadas dentro do período. A comparação é ilustrativa: não calcula estradas, terreno ou rotas de caminhada.</p><div class="table-scroll"><table class="recap-table"><caption>Comparativo mensal de ${year}</caption><thead><tr><th>Mês</th><th>Destinos</th><th>Dias</th><th>Km aprox.</th></tr></thead><tbody>${annual.map(s=>`<tr><th>${new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,s.month-1,1)))}</th><td>${s.cities}</td><td>${s.days}</td><td>${s.distance}</td></tr>`).join('')}</tbody></table></div>`;
  }
  $('#recap-year').oninput = $('#recap-month').onchange = render;
  $('#recap-button').onclick = () => { render(); dialog.showModal(); };
  $('#recap-share').onclick = () => shareText(`${label} no Atlas\n${current.cities} destinos · ${current.countries} países · ${current.days} dias registrados\n${current.distance} km aproximados — equivalentes a ${current.walkingDays} dias a pé (5 km/h, 8 h/dia).\nDistâncias em linha reta; comparação ilustrativa.`);
  $('#recap-image').onclick = () => downloadText(`atlas-resumo-${current.year}-${current.month || 'anual'}.svg`,recapSVG(current,label),'image/svg+xml');
  $('#recap-csv').onclick = () => downloadText(`atlas-meses-${current.year}.csv`,'\ufeffMes;Destinos;Dias;Km aproximados\n'+annual.map(s=>`${s.month};${s.cities};${s.days};${s.distance}`).join('\n'),'text/csv;charset=utf-8');
  return { reset() { dialog.close(); $('#recap-content').replaceChildren(); current = null; annual = []; label = ''; } };
}
