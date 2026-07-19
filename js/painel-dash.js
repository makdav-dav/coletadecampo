/* ================================================================
   PAINEL (dashboard desktop) — KPIs, progresso, mapa e grid c/ fotos
   Cores validadas p/ daltonismo sobre superfície branca.
   ================================================================ */
const DASH_COR = { feito: '#1E8659', planejado: '#B07222', jard: '#2C5D9E' };
let dashItens = [];
let dashFiltro = 'todos';
let dashMapa = null;
let leafletPromise = null;

function carregarLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => res();
    s.onerror = () => { leafletPromise = null; rej(new Error('sem acesso ao CDN do mapa')); };
    document.body.appendChild(s);
  });
  return leafletPromise;
}

async function dashAbrir() {
  const box = document.getElementById('cons-resultado');
  if (!sessionValida() || !navigator.onLine) {
    box.innerHTML = '<div class="empty">Conecte-se à internet para montar o painel.</div>';
    return;
  }
  box.innerHTML = '<div class="empty">Montando painel…</div>';
  try {
    const [ruas, espacos] = await Promise.all([
      sbSelect('arbo_ruas', 'select=id_rua,nome_rua,bairro,arbo_trechos(id_trecho,status,arbo_pontos(id_ponto,seq,numeracao,lat,lng,especie_plano,especie_sugerida,status))&order=criado_em.desc') .then(r => r || []),
      sbSelect('jard_espacos', 'select=id_espaco,codigo,nome,tipo,bairro,lat,lng,jard_canteiros(id_canteiro,seq,area_m2,situacao,jard_especies(qtd_mudas))&order=criado_em.desc').then(r => r || [])
    ]);

    const pontos = [];
    ruas.forEach(r => (r.arbo_trechos || []).forEach(t => (t.arbo_pontos || []).forEach(p => pontos.push({ ...p, rua: r }))));
    const cants = [];
    espacos.forEach(e => (e.jard_canteiros || []).forEach(c => cants.push(c)));

    const [fPt, fEsp, fCant] = await Promise.all([
      carregarFotos('arbo_ponto', pontos.map(p => p.id_ponto)),
      carregarFotos('jard_espaco', espacos.map(e => e.id_espaco)),
      carregarFotos('jard_canteiro', cants.map(c => c.id_canteiro))
    ]);

    // ── indicadores ──
    const feitos = pontos.filter(p => p.status !== 'planejado').length;
    const planejados = pontos.length - feitos;
    const pct = pontos.length ? Math.round(feitos / pontos.length * 100) : 0;
    const nTrechos = ruas.reduce((s, r) => s + (r.arbo_trechos || []).length, 0);
    const areaTot = cants.reduce((s, c) => s + (+c.area_m2 || 0), 0);
    const mudasTot = cants.reduce((s, c) => s + (c.jard_especies || []).reduce((a, x) => a + (+x.qtd_mudas || 0), 0), 0);
    const nFotos = [fPt, fEsp, fCant].reduce((s, m) => s + Object.values(m).reduce((a, arr) => a + arr.length, 0), 0);

    // ── itens do grid + mapa ──
    dashItens = [];
    pontos.forEach(p => dashItens.push({
      tipo: 'arbo', feito: p.status !== 'planejado',
      titulo: (p.rua.nome_rua || '') + ' · P' + (p.seq || '?'),
      sub: [p.numeracao && 'nº ' + p.numeracao, p.especie_plano || p.especie_sugerida,
            p.status === 'planejado' ? '⏳ a coletar' : '✓ coletado'].filter(Boolean).join(' · '),
      lat: p.lat, lng: p.lng, fotos: fPt[p.id_ponto] || []
    }));
    espacos.forEach(e => dashItens.push({
      tipo: 'jard', feito: true,
      titulo: e.nome || e.codigo || 'Espaço',
      sub: [TIPO_L2[e.tipo] || e.tipo, e.bairro, (e.jard_canteiros || []).length + ' canteiro(s)'].filter(Boolean).join(' · '),
      lat: e.lat, lng: e.lng,
      fotos: (fEsp[e.id_espaco] || []).concat((e.jard_canteiros || []).flatMap(c => fCant[c.id_canteiro] || []))
    }));

    // ── progresso por rua (as com mais pendências primeiro) ──
    const porRua = ruas.map(r => {
      const ps = (r.arbo_trechos || []).flatMap(t => t.arbo_pontos || []);
      const f = ps.filter(p => p.status !== 'planejado').length;
      return { nome: r.nome_rua, total: ps.length, feito: f };
    }).filter(x => x.total)
      .sort((a, b) => (b.total - b.feito) - (a.total - a.feito) || b.total - a.total)
      .slice(0, 12);

    const tile = (num, lbl, sub) => `
      <div class="dash-tile"><div class="dt-lbl">${lbl}</div><div class="dt-num">${num}</div>${sub ? `<div class="dt-sub">${sub}</div>` : ''}</div>`;

    const barras = porRua.map(r => {
      const w = Math.round(r.feito / r.total * 100);
      return `<div class="dash-rua">
        <div class="dr-l"><span class="dr-nome">${escapeHtml(r.nome)}</span><span class="dr-num">${r.feito}/${r.total} · ${w}%</span></div>
        <div class="dash-bar">${r.feito ? `<span style="width:${w}%;background:${DASH_COR.feito}"></span>` : ''}</div>
      </div>`;
    }).join('') || '<div class="empty">Nenhum ponto de arborização ainda.</div>';

    box.innerHTML = `
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px">
        <a class="btn btn-sm" style="width:auto; text-decoration:none; display:inline-flex; align-items:center" href="painel.html" target="_blank" rel="noopener">🖥️ Abrir painel completo (PC)</a>
        <button class="btn btn-sm" style="width:auto" onclick="dashAbrir()">↻ Atualizar painel</button>
      </div>
      <div class="dash-kpis">
        <div class="dash-tile dash-tile-wide">
          <div class="dt-lbl">Progresso do plantio</div>
          <div class="dt-num">${pct}%</div>
          <div class="dash-bar">${feitos ? `<span style="width:${pct}%;background:${DASH_COR.feito}"></span>` : ''}</div>
          <div class="dt-sub">✓ ${feitos} coletado(s) · ⏳ ${planejados} a coletar</div>
        </div>
        ${tile(pontos.length, 'Pontos de plantio', ruas.length + ' rua(s) · ' + nTrechos + ' trecho(s)')}
        ${tile(espacos.length, 'Espaços de jardinagem', cants.length + ' canteiro(s)')}
        ${tile(areaTot ? areaTot.toFixed(1).replace('.', ',') + ' m²' : '—', 'Área de canteiros', mudasTot ? mudasTot + ' muda(s) prevista(s)' : '')}
        ${tile(nFotos, 'Fotos enviadas', '')}
      </div>
      <div class="dash-sec">
        <div class="dash-sec-h">
          <h3>Mapa da coleta</h3>
          <div class="dash-leg">
            <span><i style="background:${DASH_COR.feito}"></i> Ponto coletado</span>
            <span><i style="background:${DASH_COR.planejado}"></i> Ponto planejado</span>
            <span><i style="background:${DASH_COR.jard}"></i> Espaço de jardinagem</span>
          </div>
        </div>
        <div id="dash-map"></div>
      </div>
      <div class="dash-cols">
        <div class="dash-sec">
          <div class="dash-sec-h"><h3>Progresso por rua</h3><span class="dash-leg">mais pendências primeiro</span></div>
          <div>${barras}</div>
        </div>
        <div class="dash-sec">
          <div class="dash-sec-h">
            <h3>Todos os registros</h3>
            <div class="chips" id="dash-chips" style="margin:0">
              <button class="chip on-green" onclick="dashSetFiltro('todos', this)">Tudo</button>
              <button class="chip" onclick="dashSetFiltro('arbo', this)">Arborização</button>
              <button class="chip" onclick="dashSetFiltro('jard', this)">Jardinagem</button>
            </div>
          </div>
          <div class="dash-grid" id="dash-grid"></div>
        </div>
      </div>`;
    dashRenderGrid();
    dashWireTip();
    dashMapaInit();
  } catch (e) {
    box.innerHTML = '<div class="empty">Erro ao montar o painel: ' + escapeHtml(e.message) + '</div>';
  }
}

