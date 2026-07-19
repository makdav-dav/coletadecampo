/* ================================================================
   MÓDULO JARDINAGEM
   ================================================================ */
function cacheEspacos() { try { return JSON.parse(LS.get('cache_espacos') || '[]'); } catch(e){ return []; } }
function espAtual() { try { return JSON.parse(LS.get('esp_atual') || 'null'); } catch(e){ return null; } }

function abrirJard() { showPage('jard'); renderJardLista(); atualizarJardOnline(); }

function novoEspaco() {
  document.getElementById('jard-form').style.display = 'block';
  gpsAtual = null;
  document.getElementById('es-gps-status').textContent = 'GPS não capturado';
  document.getElementById('es-gps-coord').textContent = '';
  document.getElementById('es-nome').focus();
}

function proximoCodigoJD() {
  let n = parseInt(LS.get('jd_counter') || '0', 10) + 1;
  LS.set('jd_counter', String(n));
  return 'JD-' + String(n).padStart(4, '0');
}
async function sincronizarContadorJD() {
  try {
    const rows = await sbSelect('jard_espacos',
      'select=codigo&codigo=like.JD-*&order=codigo.desc&limit=1');
    let m = 0;
    if (rows && rows[0] && rows[0].codigo) {
      const match = rows[0].codigo.match(/JD-(\d+)/);
      if (match) m = parseInt(match[1], 10);
    }
    const local = parseInt(LS.get('jd_counter') || '0', 10);
    if (m > local) LS.set('jd_counter', String(m));
  } catch(e) { console.warn('contador JD:', e.message); }
}

