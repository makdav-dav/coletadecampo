/* ================================================================
   MÓDULO ARBORIZAÇÃO — 3 níveis (rua → trecho → ponto)
   ================================================================ */

/* ── State helpers ───────────────────────────────────────── */
function ruaAtual()   { try { return JSON.parse(LS.get('rua_atual') || 'null'); } catch(e){ return null; } }
function setRuaAtual(r){ r ? LS.set('rua_atual', JSON.stringify(r)) : LS.del('rua_atual'); }
function cacheRuas()  { try { return JSON.parse(LS.get('cache_ruas') || '[]'); } catch(e){ return []; } }

function trechoAtual(){ try { return JSON.parse(LS.get('trecho_atual') || 'null'); } catch(e){ return null; } }
function setTrechoAtual(t){ t ? LS.set('trecho_atual', JSON.stringify(t)) : LS.del('trecho_atual'); }
function cacheTrechos(idRua){ try { return JSON.parse(LS.get('cache_trechos_' + idRua) || '[]'); } catch(e){ return []; } }
function setCacheTrechos(idRua, arr){ LS.set('cache_trechos_' + idRua, JSON.stringify(arr)); }

let pontosDoTrecho = [];   // pontos carregados + pendentes na fila (com fotos anexadas)
let pontoEditando  = null; // id_ponto em edição; null = novo ponto

/* ── Nível 1: RUAS ───────────────────────────────────────── */
function abrirArbo() { showPage('arbo'); renderArboLista(); atualizarArboOnline(); }

function novaRua() {
  document.getElementById('rua-form').style.display = 'block';
  document.getElementById('ru-nome').focus();
}

