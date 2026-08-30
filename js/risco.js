/* ================================================================
   MÓDULO: AVALIAÇÃO DE RISCO DE ÁRVORES URBANAS
   Método de Seitz (2005) — análise visual. Cada item recebe nota
   de risco de 0 a 3. Sem cálculo de índice (só registro).
   Reaproveita GPS (gps-box / capturarGPS) e fotos do app de campo.
   Offline-first: grava pela fila, igual aos outros módulos.
   ================================================================ */

const RK_COPA = [
  'Invasão de galhos acima da via/pista', 'Galhos ou folhas grandes interferindo na rede',
  'Galhos secos acima da rede', 'Ocos nos galhos', 'Galhos angulados', 'Galhos esguios (rabo de leão)',
  'Galhos com cabos inclusos', 'Forquilhas ou bifurcações', 'Lesões de casca nos galhos', 'Casca solta',
  'Fungos', 'Insetos perfuradores', 'Ervas-de-passarinho', 'Folhagem rala', 'Poda de rebaixamento',
  'Poda unilateral', 'Árvore se inclinando'
];
const RK_TRONCO = [
  'Invasão da pista ou calçada', 'Inclinação', 'Danos de batidas e lesões de casca', 'Cavidades',
  'Obturações/corpos estranhos no interior', 'Aspecto da casca', 'Forma do tronco', 'Orifícios de insetos', 'Fungos'
];
const RK_BASE = [
  'Brotação epicórmica', 'Lesões na base', 'Cavidades na base', 'Ninhos/colméias de insetos na base',
  'Fungos', 'Raízes adventícias', 'Elevação e fissuras do solo', 'Canteiro/espaço/área livre', 'Neiloide',
  'Tipo do solo (profundidade, qualidade, umidade)', 'Poda de raízes', 'Restrição do meio-fio'
];

let riscoScores = {};   // { 'copa:0': 2, 'tronco:3': 1, ... }

/* ── cache local (offline) ── */
function cacheRisco() { try { return JSON.parse(LS.get('cache_risco') || '[]'); } catch (e) { return []; } }
function setCacheRisco(arr) { LS.set('cache_risco', JSON.stringify(arr.slice(0, 200))); }

function abrirRisco() { showPage('risco'); renderRiscoLista(); atualizarRiscoOnline(); }