async function salvarEspaco() {
  const nome = document.getElementById('es-nome').value.trim();
  if (!nome) return showToast('Informe o nome do espaço.', 'error');
  const esp = {
    id_espaco: uuid(),
    codigo: proximoCodigoJD(),
    nome,
    tipo: document.getElementById('es-tipo').value,
    endereco: document.getElementById('es-end').value.trim() || null,
    bairro: document.getElementById('es-bairro').value.trim() || null,
    lat: gpsAtual ? gpsAtual.lat : null,
    lng: gpsAtual ? gpsAtual.lng : null,
    status: 'ativo',
    obs: document.getElementById('es-obs').value.trim() || null,
    criado_em: agora(),
    criado_por: userEmail
  };
  await enqueue({ tipo: 'insert', tabela: 'jard_espacos', dados: esp });
  await enfileirarFotos('es', 'jard_espaco', esp.id_espaco, esp.codigo);
  const cache = cacheEspacos();
  cache.unshift({ ...esp, canteiros: 0 });
  LS.set('cache_espacos', JSON.stringify(cache.slice(0, 80)));
  ['es-nome','es-end','es-bairro','es-obs'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('jard-form').style.display = 'none';
  abrirEspaco(esp.id_espaco);
}

async function excluirEspaco(id) {
  const e = cacheEspacos().find(x => x.id_espaco === id);
  if (!e) return;
  if (!confirm(`Excluir "${e.nome}"${e.codigo ? ' (' + e.codigo + ')' : ''} e todos os seus canteiros?\n\nEssa ação não pode ser desfeita.`)) return;
  await cancelarPendentes(it =>
    (it.tipo === 'insert' && it.tabela === 'jard_espacos' && it.dados?.id_espaco === id) ||
    (it.tipo === 'insert' && it.tabela === 'jard_canteiros' && it.dados?.id_espaco === id) ||
    (it.tipo === 'foto' && it.entidade === 'jard_espaco' && it.idEntidade === id)
  );
  await enqueue({ tipo: 'delete', tabela: 'jard_espacos', filter: { id_espaco: 'eq.' + id } });
  LS.set('cache_espacos', JSON.stringify(cacheEspacos().filter(x => x.id_espaco !== id)));
  const atual = espAtual();
  if (atual && atual.id_espaco === id) LS.del('esp_atual');
  renderJardLista();
  showToast('Espaço excluído.', 'success');
}

function renderJardLista() {
  const el = document.getElementById('jard-lista');
  const esps = cacheEspacos();
  if (!esps.length) { el.innerHTML = '<div class="empty">Nenhum espaço ainda. Toque em "+ Novo espaço" para cadastrar o primeiro.</div>'; return; }
  const TIPO_L = { praca:'Praça', rotatoria:'Rotatória', canteiro_rua:'Canteiro de rua', floreira:'Floreira', jardim:'Jardim', outro:'Outro' };
  el.innerHTML = esps.map(e => `
    <div class="list-item" onclick="abrirEspaco('${e.id_espaco}')">
      <div class="li-main">
        <div class="li-title"><span class="li-nome">${escapeHtml(e.nome)}</span></div>
        <div class="li-sub">${[e.codigo, TIPO_L[e.tipo] || e.tipo, escapeHtml(e.bairro || '')].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="li-right">
        <span class="badge">${e.canteiros || 0} cant.</span>
        <button class="li-del" onclick="event.stopPropagation(); excluirEspaco('${e.id_espaco}')" aria-label="Excluir espaço">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`).join('');
}

async function atualizarJardOnline() {
  if (!sessionValida() || !navigator.onLine) return;
  try {
    const rows = await sbSelect('jard_espacos',
      'select=id_espaco,codigo,nome,tipo,endereco,bairro,criado_em,jard_canteiros(count)&order=criado_em.desc&limit=80');
    const online = (rows || []).map(o => ({
      ...o,
      canteiros: (o.jard_canteiros && o.jard_canteiros[0] && o.jard_canteiros[0].count) || 0
    }));
    const pendentes = cacheEspacos().filter(c => !online.some(o => o.id_espaco === c.id_espaco));
    LS.set('cache_espacos', JSON.stringify([...pendentes, ...online]));
    renderJardLista();
  } catch(e) { console.warn('jard online:', e.message); }
}

let canteirosDoEspaco = [];
let canteiroEditando = null;

async function abrirEspaco(id) {
  const e = cacheEspacos().find(x => x.id_espaco === id);
  if (!e) return;
  LS.set('esp_atual', JSON.stringify(e));
  document.getElementById('ep-nome').textContent = e.nome;
  document.getElementById('ep-sub').textContent = [e.endereco, e.bairro].filter(Boolean).join(' · ') || 'Espaço de jardinagem';
  document.getElementById('ep-cod').textContent = e.codigo || 'JD';
  montarChips('ct-itens', ITENS_CANTEIRO, 'on-green');
  canteiroEditando = null;
  await carregarCanteirosDoEspaco();
  resetCanteiroForm();
  renderCanteiros();
  showPage('espaco');
}

async function carregarCanteirosDoEspaco() {
  const e = espAtual();
  canteirosDoEspaco = [];
  if (!e) return;
  if (sessionValida() && navigator.onLine) {
    try {
      const cts = await sbSelect('jard_canteiros',
        `select=*,jard_especies(*)&id_espaco=eq.${e.id_espaco}&order=seq.asc`);
      const arr = cts || [];
      if (arr.length) {
        const ids = arr.map(c => c.id_canteiro).join(',');
        let fotos = [];
        try {
          fotos = await sbSelect('fotos',
            `select=drive_file_id,web_link,id_entidade&entidade=eq.jard_canteiro&id_entidade=in.(${ids})`) || [];
        } catch(err) { console.warn('fotos canteiros:', err.message); }
        const byCt = {};
        fotos.forEach(f => (byCt[f.id_entidade] = byCt[f.id_entidade] || []).push(f));
        arr.forEach(c => {
          c.especies = c.jard_especies || [];
          delete c.jard_especies;
          c.fotos = byCt[c.id_canteiro] || [];
        });
      }
      canteirosDoEspaco = arr;
    } catch(err) { console.warn('canteiros:', err.message); }
  }
  // Pendentes na fila (offline / ainda não sincronizados)
  const fila = await idbAll('fila');
  const ids = new Set(canteirosDoEspaco.map(c => c.id_canteiro));
  fila.filter(it => it.tipo === 'insert' && it.tabela === 'jard_canteiros' &&
                    it.dados?.id_espaco === e.id_espaco && !ids.has(it.dados.id_canteiro))
      .forEach(it => {
        const esp = fila.filter(x => x.tipo === 'insert' && x.tabela === 'jard_especies' &&
                                     x.dados?.id_canteiro === it.dados.id_canteiro)
                        .map(x => x.dados);
        canteirosDoEspaco.push({ ...it.dados, especies: esp, fotos: [], _pendente: true });
      });
  canteirosDoEspaco.sort((a, b) => (a.seq || 0) - (b.seq || 0));
}

const FORMATO_L = { retangular:'Retangular', circular:'Circular', coracao:'Coração', irregular:'Irregular' };

function renderCanteiros() {
  const el = document.getElementById('ep-canteiros');
  if (!canteirosDoEspaco.length) { el.innerHTML = ''; return; }
  const linhas = canteirosDoEspaco.map(c => {
    const esp = (c.especies || []).map(s => `${s.especie_texto || ''} ×${s.qtd_mudas || 0}`).filter(x => x.trim() !== '×0').join(', ');
    const info = [c.area_m2 ? (+c.area_m2).toFixed(1).replace('.', ',') + ' m²' : null, esp].filter(Boolean).join(' · ') || 'sem detalhes';
    const fs = c.fotos || [];
    const strip = fs.length
      ? `<div class="foto-strip" style="margin-top:8px" onclick="event.stopPropagation()">
          ${fs.slice(0, 3).map(f => `<a href="${fullDrive(f.drive_file_id)}" target="_blank" rel="noopener"><img class="foto-thumb" src="${thumbDrive(f.drive_file_id)}" alt="foto" onerror="this.style.opacity=0.25"></a>`).join('')}
          ${fs.length > 3 ? `<div class="foto-thumb" style="display:flex; align-items:center; justify-content:center; background:var(--accent-light); color:var(--accent-dark); font-weight:700">+${fs.length - 3}</div>` : ''}
        </div>` : '';
    const editando = canteiroEditando === c.id_canteiro ? 'style="border-color:var(--accent); background:var(--accent-light)"' : '';
    return `
    <div class="list-item" ${editando} onclick="editarCanteiro('${c.id_canteiro}')">
      <div class="li-main">
        <div class="li-title">
          <span class="li-nome">Canteiro ${c.seq || '?'} — ${FORMATO_L[c.formato] || c.formato || ''}</span>
          ${c._pendente ? '<span class="li-quadra" style="background:var(--warning-light); color:var(--warning)">pendente</span>' : ''}
        </div>
        <div class="li-sub">${escapeHtml(info)}</div>
        ${strip}
      </div>
      <div class="li-right">
        <span class="badge ${c.situacao === 'criar' ? 'warn' : c.situacao === 'reformular' ? 'red' : ''}">${c.situacao || '—'}</span>
        <button class="li-del" onclick="event.stopPropagation(); excluirCanteiro('${c.id_canteiro}')" aria-label="Excluir canteiro">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="page-sub" style="margin:0 0 6px">Canteiros (${canteirosDoEspaco.length}). Toque para editar.</div>` + linhas;
}

let formatoAtual = 'retangular';
function setFormato(el) {
  pickOne(el);
  formatoAtual = el.dataset.v;
  document.getElementById('ct-dims-ret').style.display = formatoAtual === 'retangular' ? 'grid' : 'none';
  document.getElementById('ct-dims-circ').style.display = formatoAtual === 'circular' ? 'grid' : 'none';
  document.getElementById('ct-dims-livre').style.display = (formatoAtual === 'coracao' || formatoAtual === 'irregular') ? 'block' : 'none';
  calcArea();
}

function areaCanteiro() {
  const vias = Math.max(1, parseInt(
    (formatoAtual === 'circular' ? document.getElementById('ct-vias2').value : document.getElementById('ct-vias').value) || '1', 10));
  let a = 0;
  if (formatoAtual === 'retangular') {
    a = (parseFloat(document.getElementById('ct-comp').value) || 0) * (parseFloat(document.getElementById('ct-larg').value) || 0);
  } else if (formatoAtual === 'circular') {
    const d = parseFloat(document.getElementById('ct-diam').value) || 0;
    a = Math.PI * Math.pow(d / 2, 2);
  } else {
    a = parseFloat(document.getElementById('ct-area-livre').value) || 0;
  }
  return { area: a * vias, vias };
}

function calcArea() {
  const { area } = areaCanteiro();
  const box = document.getElementById('ct-calc');
  if (!area) { box.style.display = 'none'; return; }
  const mudas = Math.round(area / ESPACAMENTO_M2);
  const caixas = Math.ceil(mudas / CX_MUDAS);
  box.style.display = 'block';
  box.innerHTML = `Área: <b>${area.toFixed(1).replace('.', ',')} m²</b> — sugestão (15×15 cm): <b>~${mudas.toLocaleString('pt-BR')} mudas</b> = <b>${caixas} cx</b>`;
  document.querySelectorAll('.esp-row').forEach(r => sugerirQtd(r));
}

/* linhas de espécie */
function addEspecieRow(pre) {
  const div = document.createElement('div');
  div.className = 'esp-row card';
  div.style.padding = '12px';
  div.innerHTML = `
    <select class="er-sel">${optionsEspecies('jardinagem', true)}</select>
    <input type="text" class="er-livre" placeholder="Nome da espécie (livre)" style="display:none; margin-top:8px">
    <div class="row3" style="margin-top:8px">
      <div><label style="margin-top:0">Mudas</label><input type="number" class="er-mudas" inputmode="numeric"></div>
      <div><label style="margin-top:0">Caixas</label><input type="number" class="er-cx" inputmode="decimal" step="0.5"></div>
      <div><label style="margin-top:0">Condição</label>
        <select class="er-cond"><option value="bom">Bom</option><option value="replantar">Replantar</option><option value="criar">Criar</option></select>
      </div>
    </div>
    <button class="btn btn-sm btn-danger-ghost" style="margin-top:8px" onclick="this.parentElement.remove()">Remover</button>`;
  document.getElementById('ct-especies').appendChild(div);
  const sel = div.querySelector('.er-sel');
  sel.onchange = () => div.querySelector('.er-livre').style.display = sel.value === '__livre__' ? 'block' : 'none';
  const mu = div.querySelector('.er-mudas'), cx = div.querySelector('.er-cx');
  mu.dataset.origem = '';
  mu.oninput = () => { cx.value = mu.value ? (Math.round(mu.value / CX_MUDAS * 10) / 10) : ''; mu.dataset.origem = 'manual'; };
  cx.oninput = () => { mu.value = cx.value ? Math.round(cx.value * CX_MUDAS) : ''; mu.dataset.origem = 'manual'; };

  if (pre) {
    const nomes = catalogo().map(c => c.nome_popular);
    const nome = pre.especie_texto || '';
    if (nome && nomes.includes(nome)) sel.value = nome;
    else if (nome) { sel.value = '__livre__'; div.querySelector('.er-livre').style.display = 'block'; div.querySelector('.er-livre').value = nome; }
    mu.value = pre.qtd_mudas || '';
    cx.value = pre.qtd_caixas || (pre.qtd_mudas ? Math.round(pre.qtd_mudas / CX_MUDAS * 10) / 10 : '');
    div.querySelector('.er-cond').value = pre.condicao || 'bom';
    mu.dataset.origem = pre.origem_qtd || 'manual';
  } else {
    sugerirQtd(div);
  }
}

function sugerirQtd(row) {
  const mu = row.querySelector('.er-mudas'), cx = row.querySelector('.er-cx');
  if (mu.dataset.origem === 'manual' || mu.value) return;
  const { area } = areaCanteiro();
  if (!area) return;
  const mudas = Math.round(area / ESPACAMENTO_M2);
  mu.value = mudas; cx.value = Math.round(mudas / CX_MUDAS * 10) / 10;
  mu.dataset.origem = 'calculada';
}

function resetCanteiroForm() {
  canteiroEditando = null;
  formatoAtual = 'retangular';
  document.querySelectorAll('#ct-formato .chip').forEach((c, i) => c.classList.toggle('on-green', i === 0));
  document.getElementById('ct-dims-ret').style.display = 'grid';
  document.getElementById('ct-dims-circ').style.display = 'none';
  document.getElementById('ct-dims-livre').style.display = 'none';
  ['ct-comp','ct-larg','ct-diam','ct-area-livre','ct-obs'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('ct-vias').value = 1;
  document.getElementById('ct-vias2').value = 1;
  document.getElementById('ct-calc').style.display = 'none';
  limparChips('ct-situacao', 'on-green');
  limparChips('ct-itens', 'on-green');
  document.getElementById('ct-especies').innerHTML = '';
  fotosForm.ct = [];
  document.querySelectorAll('#ct-fotos .foto-wrap').forEach(el => el.remove());
  document.getElementById('ct-fotos-antigas').innerHTML = '';
  document.getElementById('ct-form-title').textContent = 'Novo canteiro';
  document.getElementById('ct-form-cancel').style.display = 'none';
  document.getElementById('ct-save-btn').textContent = 'Salvar canteiro';
  addEspecieRow();
}

function sairEdicaoCanteiro() {
  resetCanteiroForm();
  renderCanteiros();
}

function editarCanteiro(id) {
  const c = canteirosDoEspaco.find(x => x.id_canteiro === id);
  if (!c) return;
  resetCanteiroForm();
  canteiroEditando = id;
  // Formato + dimensões
  const chip = document.querySelector('#ct-formato .chip[data-v="' + (c.formato || 'retangular') + '"]');
  if (chip) setFormato(chip);
  const vias = c.vias || 1;
  if (c.formato === 'retangular') {
    document.getElementById('ct-comp').value = c.comp_m || '';
    document.getElementById('ct-larg').value = c.larg_m || '';
    document.getElementById('ct-vias').value = vias;
  } else if (c.formato === 'circular') {
    document.getElementById('ct-diam').value = c.diametro_m || '';
    document.getElementById('ct-vias2').value = vias;
  } else if (c.area_m2) {
    document.getElementById('ct-area-livre').value = Math.round((c.area_m2 / vias) * 100) / 100;
  }
  calcArea();
  // Situação e itens
  if (c.situacao) {
    const s = document.querySelector('#ct-situacao .chip[data-v="' + c.situacao + '"]');
    if (s) s.classList.add('on-green');
  }
  (c.itens || []).forEach(v => {
    const i = document.querySelector('#ct-itens .chip[data-v="' + v + '"]');
    if (i) i.classList.add('on-green');
  });
  document.getElementById('ct-obs').value = c.obs || '';
  // Espécies pré-preenchidas
  document.getElementById('ct-especies').innerHTML = '';
  const esp = c.especies || [];
  if (esp.length) esp.forEach(s => addEspecieRow(s));
  else addEspecieRow();
  // Fotos antigas
  const fs = c.fotos || [];
  document.getElementById('ct-fotos-antigas').innerHTML = fs.length
    ? `<div class="page-sub" style="margin:4px 0 6px">Fotos já enviadas (toque para abrir no Drive)</div>
       <div class="foto-strip">${fs.map(f => `<a href="${fullDrive(f.drive_file_id)}" target="_blank" rel="noopener"><img class="foto-thumb" src="${thumbDrive(f.drive_file_id)}" alt="foto" onerror="this.style.opacity=0.25"></a>`).join('')}</div>`
    : '';
  // UI de edição
  document.getElementById('ct-form-title').textContent = 'Editando canteiro ' + (c.seq || '');
  document.getElementById('ct-form-cancel').style.display = 'inline-flex';
  document.getElementById('ct-save-btn').textContent = 'Salvar alterações';
  renderCanteiros();
  document.getElementById('ct-form').scrollIntoView({ behavior: 'smooth' });
}

function coletarLinhasEspecies(idCanteiro) {
  const out = [];
  for (const row of document.querySelectorAll('.esp-row')) {
    const sel = row.querySelector('.er-sel').value;
    const nome = sel === '__livre__' ? row.querySelector('.er-livre').value.trim() : sel;
    const mudas = parseInt(row.querySelector('.er-mudas').value || '0', 10);
    if (!nome || !mudas) continue;
    const cat = catalogo().find(c => c.nome_popular === nome);
    out.push({
      id_registro: uuid(), id_canteiro: idCanteiro,
      id_especie: cat ? cat.id_especie : null,
      especie_texto: nome,
      qtd_mudas: mudas,
      qtd_caixas: Math.round(mudas / CX_MUDAS * 10) / 10,
      origem_qtd: row.querySelector('.er-mudas').dataset.origem || 'manual',
      condicao: row.querySelector('.er-cond').value,
      criado_em: agora(), criado_por: userEmail
    });
  }
  return out;
}

function coletarCamposCanteiro() {
  const { area, vias } = areaCanteiro();
  return {
    formato: formatoAtual,
    comp_m: formatoAtual === 'retangular' ? (parseFloat(document.getElementById('ct-comp').value) || null) : null,
    larg_m: formatoAtual === 'retangular' ? (parseFloat(document.getElementById('ct-larg').value) || null) : null,
    diametro_m: formatoAtual === 'circular' ? (parseFloat(document.getElementById('ct-diam').value) || null) : null,
    vias,
    area_m2: area ? Math.round(area * 100) / 100 : null,
    situacao: chipsMarcados('ct-situacao', 'on-green')[0] || null,
    itens: chipsMarcados('ct-itens', 'on-green'),
    obs: document.getElementById('ct-obs').value.trim() || null
  };
}

async function salvarCanteiro() {
  const e = espAtual();
  if (!e) return showPage('jard');

  if (canteiroEditando) {
    // === EDIÇÃO ===
    const id = canteiroEditando;
    const campos = coletarCamposCanteiro();
    const especies = coletarLinhasEspecies(id);
    const fila = await idbAll('fila');
    const it = fila.find(x => x.tipo === 'insert' && x.tabela === 'jard_canteiros' && x.dados?.id_canteiro === id);
    // Espécies: substituição total (remove pendentes antigas / delete no servidor, insere as novas)
    await cancelarPendentes(x => x.tipo === 'insert' && x.tabela === 'jard_especies' && x.dados?.id_canteiro === id);
    if (it) {
      it.dados = { ...it.dados, ...campos };
      await idbPut('fila', it);
    } else {
      await enqueue({ tipo: 'update', tabela: 'jard_canteiros', filter: { id_canteiro: 'eq.' + id }, patch: campos });
      await enqueue({ tipo: 'delete', tabela: 'jard_especies', filter: { id_canteiro: 'eq.' + id } });
    }
    for (const s of especies) await enqueue({ tipo: 'insert', tabela: 'jard_especies', dados: s });
    await enfileirarFotos('ct', 'jard_canteiro', id, (e.codigo || 'JD') + '_c' + (canteirosDoEspaco.find(c => c.id_canteiro === id)?.seq || 'edit'));
    const idx = canteirosDoEspaco.findIndex(c => c.id_canteiro === id);
    if (idx >= 0) canteirosDoEspaco[idx] = { ...canteirosDoEspaco[idx], ...campos, especies };
    const seqEditado = canteirosDoEspaco[idx]?.seq || '';
    sairEdicaoCanteiro();
    showToast('Canteiro ' + seqEditado + ' atualizado.', 'success');
    return;
  }

  // === NOVO ===
  const maxSeq = canteirosDoEspaco.reduce((m, c) => Math.max(m, c.seq || 0), 0);
  const idCanteiro = uuid();
  const campos = coletarCamposCanteiro();
  const dados = {
    id_canteiro: idCanteiro,
    id_espaco: e.id_espaco,
    seq: maxSeq + 1,
    ...campos,
    criado_em: agora(),
    criado_por: userEmail
  };
  await enqueue({ tipo: 'insert', tabela: 'jard_canteiros', dados });
  const especies = coletarLinhasEspecies(idCanteiro);
  for (const s of especies) await enqueue({ tipo: 'insert', tabela: 'jard_especies', dados: s });
  await enfileirarFotos('ct', 'jard_canteiro', idCanteiro, (e.codigo || 'JD') + '_c' + dados.seq);

  canteirosDoEspaco.push({ ...dados, especies, fotos: [], _pendente: true });
  const cache = cacheEspacos().map(c => c.id_espaco === e.id_espaco ? { ...c, canteiros: canteirosDoEspaco.length } : c);
  LS.set('cache_espacos', JSON.stringify(cache));

  resetCanteiroForm();
  renderCanteiros();
  showToast('Canteiro ' + dados.seq + ' salvo.', 'success');
  window.scrollTo(0, 0);
}

async function excluirCanteiro(id) {
  const c = canteirosDoEspaco.find(x => x.id_canteiro === id);
  if (!c) return;
  if (!confirm(`Excluir canteiro ${c.seq}${c.formato ? ' (' + (FORMATO_L[c.formato] || c.formato) + ')' : ''} e suas espécies?\n\nEssa ação não pode ser desfeita.`)) return;
  await cancelarPendentes(it =>
    (it.tipo === 'insert' && it.tabela === 'jard_canteiros' && it.dados?.id_canteiro === id) ||
    (it.tipo === 'insert' && it.tabela === 'jard_especies'  && it.dados?.id_canteiro === id) ||
    (it.tipo === 'update' && it.tabela === 'jard_canteiros' && it.filter?.id_canteiro === 'eq.' + id) ||
    (it.tipo === 'foto'   && it.entidade === 'jard_canteiro' && it.idEntidade === id)
  );
  if (!c._pendente) {
    await enqueue({ tipo: 'delete', tabela: 'jard_canteiros', filter: { id_canteiro: 'eq.' + id } });
  }
  canteirosDoEspaco = canteirosDoEspaco.filter(x => x.id_canteiro !== id);
  const e = espAtual();
  if (e) {
    const cache = cacheEspacos().map(x => x.id_espaco === e.id_espaco ? { ...x, canteiros: canteirosDoEspaco.length } : x);
    LS.set('cache_espacos', JSON.stringify(cache));
  }
  if (canteiroEditando === id) sairEdicaoCanteiro();
  else renderCanteiros();
  showToast('Canteiro excluído.', 'success');
}