function dashSetFiltro(f, btn) {
  dashFiltro = f;
  document.querySelectorAll('#dash-chips .chip').forEach(b => b.classList.toggle('on-green', b === btn));
  dashRenderGrid();
}

function dashRenderGrid() {
  const el = document.getElementById('dash-grid');
  if (!el) return;
  const itens = dashItens
    .map((it, i) => ({ it, i }))
    .filter(x => dashFiltro === 'todos' || x.it.tipo === dashFiltro);
  el.innerHTML = itens.map(({ it, i }) => {
    const cor = it.tipo === 'jard' ? DASH_COR.jard : (it.feito ? DASH_COR.feito : DASH_COR.planejado);
    const nF = (it.fotos || []).length;
    return `<div class="dash-cell" data-i="${i}" ${nF ? 'data-fotos="1"' : ''} ${nF ? `onclick="dashAbrirFotos(${i})"` : ''}>
      <div class="dc-t"><span class="dc-dot" style="background:${cor}"></span>${escapeHtml(it.titulo)}</div>
      <div class="dc-s">${escapeHtml(it.sub || '')}</div>
      ${nF ? `<span class="dc-badge">📷 ${nF} foto(s) — passe o mouse</span>` : ''}
    </div>`;
  }).join('') || '<div class="empty">Nada aqui ainda.</div>';
}