async function salvarRua() {
  const nome = document.getElementById('ru-nome').value.trim();
  if (!nome) return showToast('Informe o nome da rua.', 'error');
  const rua = {
    id_rua: uuid(),
    nome_rua: nome,
    bairro: document.getElementById('ru-bairro').value.trim(),
    obs: document.getElementById('ru-obs').value.trim() || null,
    criado_em: agora(),
    criado_por: userEmail
  };
  await enqueue({ tipo: 'insert', tabela: 'arbo_ruas', dados: rua });
  const cache = cacheRuas();
  cache.unshift({ ...rua, trechos: 0 });
  LS.set('cache_ruas', JSON.stringify(cache.slice(0, 80)));
  ['ru-nome','ru-bairro','ru-obs'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('rua-form').style.display = 'none';
  abrirRua(rua.id_rua);
}

function renderArboLista() {
  const el = document.getElementById('arbo-lista');
  let ruas = cacheRuas();
  const q = (document.getElementById('arbo-busca')?.value || '').trim().toLowerCase();
  if (q) ruas = ruas.filter(r =>
    (r.nome_rua || '').toLowerCase().includes(q) ||
    (r.bairro   || '').toLowerCase().includes(q));
  if (!ruas.length) {
    el.innerHTML = q
      ? `<div class="empty">Nenhuma rua encontrada para "${escapeHtml(q)}".</div>`
      : '<div class="empty">Nenhuma rua ainda. Toque em "+ Nova rua" para começar.</div>';
    return;
  }
  el.innerHTML = ruas.map(r => `
    <div class="list-item" onclick="abrirRua('${r.id_rua}')">
      <div class="li-main">
        <div class="li-title"><span class="li-nome">${escapeHtml(r.nome_rua)}</span></div>
        <div class="li-sub">${escapeHtml(r.bairro || '') || '—'}</div>
      </div>
      <div class="li-right">
        <span class="badge">${r.trechos || 0} trec.</span>
        <button class="li-del" onclick="event.stopPropagation(); excluirRua('${r.id_rua}')" aria-label="Excluir rua">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`).join('');
}

async function atualizarArboOnline() {
  if (!sessionValida() || !navigator.onLine) return;
  try {
    const rows = await sbSelect('arbo_ruas',
      'select=id_rua,nome_rua,bairro,obs,criado_em,arbo_trechos(count)&order=criado_em.desc&limit=80');
    const online = (rows || []).map(o => ({
      ...o,
      trechos: (o.arbo_trechos && o.arbo_trechos[0] && o.arbo_trechos[0].count) || 0
    }));
    const pendentes = cacheRuas().filter(c => !online.some(o => o.id_rua === c.id_rua));
    LS.set('cache_ruas', JSON.stringify([...pendentes, ...online]));
    renderArboLista();
  } catch(e) { console.warn('arbo online:', e.message); }
}

async function excluirRua(id) {
  const r = cacheRuas().find(x => x.id_rua === id);
  if (!r) return;
  if (!confirm(`Excluir "${r.nome_rua}" e todos os trechos/pontos?\n\nEssa ação não pode ser desfeita.`)) return;
  await cancelarPendentes(it =>
    (it.tipo === 'insert' && it.tabela === 'arbo_ruas'    && it.dados?.id_rua === id) ||
    (it.tipo === 'insert' && it.tabela === 'arbo_trechos' && it.dados?.id_rua === id)
  );
  await enqueue({ tipo: 'delete', tabela: 'arbo_ruas', filter: { id_rua: 'eq.' + id } });
  LS.set('cache_ruas', JSON.stringify(cacheRuas().filter(x => x.id_rua !== id)));
  LS.del('cache_trechos_' + id);
  if (ruaAtual()?.id_rua === id) setRuaAtual(null);
  renderArboLista();
  showToast('Rua excluída.', 'success');
}

/* ── Nível 2: TRECHOS ────────────────────────────────────── */
async function abrirRua(id) {
  const r = cacheRuas().find(x => x.id_rua === id);
  if (!r) return;
  setRuaAtual(r);
  document.getElementById('rd-nome').textContent = r.nome_rua;
  document.getElementById('rd-sub').textContent = r.bairro || 'sem bairro definido';
  renderRuaTrechos();
  showPage('rua');
  atualizarTrechosOnline(id);
}

function novoTrecho() {
  document.getElementById('trecho-form').style.display = 'block';
  document.getElementById('tr-quadra').focus();
}

async function salvarTrecho() {
  const r = ruaAtual();
  if (!r) return;
  const trecho = {
    id_trecho: uuid(),
    id_rua: r.id_rua,
    quadra: document.getElementById('tr-quadra').value.trim() || null,
    num_inicio: document.getElementById('tr-num-ini').value.trim() || null,
    num_fim: document.getElementById('tr-num-fim').value.trim() || null,
    status: 'em_andamento',
    obs: document.getElementById('tr-obs').value.trim() || null,
    criado_em: agora(),
    criado_por: userEmail
  };
  await enqueue({ tipo: 'insert', tabela: 'arbo_trechos', dados: trecho });
  const cache = cacheTrechos(r.id_rua);
  cache.unshift({ ...trecho, pontos: 0 });
  setCacheTrechos(r.id_rua, cache);
  const ruas = cacheRuas().map(x => x.id_rua === r.id_rua ? { ...x, trechos: (x.trechos || 0) + 1 } : x);
  LS.set('cache_ruas', JSON.stringify(ruas));
  ['tr-quadra','tr-num-ini','tr-num-fim','tr-obs'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('trecho-form').style.display = 'none';
  renderRuaTrechos();
  abrirTrecho(trecho.id_trecho);
}

function fmtFaixa(t) {
  if (t.num_inicio && t.num_fim) return t.num_inicio + '–' + t.num_fim;
  return t.num_inicio || t.num_fim || '';
}

function renderRuaTrechos() {
  const r = ruaAtual();
  if (!r) return;
  const trechos = cacheTrechos(r.id_rua);
  document.getElementById('rd-badge').textContent = trechos.length + ' trec.';
  const el = document.getElementById('rd-trechos');
  if (!trechos.length) { el.innerHTML = '<div class="empty">Nenhum trecho ainda. Toque em "+ Novo trecho".</div>'; return; }
  el.innerHTML = trechos.map(t => {
    const faixa = fmtFaixa(t);
    return `
    <div class="list-item" onclick="abrirTrecho('${t.id_trecho}')">
      <div class="li-main">
        <div class="li-title">
          <span class="li-nome">${t.quadra ? 'Quadra ' + escapeHtml(t.quadra) : 'Sem quadra'}</span>
          ${faixa ? `<span class="li-quadra">${escapeHtml(faixa)}</span>` : ''}
        </div>
        <div class="li-sub">${escapeHtml(t.obs || '') || (t.status === 'encerrado' ? 'Encerrado' : 'Em andamento')}</div>
      </div>
      <div class="li-right">
        <span class="badge ${t.status === 'encerrado' ? '' : 'warn'}">${(t.pontos || 0)} pts</span>
        <button class="li-del" onclick="event.stopPropagation(); excluirTrecho('${t.id_trecho}')" aria-label="Excluir trecho">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function atualizarTrechosOnline(idRua) {
  if (!sessionValida() || !navigator.onLine) return;
  try {
    const rows = await sbSelect('arbo_trechos',
      `select=id_trecho,id_rua,quadra,num_inicio,num_fim,status,obs,criado_em,arbo_pontos(count)&id_rua=eq.${idRua}&order=criado_em.desc`);
    const online = (rows || []).map(o => ({
      ...o,
      pontos: (o.arbo_pontos && o.arbo_pontos[0] && o.arbo_pontos[0].count) || 0
    }));
    const pendentes = cacheTrechos(idRua).filter(c => !online.some(o => o.id_trecho === c.id_trecho));
    setCacheTrechos(idRua, [...pendentes, ...online]);
    if (ruaAtual()?.id_rua === idRua) renderRuaTrechos();
  } catch(e) { console.warn('trechos online:', e.message); }
}

async function excluirTrecho(id) {
  const r = ruaAtual();
  if (!r) return;
  const t = cacheTrechos(r.id_rua).find(x => x.id_trecho === id);
  if (!t) return;
  const rot = t.quadra ? 'Quadra ' + t.quadra : 'trecho sem quadra';
  if (!confirm(`Excluir ${rot} e todos os seus pontos?\n\nEssa ação não pode ser desfeita.`)) return;
  await cancelarPendentes(it =>
    (it.tipo === 'insert' && it.tabela === 'arbo_trechos' && it.dados?.id_trecho === id) ||
    (it.tipo === 'insert' && it.tabela === 'arbo_pontos'  && it.dados?.id_trecho === id) ||
    (it.tipo === 'update' && it.tabela === 'arbo_trechos' && it.filter?.id_trecho === 'eq.' + id)
  );
  await enqueue({ tipo: 'delete', tabela: 'arbo_trechos', filter: { id_trecho: 'eq.' + id } });
  const novo = cacheTrechos(r.id_rua).filter(x => x.id_trecho !== id);
  setCacheTrechos(r.id_rua, novo);
  const ruas = cacheRuas().map(x => x.id_rua === r.id_rua ? { ...x, trechos: Math.max(0, (x.trechos || 1) - 1) } : x);
  LS.set('cache_ruas', JSON.stringify(ruas));
  if (trechoAtual()?.id_trecho === id) setTrechoAtual(null);
  renderRuaTrechos();
  showToast('Trecho excluído.', 'success');
}

/* ── Nível 3: PONTOS DO TRECHO ───────────────────────────── */
function pintarCabecalhoPonto() {
  const r = ruaAtual(); const t = trechoAtual();
  if (!r || !t) return;
  document.getElementById('pt-rua').textContent = r.nome_rua;
  const faixa = fmtFaixa(t);
  document.getElementById('pt-rua-sub').textContent =
    [t.quadra ? 'Quadra ' + t.quadra : 'Sem quadra', faixa, r.bairro].filter(Boolean).join(' · ');
  const proxSeq = pontosDoTrecho.reduce((m, p) => Math.max(m, p.seq || 0), 0) + 1;
  document.getElementById('pt-seq').textContent = pontoEditando
    ? 'Editando ponto ' + (pontosDoTrecho.find(p => p.id_ponto === pontoEditando)?.seq || '?')
    : 'Ponto ' + proxSeq;
}

async function abrirTrecho(id) {
  const r = ruaAtual();
  if (!r) return;
  const t = cacheTrechos(r.id_rua).find(x => x.id_trecho === id);
  if (!t) return;
  setTrechoAtual(t);
  pontoEditando = null;
  await carregarPontosDoTrecho();
  montarSelectsEspecies();
  montarChips('pt-imped', IMPEDIMENTOS, 'on');
  limparFormularioPonto();
  pintarCabecalhoPonto();
  renderPontosColetados();
  showPage('ponto');
  capturarGPS();
}

async function carregarPontosDoTrecho() {
  const t = trechoAtual();
  if (!t) { pontosDoTrecho = []; return; }
  pontosDoTrecho = [];
  // Do servidor
  if (sessionValida() && navigator.onLine) {
    try {
      const pts = await sbSelect('arbo_pontos',
        `select=*&id_trecho=eq.${t.id_trecho}&order=seq.asc`);
      const arr = pts || [];
      if (arr.length) {
        const ids = arr.map(p => p.id_ponto).join(',');
        let fotos = [];
        try {
          fotos = await sbSelect('fotos',
            `select=drive_file_id,web_link,id_entidade&entidade=eq.arbo_ponto&id_entidade=in.(${ids})`) || [];
        } catch(e) { console.warn('fotos:', e.message); }
        const byPt = {};
        fotos.forEach(f => (byPt[f.id_entidade] = byPt[f.id_entidade] || []).push(f));
        arr.forEach(p => p.fotos = byPt[p.id_ponto] || []);
      }
      pontosDoTrecho = arr;
    } catch(e) { console.warn('pontos:', e.message); }
  }
  // Pontos ainda na fila (não sincronizados) — pra retomar mesmo offline
  const fila = await idbAll('fila');
  const ids = new Set(pontosDoTrecho.map(p => p.id_ponto));
  fila.filter(it => it.tipo === 'insert' && it.tabela === 'arbo_pontos' &&
                    it.dados?.id_trecho === t.id_trecho && !ids.has(it.dados.id_ponto))
      .forEach(it => pontosDoTrecho.push({ ...it.dados, fotos: [], _pendente: true }));
  pontosDoTrecho.sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

/* Aceita URL direta (Supabase Storage) ou ID legado do Google Drive */
function thumbDrive(v) { return /^https?:\/\//.test(v) ? v : 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(v) + '&sz=w200'; }
function fullDrive(v)  { return /^https?:\/\//.test(v) ? v : 'https://drive.google.com/file/d/' + encodeURIComponent(v) + '/view'; }

function renderPontosColetados() {
  const el = document.getElementById('pt-coletados');
  if (!pontosDoTrecho.length) { el.innerHTML = ''; return; }
  const linhas = pontosDoTrecho.map(p => {
    const especie = p.especie_plano || p.especie_sugerida || '';
    const imp = (p.impedimentos || []).length ? (p.impedimentos || []).slice(0, 3).join(', ') : '';
    const info = [p.numeracao && 'nº ' + p.numeracao, especie, imp].filter(Boolean).join(' · ') || 'sem detalhes';
    const fs = (p.fotos || []);
    const strip = fs.length
      ? `<div class="foto-strip" style="margin-top:8px" onclick="event.stopPropagation()">
          ${fs.slice(0, 3).map(f => `<a href="${fullDrive(f.drive_file_id)}" target="_blank" rel="noopener"><img class="foto-thumb" src="${thumbDrive(f.drive_file_id)}" alt="foto" onerror="this.style.opacity=0.25"></a>`).join('')}
          ${fs.length > 3 ? `<div class="foto-thumb" style="display:flex; align-items:center; justify-content:center; background:var(--accent-light); color:var(--accent-dark); font-weight:700">+${fs.length - 3}</div>` : ''}
        </div>` : '';
    const planejado = p.status === 'planejado';
    const borda = planejado ? 'var(--warning)' : 'var(--success)';
    const estilo = pontoEditando === p.id_ponto
      ? 'border-color:var(--accent); background:var(--accent-light)'
      : 'border-left:4px solid ' + borda;
    const statusBadge = planejado
      ? '<span class="li-quadra" style="background:var(--warning-light); color:var(--warning)">⏳ a coletar</span>'
      : '<span class="li-quadra" style="background:var(--accent-light); color:var(--success)">✓ feito</span>';
    return `
    <div class="list-item" style="${estilo}" onclick="editarPonto('${p.id_ponto}')">
      <div class="li-main">
        <div class="li-title">
          <span class="li-nome">Ponto ${p.seq || '?'}</span>
          ${statusBadge}
          ${p._pendente ? '<span class="li-quadra" style="background:var(--warning-light); color:var(--warning)">não sincronizado</span>' : ''}
        </div>
        <div class="li-sub">${escapeHtml(info)}</div>
        ${strip}
      </div>
      <div class="li-right">
        <button class="li-del" onclick="event.stopPropagation(); excluirPonto('${p.id_ponto}')" aria-label="Excluir ponto">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
  const feitos = pontosDoTrecho.filter(p => p.status !== 'planejado').length;
  const aColetar = pontosDoTrecho.length - feitos;
  el.innerHTML = `<div class="page-sub" style="margin:14px 0 6px">${pontosDoTrecho.length} ponto(s) · <b style="color:var(--success)">${feitos} feito(s)</b>${aColetar ? ` · <b style="color:var(--warning)">${aColetar} a coletar</b>` : ''}. Toque para editar.</div>` + linhas;
}

/* Formulário — novo vs edição */
function limparFormularioPonto() {
  ['pt-num','pt-imped-outro','pt-esp-livre','pt-dist','pt-obs'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('pt-esp-plano').value = '';
  document.getElementById('pt-esp-sug').value = '';
  document.getElementById('pt-esp-livre').style.display = 'none';
  document.getElementById('pt-imped-outro').style.display = 'none';
  limparChips('pt-imped', 'on');
  fotosForm.pt = [];
  document.querySelectorAll('#pt-fotos .foto-wrap').forEach(el => el.remove());
  document.getElementById('pt-fotos-antigas').innerHTML = '';
  document.getElementById('pt-form-title').textContent = 'Novo ponto';
  document.getElementById('pt-form-cancel').style.display = 'none';
  document.getElementById('pt-save-btn').textContent = 'Salvar e próximo ponto';
}

function sairEdicao() {
  pontoEditando = null;
  gpsAtual = null;
  document.getElementById('gps-status').textContent = 'Capturando GPS…';
  document.getElementById('gps-coord').textContent = '';
  limparFormularioPonto();
  pintarCabecalhoPonto();
  renderPontosColetados();
  capturarGPS();
}

function editarPonto(id) {
  const p = pontosDoTrecho.find(x => x.id_ponto === id);
  if (!p) return;
  pontoEditando = id;
  document.getElementById('pt-num').value = p.numeracao || '';
  document.getElementById('pt-dist').value = p.distancia_anterior_m || '';
  document.getElementById('pt-obs').value = p.obs || '';
  // GPS existente (sem re-capturar)
  if (p.lat && p.lng) {
    gpsAtual = { lat: +p.lat, lng: +p.lng, prec: p.precisao_m ? +p.precisao_m : 0 };
    document.getElementById('gps-status').textContent = 'GPS existente (toque em Atualizar para recapturar)';
    document.getElementById('gps-coord').textContent = gpsAtual.lat.toFixed(6) + ', ' + gpsAtual.lng.toFixed(6);
  } else {
    gpsAtual = null;
    document.getElementById('gps-status').textContent = 'Sem GPS';
    document.getElementById('gps-coord').textContent = '';
  }
  // Impedimentos
  limparChips('pt-imped', 'on');
  (p.impedimentos || []).forEach(v => {
    const c = document.querySelector('#pt-imped .chip[data-v="' + v + '"]');
    if (c) c.classList.add('on');
  });
  if (p.impedimento_outro) {
    document.getElementById('pt-imped-outro').style.display = 'block';
    document.getElementById('pt-imped-outro').value = p.impedimento_outro;
  }
  // Espécies
  const cat = catalogo().map(c => c.nome_popular);
  const setSel = (id, val, livreVal) => {
    const sel = document.getElementById(id);
    if (val && cat.includes(val)) sel.value = val;
    else if (val) { sel.value = '__livre__'; document.getElementById('pt-esp-livre').style.display = 'block'; document.getElementById('pt-esp-livre').value = livreVal || val; }
    else sel.value = '';
  };
  setSel('pt-esp-plano', p.especie_plano || '', p.especie_plano);
  setSel('pt-esp-sug',   p.especie_sugerida || '', p.especie_sugerida);
  // Fotos antigas (visualização; adicionar novas via botão)
  const fs = p.fotos || [];
  document.getElementById('pt-fotos-antigas').innerHTML = fs.length
    ? `<div class="page-sub" style="margin:4px 0 6px">Fotos já enviadas (toque para abrir no Drive)</div>
       <div class="foto-strip">${fs.map(f => `<a href="${fullDrive(f.drive_file_id)}" target="_blank" rel="noopener"><img class="foto-thumb" src="${thumbDrive(f.drive_file_id)}" alt="foto" onerror="this.style.opacity=0.25"></a>`).join('')}</div>`
    : '';
  fotosForm.pt = [];
  document.querySelectorAll('#pt-fotos .foto-wrap').forEach(el => el.remove());
  // UI de edição
  document.getElementById('pt-form-title').textContent = 'Editando ponto ' + p.seq;
  document.getElementById('pt-form-cancel').style.display = 'inline-flex';
  document.getElementById('pt-save-btn').textContent = 'Salvar alterações';
  pintarCabecalhoPonto();
  renderPontosColetados();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function valorEspecie(selId) {
  const v = document.getElementById(selId).value;
  if (v === '__livre__') return document.getElementById('pt-esp-livre').value.trim();
  return v;
}
document.addEventListener('change', e => {
  if (e.target.id === 'pt-esp-plano' || e.target.id === 'pt-esp-sug') {
    const livre = document.getElementById('pt-esp-plano').value === '__livre__' ||
                  document.getElementById('pt-esp-sug').value === '__livre__';
    document.getElementById('pt-esp-livre').style.display = livre ? 'block' : 'none';
  }
});

function coletarCamposPonto() {
  const imped = chipsMarcados('pt-imped', 'on');
  return {
    numeracao: document.getElementById('pt-num').value.trim() || null,
    lat: gpsAtual ? gpsAtual.lat : null,
    lng: gpsAtual ? gpsAtual.lng : null,
    precisao_m: gpsAtual ? Math.round(gpsAtual.prec * 10) / 10 : null,
    impedimentos: imped,
    impedimento_outro: imped.includes('outro') ? document.getElementById('pt-imped-outro').value.trim() : null,
    especie_plano: valorEspecie('pt-esp-plano') || null,
    especie_sugerida: valorEspecie('pt-esp-sug') || null,
    distancia_anterior_m: parseFloat(document.getElementById('pt-dist').value) || null,
    obs: document.getElementById('pt-obs').value.trim() || null,
    status: 'coletado'
  };
}

async function salvarPonto() {
  const t = trechoAtual();
  if (!t) return showPage('rua');

  if (pontoEditando) {
    // === EDIÇÃO ===
    const campos = coletarCamposPonto();
    const id = pontoEditando;
    // Se o ponto ainda está na fila (nunca sincronizou), edita o insert lá
    const fila = await idbAll('fila');
    const it = fila.find(x => x.tipo === 'insert' && x.tabela === 'arbo_pontos' && x.dados?.id_ponto === id);
    if (it) {
      it.dados = { ...it.dados, ...campos };
      await idbPut('fila', it);
    } else {
      await enqueue({ tipo: 'update', tabela: 'arbo_pontos',
        filter: { id_ponto: 'eq.' + id }, patch: campos });
    }
    // Fotos novas anexadas neste edit
    await enfileirarFotos('pt', 'arbo_ponto', id, 'p' + (pontosDoTrecho.find(p => p.id_ponto === id)?.seq || 'edit'));
    // Reflete no estado local
    const idx = pontosDoTrecho.findIndex(p => p.id_ponto === id);
    if (idx >= 0) pontosDoTrecho[idx] = { ...pontosDoTrecho[idx], ...campos };
    sairEdicao();
    showToast('Ponto ' + (pontosDoTrecho[idx]?.seq || '') + ' atualizado.', 'success');
    return;
  }

  // === NOVO PONTO ===
  const maxSeq = pontosDoTrecho.reduce((m, p) => Math.max(m, p.seq || 0), 0);
  const idPonto = uuid();
  const campos = coletarCamposPonto();
  const dados = {
    id_ponto: idPonto,
    id_trecho: t.id_trecho,
    seq: maxSeq + 1,
    ...campos,
    criado_em: agora(),
    criado_por: userEmail
  };
  await enqueue({ tipo: 'insert', tabela: 'arbo_pontos', dados });
  await enfileirarFotos('pt', 'arbo_ponto', idPonto, 'p' + dados.seq);

  pontosDoTrecho.push({ ...dados, fotos: [], _pendente: true });
  const ruas = ruaAtual();
  if (ruas) {
    const arr = cacheTrechos(ruas.id_rua).map(x =>
      x.id_trecho === t.id_trecho ? { ...x, pontos: (x.pontos || 0) + 1 } : x);
    setCacheTrechos(ruas.id_rua, arr);
  }
  // Reset só do que muda de ponto pra ponto — cabeçalho segue no trecho
  limparFormularioPonto();
  renderPontosColetados();
  pintarCabecalhoPonto();
  capturarGPS();
  showToast('Ponto ' + dados.seq + ' salvo. Próximo!', 'success');
  window.scrollTo(0, 0);
}

async function excluirPonto(id) {
  const p = pontosDoTrecho.find(x => x.id_ponto === id);
  if (!p) return;
  if (!confirm(`Excluir ponto ${p.seq}?\n\nEssa ação não pode ser desfeita.`)) return;
  await cancelarPendentes(it =>
    (it.tipo === 'insert' && it.tabela === 'arbo_pontos' && it.dados?.id_ponto === id) ||
    (it.tipo === 'update' && it.tabela === 'arbo_pontos' && it.filter?.id_ponto === 'eq.' + id) ||
    (it.tipo === 'foto'   && it.entidade === 'arbo_ponto' && it.idEntidade === id)
  );
  // Se já foi sincronizado, delete no servidor
  if (!p._pendente) {
    await enqueue({ tipo: 'delete', tabela: 'arbo_pontos', filter: { id_ponto: 'eq.' + id } });
  }
  pontosDoTrecho = pontosDoTrecho.filter(x => x.id_ponto !== id);
  const r = ruaAtual(); const t = trechoAtual();
  if (r && t) {
    const arr = cacheTrechos(r.id_rua).map(x =>
      x.id_trecho === t.id_trecho ? { ...x, pontos: Math.max(0, (x.pontos || 1) - 1) } : x);
    setCacheTrechos(r.id_rua, arr);
  }
  if (pontoEditando === id) sairEdicao();
  else { pintarCabecalhoPonto(); renderPontosColetados(); }
  showToast('Ponto excluído.', 'success');
}

async function encerrarTrecho() {
  const t = trechoAtual();
  if (!t) return;
  await enqueue({
    tipo: 'update', tabela: 'arbo_trechos',
    filter: { id_trecho: 'eq.' + t.id_trecho },
    patch: { status: 'encerrado', encerrado_em: agora() }
  });
  const r = ruaAtual();
  if (r) {
    const arr = cacheTrechos(r.id_rua).map(x =>
      x.id_trecho === t.id_trecho ? { ...x, status: 'encerrado' } : x);
    setCacheTrechos(r.id_rua, arr);
  }
  setTrechoAtual(null);
  showToast('Trecho encerrado.', 'success');
  showPage('rua'); renderRuaTrechos();
}


