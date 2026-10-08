export function createGeocoder(onResults, onStatus) {
  let timer, controller, sequence = 0, lastRequest = 0;
  return {
    search(query) {
      clearTimeout(timer);
      controller?.abort();
      const current = ++sequence;
      onResults([]);
      if (query.trim().length < 3) { onStatus('Digite ao menos 3 caracteres.'); return; }
      onStatus('Buscando lugares…');
      timer = setTimeout(async () => {
        // Debounce plus a global minimum interval of one second between requests.
        if (current !== sequence) return;
        lastRequest = Date.now();
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 10000);
        try {
          const url = new URL('https://nominatim.openstreetmap.org/search');
          url.search = new URLSearchParams({ q: query.trim(), format: 'jsonv2', limit: '5', 'accept-language': 'pt-BR' });
          const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
          if (!response.ok) throw new Error('network');
          const raw = await response.json();
          if (!Array.isArray(raw)) throw new Error('response');
          const results = raw.filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && Math.abs(Number(r.lat)) <= 90 && Math.abs(Number(r.lon)) <= 180).map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), name: String(r.display_name || '').split(',')[0], label: String(r.display_name || '') }));
          if (current !== sequence) return;
          onResults(results);
          onStatus(results.length ? 'Escolha um lugar abaixo.' : 'Nenhum lugar encontrado. Use o mapa ou as coordenadas.');
        } catch {
          if (current === sequence) onStatus('A busca está indisponível. Clique no mapa ou informe as coordenadas.');
        } finally { clearTimeout(timeout); }
      }, Math.max(450, 1000 - (Date.now() - lastRequest)));
    },
    cancel() { sequence++; clearTimeout(timer); controller?.abort(); },
  };
}