function dashAbrirFotos(i) {
  const it = dashItens[i];
  if (!it || !(it.fotos || []).length) return;
  lbGroups = [{ label: it.titulo, sub: it.sub || '', fotos: it.fotos }];
  lbOpen(0, 0);
}

function dashTipEl() {
  let el = document.getElementById('dash-tip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dash-tip'; el.className = 'dash-tip';
    document.body.appendChild(el);
  }
  return el;
}

function dashWireTip() {
  const grid = document.getElementById('dash-grid');
  if (!grid) return;
  const tip = dashTipEl();
  grid.addEventListener('mousemove', e => {
    const cell = e.target.closest('.dash-cell');
    if (!cell || !cell.dataset.fotos) { tip.classList.remove('open'); return; }
    const i = cell.dataset.i;
    if (tip.dataset.i !== i) {
      const fs = (dashItens[+i].fotos || []).slice(0, 3);
      tip.innerHTML = fs.map(f => `<img src="${thumbDrive(f.drive_file_id)}" alt="foto" onerror="this.remove()">`).join('');
      tip.dataset.i = i;
    }
    tip.classList.add('open');
    const pad = 14, r = tip.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width  > innerWidth  - 8) x = e.clientX - r.width  - pad;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  grid.addEventListener('mouseleave', () => tip.classList.remove('open'));
}

async function dashMapaInit() {
  const el = document.getElementById('dash-map');
  if (!el) return;
  const comGps = dashItens.filter(it => it.lat && it.lng);
  if (!comGps.length) {
    el.style.height = 'auto';
    el.innerHTML = '<div class="empty">Nenhum registro com GPS ainda — os pontos coletados em campo aparecem aqui.</div>';
    return;
  }
  try { await carregarLeaflet(); }
  catch (e) { el.innerHTML = '<div class="empty">Mapa indisponível: ' + escapeHtml(e.message) + '</div>'; return; }
  if (dashMapa) { try { dashMapa.remove(); } catch (_) {} dashMapa = null; }
  dashMapa = L.map(el);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(dashMapa);
  const bounds = [];
  comGps.forEach(it => {
    const cor = it.tipo === 'jard' ? DASH_COR.jard : (it.feito ? DASH_COR.feito : DASH_COR.planejado);
    L.circleMarker([+it.lat, +it.lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: cor, fillOpacity: 1 })
      .addTo(dashMapa)
      .bindPopup(`<b>${escapeHtml(it.titulo)}</b><br>${escapeHtml(it.sub || '')}<br>` +
        `<a href="https://www.google.com/maps?q=${+it.lat},${+it.lng}" target="_blank" rel="noopener">abrir no Google Maps</a>`);
    bounds.push([+it.lat, +it.lng]);
  });
  dashMapa.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
}

/* ---------- Fotos: busca em lote ---------- */
async function carregarFotos(entidade, ids) {
  if (!ids || !ids.length) return {};
  const map = {};
  // chunk p/ evitar URL gigante
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i+60);
    try {
      const fs = await sbSelect('fotos',
        `select=drive_file_id,web_link,id_entidade&entidade=eq.${entidade}&id_entidade=in.(${chunk.join(',')})`) || [];
      fs.forEach(f => (map[f.id_entidade] = map[f.id_entidade] || []).push(f));
    } catch(e) { console.warn('fotos lote:', e.message); }
  }
  return map;
}

/* ---------- Drawer ---------- */
function abrirDrawer() {
  document.getElementById('drawer-backdrop').classList.add('open');
  document.getElementById('drawer').classList.add('open');
}
function fecharDrawer() {
  document.getElementById('drawer-backdrop').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
}

