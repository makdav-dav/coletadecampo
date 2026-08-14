/* ================================================================
   Validação do local no mapa — mostra o ponto do GPS num mapa e
   deixa o coletor arrastar o pino para o lugar certo antes de salvar.

   confirmarLocalNoMapa(gps) → Promise que resolve com:
     { lat, lng, lat_gps, lng_gps, prec, ajustado }
       lat/lng      → posição final do pino (localização OFICIAL)
       lat_gps/lng_gps → leitura bruta do GPS (guardada p/ auditoria)
       prec         → precisão informada pelo GPS (m)
       ajustado     → true se o pino foi movido do ponto do GPS
   …ou resolve com null se o usuário cancelar (aborta o salvamento).

   Precisa de internet (tiles do OpenStreetMap). Sem sinal, salva a
   posição bruta do GPS sem abrir o mapa.
   ================================================================ */
function confirmarLocalNoMapa(gps) {
  return new Promise(resolve => {
    if (!gps || gps.lat == null || gps.lng == null) return resolve(null);

    // leitura bruta do GPS a preservar (no modo edição pode vir separada)
    const rawLat = gps.lat_gps != null ? +gps.lat_gps : +gps.lat;
    const rawLng = gps.lng_gps != null ? +gps.lng_gps : +gps.lng;
    const prec   = gps.prec != null ? +gps.prec : null;
    const bruto  = { lat: +gps.lat, lng: +gps.lng, lat_gps: rawLat, lng_gps: rawLng, prec, ajustado: false };

    const semMapa = msg => {
      if (typeof showToast === 'function') showToast(msg, 'info');
      resolve(bruto);
    };

    if (!navigator.onLine) return semMapa('Sem internet — o mapa não abre. Salvando a posição do GPS.');
    if (typeof carregarLeaflet !== 'function') return semMapa('Mapa indisponível. Salvando a posição do GPS.');

    carregarLeaflet().then(() => montar()).catch(() =>
      semMapa('Sem acesso ao mapa. Salvando a posição do GPS.'));

    function montar() {
      const wrap = document.createElement('div');
      wrap.className = 'mp-wrap';
      wrap.innerHTML = `
        <div class="mp-backdrop"></div>
        <div class="mp-modal" role="dialog" aria-label="Confirmar local do ponto">
          <div class="mp-head">
            <div class="mp-title">Confirme o local do ponto</div>
            <div class="mp-sub">Arraste o pino azul para o local exato antes de salvar.</div>
          </div>
          <div class="mp-map"></div>
          <div class="mp-info"></div>
          <div class="mp-actions">
            <button type="button" class="btn btn-sm mp-reset">Voltar ao GPS</button>
            <button type="button" class="btn btn-sm mp-cancel">Cancelar</button>
            <button type="button" class="btn btn-primary mp-ok">Confirmar local</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);

      const mapEl  = wrap.querySelector('.mp-map');
      const infoEl = wrap.querySelector('.mp-info');

      const map = L.map(mapEl, { zoomControl: true, attributionControl: false })
        .setView([+gps.lat, +gps.lng], 18);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      // círculo de precisão em torno da leitura bruta do GPS
      const circ = L.circle([rawLat, rawLng], {
        radius: prec && prec > 0 ? prec : 10,
        color: '#5680D0', weight: 1, fillColor: '#5680D0', fillOpacity: 0.12
      }).addTo(map);

      const marker = L.marker([+gps.lat, +gps.lng], { draggable: true, autoPan: true }).addTo(map);

      const atualizarInfo = () => {
        const p = marker.getLatLng();
        const movido = map.distance(p, L.latLng(rawLat, rawLng)); // metros
        const linhaPrec = prec != null ? `GPS: ±${Math.round(prec)} m` : 'GPS sem precisão informada';
        infoEl.innerHTML = movido < 1
          ? `${linhaPrec} · <b>pino sobre o GPS</b>`
          : `${linhaPrec} · <b>pino movido ${movido < 1000 ? Math.round(movido) + ' m' : (movido/1000).toFixed(2) + ' km'}</b>`;
      };
      atualizarInfo();
      marker.on('drag', atualizarInfo);
      marker.on('dragend', atualizarInfo);
      // toque no mapa também reposiciona o pino
      map.on('click', e => { marker.setLatLng(e.latlng); atualizarInfo(); });

      setTimeout(() => map.invalidateSize(), 60);

      const fechar = res => { try { map.remove(); } catch (e) {} wrap.remove(); resolve(res); };

      wrap.querySelector('.mp-reset').onclick = () => {
        marker.setLatLng([rawLat, rawLng]);
        map.panTo([rawLat, rawLng]);
        atualizarInfo();
      };
      wrap.querySelector('.mp-cancel').onclick = () => fechar(null);
      wrap.querySelector('.mp-ok').onclick = () => {
        const p = marker.getLatLng();
        const movido = map.distance(p, L.latLng(rawLat, rawLng));
        fechar({
          lat: p.lat, lng: p.lng,
          lat_gps: rawLat, lng_gps: rawLng,
          prec, ajustado: movido >= 1
        });
      };
    }
  });
}
