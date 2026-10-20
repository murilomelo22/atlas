const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const aliases = { US: ['EUA', 'USA', 'Estados Unidos da América'], GB: ['UK', 'Inglaterra', 'Grã-Bretanha'], NL: ['Holanda'], CZ: ['República Tcheca'], VA: ['Vaticano'], KR: ['Coreia do Sul'] };

// Focus the main territory and nearby islands; keep archipelagos together and
// wrap longitudes around their main island rather than across the whole world.
export function countryFocusBounds(feature) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const area = ring => Math.abs(ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0));
  const largest = polygons.reduce((a, b) => area(a[0]) >= area(b[0]) ? a : b);
  const anchor = largest[0].reduce((sum, p) => sum + p[0], 0) / largest[0].length;
  const unwrap = lng => lng + 360 * Math.round((anchor - lng) / 360);
  const boxes = polygons.map(polygon => {
    const ring = polygon[0];
    return [Math.min(...ring.map(p => p[1])), Math.min(...ring.map(p => unwrap(p[0]))), Math.max(...ring.map(p => p[1])), Math.max(...ring.map(p => unwrap(p[0])))];
  });
  const main = boxes[polygons.indexOf(largest)];
  const archipelago = ['ID', 'PH', 'JP', 'NZ', 'FJ', 'BS', 'GR'].includes(feature.properties.iso);
  const nearby = boxes.filter(b => archipelago || ((b[0] + b[2]) / 2 >= main[0] - 8 && (b[0] + b[2]) / 2 <= main[2] + 8 && (b[1] + b[3]) / 2 >= main[1] - 8 && (b[1] + b[3]) / 2 <= main[3] + 8));
  return [[Math.min(...nearby.map(b => b[0])), Math.min(...nearby.map(b => b[1]))], [Math.max(...nearby.map(b => b[2])), Math.max(...nearby.map(b => b[3]))]];
}

export function initializeCountrySearch(countries, controller) {
  const toggle = document.getElementById('country-search-button');
  const panel = document.getElementById('country-search-panel');
  const input = document.getElementById('country-search-input');
  const results = document.getElementById('country-search-results');
  const feedback = document.getElementById('country-search-feedback');
  const summary = document.getElementById('country-search-summary');
  const status = document.getElementById('country-search-status');
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  let selected = null, matches = [], generation = 0;
  const index = countries.features.map(country => {
    const iso = country.properties.iso;
    return { country, terms: [country.properties.name, iso, ...(aliases[iso] || []), iso ? names.of(iso) : ''].map(fold).filter(Boolean) };
  });
  function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  function search() {
    const query = fold(input.value);
    results.replaceChildren();
    matches = query ? index.filter(entry => entry.terms.some(term => term.includes(query))).sort((a, b) => {
      const rank = entry => Math.min(...entry.terms.map(term => term === query ? 0 : term.startsWith(query) ? 1 : 2));
      return rank(a) - rank(b) || a.country.properties.name.localeCompare(b.country.properties.name, 'pt-BR');
    }).slice(0, 8) : [];
    feedback.textContent = !query ? 'Pesquise um país pelo nome ou pela sigla.' : !matches.length ? 'Nenhum país encontrado. Tente outro nome.' : `${matches.length} ${matches.length === 1 ? 'resultado' : 'resultados'}. Escolha um país.`;
    for (const { country } of matches) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = country.properties.name;
      button.onclick = () => select(country);
      results.append(button);
    }
  }
  async function select(country, fit = true) {
    const token = ++generation;
    selected = country; input.value = country.properties.name; close();
    summary.hidden = false; document.getElementById('country-search-name').textContent = country.properties.name;
    const count = controller.countryVisits(country).length;
    document.getElementById('country-search-count').textContent = count ? `${count} ${count === 1 ? 'lugar visitado' : 'lugares visitados'}` : 'Você ainda não registrou visitas neste país.';
    status.textContent = 'Carregando divisões administrativas…';
    if (fit) toggle.focus({ preventScroll: true });
    const divisions = await controller.showCountry(country, { fit });
    if (token !== generation) return;
    const finalCount = controller.countryVisits(country).length;
    document.getElementById('country-search-count').textContent = finalCount ? `${finalCount} ${finalCount === 1 ? 'lugar visitado' : 'lugares visitados'}` : 'Você ainda não registrou visitas neste país.';
    status.textContent = divisions.error ? 'Divisões indisponíveis agora. Pesquise novamente para tentar carregar.' : !divisions.count ? 'Divisões administrativas não disponíveis nesta base.' : `${divisions.count} divisões administrativas${divisions.visited ? ` · ${divisions.visited} ${divisions.visited === 1 ? 'visitada' : 'visitadas'}` : ''}.`;
  }
  toggle.onclick = () => {
    if (!panel.hidden) { close(); return; }
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); search(); input.focus(); input.select();
  };
  document.getElementById('country-search-close').onclick = () => { close(); toggle.focus(); };
  input.oninput = search;
  document.getElementById('country-search-form').onsubmit = event => {
    event.preventDefault();
    const exact = matches.find(entry => entry.terms.includes(fold(input.value)));
    if (exact || matches.length === 1) select((exact || matches[0]).country);
    else feedback.textContent = matches.length ? 'Escolha um país nos resultados abaixo.' : 'Nenhum país encontrado. Tente outro nome.';
  };
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); toggle.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const buttons = [...results.children];
      if (!buttons.length) return;
      event.preventDefault();
      const current = buttons.indexOf(document.activeElement), step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(current + step + buttons.length) % buttons.length].focus();
    }
  });
  function reset({ fit = false } = {}) {
    generation++; selected = null; input.value = ''; close(); summary.hidden = true;
    controller.clearCountry(); if (fit) controller.fitVisited();
  }
  document.getElementById('country-search-clear').onclick = () => { reset({ fit: true }); toggle.focus(); };
  toggle.disabled = false;
  return { reset, refresh: () => { if (selected) select(selected, false); } };
}