/* ---------- Lightbox navegável ---------- */
function driveView(v) { return /^https?:\/\//.test(v) ? v : 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(v) + '&sz=w1200'; }

function lbOpen(groupIdx, photoIdx) {
  if (groupIdx < 0 || !lbGroups[groupIdx]) return;
  lbGroupIdx = groupIdx; lbPhotoIdx = photoIdx || 0;
  document.getElementById('lightbox').classList.add('open');
  lbRender();
}
function lbClose() { document.getElementById('lightbox').classList.remove('open'); }

function lbRender() {
  const g = lbGroups[lbGroupIdx];
  if (!g) return;
  const f = g.fotos[lbPhotoIdx];
  document.getElementById('lb-img').src = driveView(f.drive_file_id);
  document.getElementById('lb-cap').innerHTML = `${escapeHtml(g.label)} — foto ${lbPhotoIdx+1}/${g.fotos.length}<small>${escapeHtml(g.sub||'')}</small>`;
  document.getElementById('lb-prev').disabled = lbPhotoIdx === 0;
  document.getElementById('lb-next').disabled = lbPhotoIdx === g.fotos.length - 1;
  document.getElementById('lb-jump-prev').disabled = lbGroupIdx === 0;
  document.getElementById('lb-jump-next').disabled = lbGroupIdx === lbGroups.length - 1;
  // filmstrip do grupo atual
  document.getElementById('lb-film').innerHTML = g.fotos.map((ff,i)=>
    `<img src="${thumbDrive(ff.drive_file_id)}" class="${i===lbPhotoIdx?'on':''}" onclick="lbGo(${i})" onerror="this.style.opacity=0.2">`).join('');
}
function lbGo(i) { lbPhotoIdx = i; lbRender(); }
function lbStep(d) {
  const g = lbGroups[lbGroupIdx];
  const n = lbPhotoIdx + d;
  if (n >= 0 && n < g.fotos.length) { lbPhotoIdx = n; lbRender(); }
}
function lbJump(d) {
  const n = lbGroupIdx + d;
  if (n >= 0 && n < lbGroups.length) { lbGroupIdx = n; lbPhotoIdx = 0; lbRender(); }
}
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('open')) return;
  if (e.key === 'Escape') lbClose();
  else if (e.key === 'ArrowLeft') lbStep(-1);
  else if (e.key === 'ArrowRight') lbStep(1);
  else if (e.key === 'ArrowDown') lbJump(1);
  else if (e.key === 'ArrowUp') lbJump(-1);
});

/* ---------- Export CSV ---------- */
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",;\n]/.test(s) ? `"${s}"` : s;
}
function baixarCSV(nome, linhas) {
  const csv = linhas.map(r => r.map(csvCell).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function consExportarCSV() {
  if (!consDados.length) return showToast('Nada para exportar. Faça uma busca primeiro.', 'error');
  if (consTabAtual === 'arbo') {
    const rows = [['Rua','Bairro','Quadra','Faixa','Ponto','Numeração','Lat','Lng','Espécie plano','Sugestão','Distância (m)','Impedimentos','Fotos','Obs','Situação trecho']];
    consDados.forEach(l => {
      const faixa = [l.trecho.num_inicio, l.trecho.num_fim].filter(Boolean).join('-');
      if (!l.pontos.length) rows.push([l.rua.nome_rua,l.rua.bairro,l.trecho.quadra,faixa,'','','','','','','','','0','',l.trecho.status]);
      l.pontos.forEach(p => rows.push([
        l.rua.nome_rua, l.rua.bairro, l.trecho.quadra, faixa, p.seq, p.numeracao,
        p.lat, p.lng, p.especie_plano, p.especie_sugerida, p.distancia_anterior_m,
        (p.impedimentos||[]).map(v=>IMPED_L[v]||v).join('|'), (p.fotos||[]).length, p.obs, l.trecho.status
      ]));
    });
    baixarCSV('arborizacao_smmacl.csv', rows);
  } else {
    const rows = [['Espaço','Código','Tipo','Bairro','Endereço','Canteiro','Formato','Comp (m)','Larg (m)','Diâm (m)','Vias','Área (m²)','Situação','Espécies','Mudas','Fotos','Obs']];
    consDados.forEach(l => {
      if (!l.canteiros.length) rows.push([l.espaco.nome,l.espaco.codigo,TIPO_L2[l.espaco.tipo]||l.espaco.tipo,l.espaco.bairro,l.espaco.endereco,'','','','','','','','','','','0','']);
      l.canteiros.forEach(c => {
        const esp = (c.jard_especies||[]).map(s=>`${s.especie_texto} ×${s.qtd_mudas||0}`).join('|');
        const mudas = (c.jard_especies||[]).reduce((a,x)=>a+(+x.qtd_mudas||0),0);
        rows.push([l.espaco.nome,l.espaco.codigo,TIPO_L2[l.espaco.tipo]||l.espaco.tipo,l.espaco.bairro,l.espaco.endereco,
          c.seq,FORMATO_L[c.formato]||c.formato,c.comp_m,c.larg_m,c.diametro_m,c.vias,c.area_m2,c.situacao,esp,mudas,(c.fotos||[]).length,c.obs]);
      });
    });
    baixarCSV('jardinagem_smmacl.csv', rows);
  }
  showToast('CSV gerado.', 'success');
}