function renderRiscoLista() {
  const busca = (document.getElementById('risco-busca').value || '').toLowerCase().trim();
  let arr = cacheRisco();
  if (busca) arr = arr.filter(r => (`${r.especie || ''} ${r.endereco || ''} ${r.n_processo || ''}`).toLowerCase().includes(busca));
  const el = document.getElementById('risco-lista');
  if (!arr.length) { el.innerHTML = '<div class="empty">Nenhuma avaliação ainda. Toque em “+ Nova avaliação”.</div>'; return; }
  el.innerHTML = arr.map(r => `
    <div class="list-item">
      <div>
        <div class="li-title">${escapeHtml(r.especie || '(sem espécie)')}</div>
        <div class="li-sub">${escapeHtml(r.n_processo ? 'Proc. ' + r.n_processo + ' · ' : '')}${escapeHtml(r.endereco || '')}${r.criado_em ? ' · ' + fmtDataRk(r.criado_em) : ''}</div>
      </div>
      ${r.lat ? `<a class="badge" href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank" rel="noopener">📍</a>` : ''}
    </div>`).join('');
}
function fmtDataRk(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return ''; } }

async function atualizarRiscoOnline() {
  if (!sessionValida() || !navigator.onLine) return;
  try {
    const rows = await sbSelect('arvores_risco', 'select=id_risco,n_processo,especie,endereco,lat,lng,criado_em&order=criado_em.desc&limit=200');
    setCacheRisco((rows || []).map(r => ({ id_risco: r.id_risco, n_processo: r.n_processo, especie: r.especie, endereco: r.endereco, lat: r.lat, lng: r.lng, criado_em: r.criado_em })));
    if (document.getElementById('page-risco').classList.contains('active')) renderRiscoLista();
  } catch (e) { console.warn('risco online:', e.message); }
}

/* ── novo formulário ── */
function novaAvaliacaoRisco() {
  riscoScores = {};
  showPage('risco-form');
  ['rk-proc', 'rk-esp', 'rk-end', 'rk-altura', 'rk-dap', 'rk-obs', 'rk-outras'].forEach(i => { const e = document.getElementById(i); if (e) e.value = ''; });
  document.getElementById('rk-avaliador').textContent = userEmail || '(não identificado)';
  gpsAtual = null;
  document.getElementById('rk-gps-status').textContent = 'GPS não capturado';
  document.getElementById('rk-gps-coord').textContent = '';
  fotosForm.rk = [];
  document.querySelectorAll('#rk-fotos .foto-wrap').forEach(el => el.remove());
  document.querySelectorAll('#rk-alvos .chip, #rk-manejo .chip').forEach(c => c.classList.remove('on'));
  rkMontarEspecies();
  rkRenderItens();
  window.scrollTo(0, 0);
}

function rkMontarEspecies() {
  const dl = document.getElementById('rk-esp-list'); if (!dl) return;
  dl.innerHTML = catalogo().map(c => `<option value="${escapeHtml(c.nome_popular)}">`).join('');
}

function rkRenderItens() {
  rkBloco('rk-copa', 'copa', RK_COPA);
  rkBloco('rk-tronco', 'tronco', RK_TRONCO);
  rkBloco('rk-base', 'base', RK_BASE);
}
function rkBloco(elId, bloco, itens) {
  const el = document.getElementById(elId); if (!el) return;
  el.innerHTML = itens.map((label, i) => `
    <div class="rk-item">
      <div class="rk-lbl">${escapeHtml(label)}</div>
      <div class="rk-seg" id="rk-${bloco}-${i}">${[0, 1, 2, 3].map(n => `<button type="button" data-v="${n}" onclick="rkPick('${bloco}',${i},${n})">${n}</button>`).join('')}</div>
    </div>`).join('');
}
function rkPick(bloco, i, n) {
  const key = bloco + ':' + i;
  const botoes = document.querySelectorAll(`#rk-${bloco}-${i} button`);
  if (riscoScores[key] === n) { delete riscoScores[key]; botoes.forEach(b => b.classList.remove('on')); return; }
  riscoScores[key] = n;
  botoes.forEach(b => b.classList.toggle('on', +b.dataset.v === n));
}
function rkColetarBloco(bloco, itens) { return itens.map((_, i) => { const v = riscoScores[bloco + ':' + i]; return v == null ? null : v; }); }

function rkNumOuNull(id) { const v = parseFloat((document.getElementById(id).value || '').replace(',', '.')); return isNaN(v) ? null : v; }

async function salvarAvaliacaoRisco() {
  const especie = document.getElementById('rk-esp').value.trim();
  if (!especie) return showToast('Informe a espécie.', 'error');
  const g = gpsAtual;
  const dados = {
    id_risco: uuid(),
    n_processo: document.getElementById('rk-proc').value.trim() || null,
    especie,
    avaliador: userEmail || null,
    endereco: document.getElementById('rk-end').value.trim() || null,
    lat: g ? g.lat : null, lng: g ? g.lng : null,
    lat_gps: g ? (g.lat_gps != null ? g.lat_gps : g.lat) : null,
    lng_gps: g ? (g.lng_gps != null ? g.lng_gps : g.lng) : null,
    precisao_m: g && g.prec != null ? Math.round(g.prec * 10) / 10 : null,
    ajustado: g ? !!g.ajustado : null,
    altura_total: rkNumOuNull('rk-altura'),
    dap: rkNumOuNull('rk-dap'),
    itens: { copa: rkColetarBloco('copa', RK_COPA), tronco: rkColetarBloco('tronco', RK_TRONCO), base: rkColetarBloco('base', RK_BASE) },
    alvos: [...document.querySelectorAll('#rk-alvos .chip.on')].map(c => c.dataset.v),
    manejo: [...document.querySelectorAll('#rk-manejo .chip.on')].map(c => c.dataset.v),
    outras_opcoes: document.getElementById('rk-outras').value.trim() || null,
    obs: document.getElementById('rk-obs').value.trim() || null,
    criado_em: agora(),
    criado_por: userEmail
  };
  await enqueue({ tipo: 'insert', tabela: 'arvores_risco', dados });
  await enfileirarFotos('rk', 'arvore_risco', dados.id_risco, especie);
  const arr = cacheRisco();
  arr.unshift({ id_risco: dados.id_risco, n_processo: dados.n_processo, especie, endereco: dados.endereco, lat: dados.lat, lng: dados.lng, criado_em: dados.criado_em });
  setCacheRisco(arr);
  showToast('Avaliação de risco salva.', 'success');
  abrirRisco();
}
