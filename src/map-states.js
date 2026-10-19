// Local geometry keeps the UF divisions available without online map tiles.
export function createBrazilStateLayer(map, getTheme) {
  const bounds = L.latLngBounds([[-34, -74], [6, -34]]);
  const pane = map.createPane('brazilStates');
  pane.style.zIndex = '410';
  pane.style.pointerEvents = 'none';
  let layer, loading;
  const visible = () => map.getZoom() >= 4 && map.getBounds().intersects(bounds);
  const style = () => ({
    color: getTheme() === 'dark' ? '#a3b29a' : '#566c58',
    weight: map.getZoom() >= 6 ? 1.2 : 0.8,
    opacity: 0.85, fill: false, interactive: false,
  });
  function refresh() {
    if (!visible()) { if (layer) map.removeLayer(layer); return; }
    if (layer) {
      layer.setStyle(style);
      if (!map.hasLayer(layer)) layer.addTo(map);
      return;
    }
    if (loading) return;
    loading = fetch('./vendor/brazil-states.geojson').then(async response => {
      if (!response.ok) throw new Error('Divisas estaduais indisponíveis. Recarregue o atlas para tentar novamente.');
      layer = L.geoJSON(await response.json(), {
        pane: 'brazilStates', interactive: false, style,
        onEachFeature(feature, state) {
          state.on('add', () => { state.getElement()?.setAttribute('data-uf', feature.properties.sigla); });
        },
      });
      refresh();
    }).catch(() => {
      document.getElementById('map-status').textContent = 'Divisas estaduais indisponíveis. Recarregue o atlas para tentar novamente.';
    }).finally(() => { loading = null; });
  }
  map.on('zoomend moveend', refresh);
  return { refresh };
}
