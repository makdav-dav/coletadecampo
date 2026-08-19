/* ================================================================
   MÓDULO HORTO MUNICIPAL — inventário de mudas
   Hierarquia: Canteiro → Quadra → Item (espécie + porte + quantidade)
   Fotos em cada nível. Catálogo de espécies com dados botânicos.
   Segue o mesmo padrão dos outros módulos: fila offline + cache local.
   ================================================================ */

/* ── estado + cache local (p/ funcionar offline) ── */
let hortoCanteiroAtual = null;   // id do canteiro aberto
let hortoQuadraAtual   = null;   // id da quadra aberta
let hortoQuadras = [];           // quadras do canteiro aberto
let hortoItens   = [];           // itens da quadra aberta
let hortoItensFotos = {};        // { id_item: [fotos] }
let itemEditando = null;         // id_item em edição (null = novo item)
let especieEditando = null;      // id_especie em edição no catálogo

/* Busca fotos salvas de várias entidades de uma vez → { id_entidade: [fotos] } */
async function fotosDe(entidade, ids) {
  if (!ids.length || !sessionValida() || !navigator.onLine) return {};
  try {
    const rows = await sbSelect('fotos',
      `select=drive_file_id,id_entidade&entidade=eq.${entidade}&id_entidade=in.(${ids.join(',')})`) || [];
    const map = {};
    rows.forEach(f => { (map[f.id_entidade] = map[f.id_entidade] || []).push(f); });
    return map;
  } catch (e) { console.warn('fotos horto:', e.message); return {}; }
}
function stripFotosHorto(fs) {
  if (!fs || !fs.length) return '';
  return `<div class="foto-strip">${fs.map(f =>
    `<a href="${fullDrive(f.drive_file_id)}" target="_blank" rel="noopener"><img class="foto-thumb" src="${thumbDrive(f.drive_file_id)}" alt="foto" onerror="this.style.opacity=0.25"></a>`).join('')}</div>`;
}

const PORTES = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' };

function cacheCanteiros() { try { return JSON.parse(LS.get('cache_canteiros') || '[]'); } catch (e) { return []; } }
function setCacheCanteiros(arr) { LS.set('cache_canteiros', JSON.stringify(arr.slice(0, 200))); }

function podeEditarCatalogo() { return ['admin', 'editor'].includes(typeof papelUsuario !== 'undefined' ? papelUsuario : null); }

/* ================================================================
   NÍVEL 1 — CANTEIROS
   ================================================================ */
function abrirHorto() { showPage('horto'); renderCanteiros(); atualizarHortoOnline(); }

function novoCanteiro() {
  document.getElementById('cant-form').style.display = 'block';
  ['hc-cod', 'hc-nome', 'hc-obs'].forEach(i => document.getElementById(i).value = '');
  gpsAtual = null;
  document.getElementById('hc-gps-status').textContent = 'GPS não capturado';
  document.getElementById('hc-gps-coord').textContent = '';
  fotosForm.hc = [];
  document.querySelectorAll('#hc-fotos .foto-wrap').forEach(el => el.remove());
  document.getElementById('hc-nome').focus();
}

async function atualizarHortoOnline() {
  if (!sessionValida() || !navigator.onLine) return;
  try {
    const rows = await sbSelect('horto_canteiros',
      'select=id_canteiro,codigo,nome,lat,lng,horto_quadras(id_quadra)&order=criado_em.desc');
    const arr = (rows || []).map(c => ({
      id_canteiro: c.id_canteiro, codigo: c.codigo, nome: c.nome, lat: c.lat, lng: c.lng,
      quadras: (c.horto_quadras || []).length
    }));
    setCacheCanteiros(arr);
    if (document.getElementById('page-horto').classList.contains('active')) renderCanteiros();
  } catch (e) { console.warn('horto online:', e.message); }
}

function renderCanteiros() {
  const busca = (document.getElementById('horto-busca').value || '').toLowerCase().trim();
  let arr = cacheCanteiros();
  if (busca) arr = arr.filter(c => (`${c.codigo || ''} ${c.nome || ''}`).toLowerCase().includes(busca));
  const el = document.getElementById('cant-lista');
  if (!arr.length) {
    el.innerHTML = '<div class="empty">Nenhum canteiro ainda. Toque em “+ Novo canteiro”.</div>';
    return;
  }
  el.innerHTML = arr.map(c => `
    <div class="list-item" onclick="abrirCanteiro('${c.id_canteiro}')">
      <div>
        <div class="li-title">${escapeHtml(c.nome || c.codigo || 'Canteiro')}</div>
        <div class="li-sub">${escapeHtml(c.codigo ? c.codigo + ' · ' : '')}${c.quadras || 0} quadra(s)</div>
      </div>
      <span class="badge">${c.quadras || 0}</span>
    </div>`).join('');
}

async function salvarCanteiro() {
  const nome = document.getElementById('hc-nome').value.trim();
  const codigo = document.getElementById('hc-cod').value.trim();
  if (!nome && !codigo) return showToast('Informe o nome ou o código do canteiro.', 'error');
  const g = gpsAtual;
  const dados = {
    id_canteiro: uuid(),
    codigo: codigo || null,
    nome: nome || null,
    obs: document.getElementById('hc-obs').value.trim() || null,
    lat: g ? g.lat : null,
    lng: g ? g.lng : null,
    lat_gps: g ? (g.lat_gps != null ? g.lat_gps : g.lat) : null,
    lng_gps: g ? (g.lng_gps != null ? g.lng_gps : g.lng) : null,
    precisao_m: g && g.prec != null ? Math.round(g.prec * 10) / 10 : null,
    ajustado: g ? !!g.ajustado : null,
    criado_em: agora(),
    criado_por: userEmail
  };
  await enqueue({ tipo: 'insert', tabela: 'horto_canteiros', dados });
  await enfileirarFotos('hc', 'horto_canteiro', dados.id_canteiro, dados.codigo || dados.nome || 'canteiro');
  const arr = cacheCanteiros();
  arr.unshift({ id_canteiro: dados.id_canteiro, codigo: dados.codigo, nome: dados.nome, lat: dados.lat, lng: dados.lng, quadras: 0 });
  setCacheCanteiros(arr);
  document.getElementById('cant-form').style.display = 'none';
  gpsAtual = null;
  abrirCanteiro(dados.id_canteiro);
  showToast('Canteiro salvo.', 'success');
}

/* ================================================================
   NÍVEL 2 — QUADRAS
   ================================================================ */
async function abrirCanteiro(id) {
  hortoCanteiroAtual = id;
  const c = cacheCanteiros().find(x => x.id_canteiro === id) || {};
  document.getElementById('cd-nome').textContent = c.nome || c.codigo || 'Canteiro';
  document.getElementById('cd-sub').textContent = c.codigo && c.nome ? c.codigo : '';
  document.getElementById('quadra-form').style.display = 'none';
  document.getElementById('cd-fotos-antigas').innerHTML = '';
  showPage('canteiro');
  hortoQuadras = [];
  renderQuadras();
  if (sessionValida() && navigator.onLine) {
    try {
      const rows = await sbSelect('horto_quadras',
        'select=id_quadra,codigo,nome,horto_itens(id_item,quantidade)&id_canteiro=eq.' + id + '&order=criado_em.asc');
      hortoQuadras = (rows || []).map(q => ({
        id_quadra: q.id_quadra, codigo: q.codigo, nome: q.nome,
        itens: (q.horto_itens || []).length,
        mudas: (q.horto_itens || []).reduce((s, i) => s + (i.quantidade || 0), 0)
      }));
      renderQuadras();
    } catch (e) { console.warn('quadras:', e.message); }
    // fotos do canteiro
    const fs = (await fotosDe('horto_canteiro', [id]))[id] || [];
    document.getElementById('cd-fotos-antigas').innerHTML = fs.length
      ? `<div class="page-sub" style="margin-bottom:6px">Fotos do canteiro</div>${stripFotosHorto(fs)}` : '';
  }
}

function renderQuadras() {
  document.getElementById('cd-badge').textContent = hortoQuadras.length + ' quadra(s)';
  const el = document.getElementById('cd-quadras');
  if (!hortoQuadras.length) {
    el.innerHTML = '<div class="empty">Nenhuma quadra neste canteiro ainda.</div>';
    return;
  }
  el.innerHTML = hortoQuadras.map(q => `
    <div class="list-item" onclick="abrirQuadra('${q.id_quadra}')">
      <div>
        <div class="li-title">${escapeHtml(q.nome || q.codigo || 'Quadra')}</div>
        <div class="li-sub">${q.itens || 0} espécie(s) · ${q.mudas || 0} muda(s)</div>
      </div>
      <span class="badge">${q.itens || 0}</span>
    </div>`).join('');
}

function novaQuadra() {
  document.getElementById('quadra-form').style.display = 'block';
  ['hq-nome', 'hq-obs'].forEach(i => document.getElementById(i).value = '');
  fotosForm.hq = [];
  document.querySelectorAll('#hq-fotos .foto-wrap').forEach(el => el.remove());
  document.getElementById('hq-nome').focus();
}

async function salvarQuadra() {
  if (!hortoCanteiroAtual) return showToast('Abra um canteiro primeiro.', 'error');
  const nome = document.getElementById('hq-nome').value.trim();
  if (!nome) return showToast('Informe o código/nome da quadra.', 'error');
  const dados = {
    id_quadra: uuid(),
    id_canteiro: hortoCanteiroAtual,
    codigo: nome,
    nome: nome,
    obs: document.getElementById('hq-obs').value.trim() || null,
    criado_em: agora(),
    criado_por: userEmail
  };
  await enqueue({ tipo: 'insert', tabela: 'horto_quadras', dados });
  await enfileirarFotos('hq', 'horto_quadra', dados.id_quadra, nome);
  hortoQuadras.push({ id_quadra: dados.id_quadra, codigo: nome, nome: nome, itens: 0, mudas: 0 });
  document.getElementById('quadra-form').style.display = 'none';
  abrirQuadra(dados.id_quadra);
  showToast('Quadra salva.', 'success');
}

/* ================================================================
   NÍVEL 3 — ITENS DE INVENTÁRIO
   ================================================================ */
async function abrirQuadra(id) {
  hortoQuadraAtual = id;
  const q = hortoQuadras.find(x => x.id_quadra === id) || {};
  document.getElementById('qd-nome').textContent = q.nome || q.codigo || 'Quadra';
  document.getElementById('qd-sub').textContent = 'Inventário de mudas';
  document.getElementById('qd-fotos-antigas').innerHTML = '';
  showPage('quadra');
  montarSelectHortoEspecies();
  sairEdicaoItem();
  hortoItens = [];
  hortoItensFotos = {};
  renderItens();
  if (sessionValida() && navigator.onLine) {
    try {
      const rows = await sbSelect('horto_itens',
        'select=id_item,especie_texto,porte,quantidade,obs&id_quadra=eq.' + id + '&order=criado_em.asc');
      hortoItens = rows || [];
      renderItens();
    } catch (e) { console.warn('itens:', e.message); }
    // fotos da quadra
    const qfs = (await fotosDe('horto_quadra', [id]))[id] || [];
    document.getElementById('qd-fotos-antigas').innerHTML = qfs.length
      ? `<div class="page-sub" style="margin-bottom:6px">Fotos da quadra</div>${stripFotosHorto(qfs)}` : '';
    // fotos dos itens
    hortoItensFotos = await fotosDe('horto_item', hortoItens.map(i => i.id_item).filter(Boolean));
    renderItens();
  }
}

function renderItens() {
  const total = hortoItens.reduce((s, i) => s + (i.quantidade || 0), 0);
  document.getElementById('qd-badge').textContent = hortoItens.length + ' item(ns) · ' + total + ' muda(s)';
  const el = document.getElementById('qd-itens');
  if (!hortoItens.length) {
    el.innerHTML = '<div class="empty" style="margin-bottom:12px">Nenhum item ainda. Preencha abaixo.</div>';
    return;
  }
  el.innerHTML = hortoItens.map(i => {
    const strip = stripFotosHorto(hortoItensFotos[i.id_item]);
    return `
    <div class="list-item" style="flex-wrap:wrap">
      <div style="flex:1; cursor:pointer" onclick="editarItem('${i.id_item}')">
        <div class="li-title">${escapeHtml(i.especie_texto || 'Espécie')}</div>
        <div class="li-sub">${PORTES[i.porte] || i.porte || '—'}${i.obs ? ' · ' + escapeHtml(i.obs) : ''} · <span style="color:var(--accent); font-weight:600">editar</span></div>
      </div>
      <span class="badge">${i.quantidade != null ? i.quantidade : '—'}</span>
      ${strip ? `<div style="flex-basis:100%; margin-top:8px">${strip}</div>` : ''}
    </div>`;
  }).join('');
}

function hortoEspecieChange() {
  const v = document.getElementById('hi-especie').value;
  document.getElementById('hi-especie-livre').style.display = v === '__livre__' ? 'block' : 'none';
}

function limparFormItem() {
  document.getElementById('hi-especie').value = '';
  document.getElementById('hi-especie-livre').value = '';
  document.getElementById('hi-especie-livre').style.display = 'none';
  document.getElementById('hi-qtd').value = '';
  document.getElementById('hi-obs').value = '';
  limparChips('hi-porte', 'on-green');
  fotosForm.hi = [];
  document.querySelectorAll('#hi-fotos .foto-wrap').forEach(el => el.remove());
}

function coletarCamposItem() {
  const sel = document.getElementById('hi-especie').value;
  let especieTexto = sel, idEspecie = null;
  if (sel === '__livre__') {
    especieTexto = document.getElementById('hi-especie-livre').value.trim();
  } else if (sel) {
    const c = catalogo().find(x => x.nome_popular === sel);
    if (c) idEspecie = c.id_especie;
  }
  if (!especieTexto) { showToast('Escolha ou digite a espécie.', 'error'); return null; }
  const porte = valorChipUnico('hi-porte');
  if (!porte) { showToast('Selecione o porte.', 'error'); return null; }
  const qtd = parseInt(document.getElementById('hi-qtd').value, 10);
  return {
    id_especie: idEspecie,
    especie_texto: especieTexto,
    porte,
    quantidade: isNaN(qtd) ? null : qtd,
    obs: document.getElementById('hi-obs').value.trim() || null
  };
}

async function salvarItem() {
  if (!hortoQuadraAtual) return showToast('Abra uma quadra primeiro.', 'error');
  const campos = coletarCamposItem();
  if (!campos) return;

  if (itemEditando) {
    // === EDIÇÃO ===
    const id = itemEditando;
    const fila = await idbAll('fila');
    const it = fila.find(x => x.tipo === 'insert' && x.tabela === 'horto_itens' && x.dados && x.dados.id_item === id);
    if (it) {                                        // ainda não sincronizou: edita o insert na fila
      it.dados = { ...it.dados, ...campos };
      await idbPut('fila', it);
    } else {                                         // já está no banco: manda um update
      await enqueue({ tipo: 'update', tabela: 'horto_itens', filter: { id_item: 'eq.' + id }, patch: campos });
    }
    await enfileirarFotos('hi', 'horto_item', id, campos.especie_texto);
    const idx = hortoItens.findIndex(x => x.id_item === id);
    if (idx >= 0) hortoItens[idx] = { ...hortoItens[idx], ...campos };
    sairEdicaoItem();
    renderItens();
    showToast('Item atualizado.', 'success');
    return;
  }

  // === NOVO ITEM ===
  const dados = { id_item: uuid(), id_quadra: hortoQuadraAtual, ...campos, criado_em: agora(), criado_por: userEmail };
  await enqueue({ tipo: 'insert', tabela: 'horto_itens', dados });
  await enfileirarFotos('hi', 'horto_item', dados.id_item, campos.especie_texto);
  hortoItens.push(dados);
  limparFormItem();
  renderItens();
  showToast('Item adicionado.', 'success');
  window.scrollTo(0, document.body.scrollHeight);
}

function editarItem(id) {
  const i = hortoItens.find(x => x.id_item === id);
  if (!i) return;
  itemEditando = id;
  document.getElementById('hi-form-title').textContent = 'Editando item';
  document.getElementById('hi-save-btn').textContent = 'Salvar alteração';
  document.getElementById('hi-cancel-btn').style.display = '';
  document.getElementById('hi-del-btn').style.display = '';
  // espécie (do catálogo, ou texto livre)
  montarSelectHortoEspecies();
  const sel = document.getElementById('hi-especie');
  sel.value = i.especie_texto || '';
  if (sel.value !== (i.especie_texto || '')) {
    sel.value = '__livre__';
    document.getElementById('hi-especie-livre').value = i.especie_texto || '';
  }
  hortoEspecieChange();
  marcarChip('hi-porte', i.porte);
  document.getElementById('hi-qtd').value = i.quantidade != null ? i.quantidade : '';
  document.getElementById('hi-obs').value = i.obs || '';
  // strip de fotos NOVAS a anexar (as já salvas seguem na lista)
  fotosForm.hi = [];
  document.querySelectorAll('#hi-fotos .foto-wrap').forEach(el => el.remove());
  document.getElementById('hi-nova-esp').style.display = 'none';
  document.getElementById('hi-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sairEdicaoItem() {
  itemEditando = null;
  document.getElementById('hi-form-title').textContent = 'Novo item de inventário';
  document.getElementById('hi-save-btn').textContent = 'Salvar item';
  document.getElementById('hi-cancel-btn').style.display = 'none';
  document.getElementById('hi-del-btn').style.display = 'none';
  limparFormItem();
}

async function excluirItem() {
  if (!itemEditando) return;
  const id = itemEditando;
  if (!confirm('Excluir este item do inventário?\n\nEssa ação não pode ser desfeita.')) return;
  const fila = await idbAll('fila');
  const it = fila.find(x => x.tipo === 'insert' && x.tabela === 'horto_itens' && x.dados && x.dados.id_item === id);
  if (it) { await idbDel('fila', it.id); atualizarBadgeFila(); }   // nunca sincronizou → só tira da fila
  else { await enqueue({ tipo: 'delete', tabela: 'horto_itens', filter: { id_item: 'eq.' + id } }); }
  hortoItens = hortoItens.filter(x => x.id_item !== id);
  sairEdicaoItem();
  renderItens();
  showToast('Item excluído.', 'success');
}

function voltarCanteiro() {
  if (hortoCanteiroAtual) abrirCanteiro(hortoCanteiroAtual);
  else abrirHorto();
}

/* ================================================================
   CATÁLOGO DE ESPÉCIES
   ================================================================ */
function montarSelectHortoEspecies() {
  const sel = document.getElementById('hi-especie');
  if (!sel) return;
  const cat = catalogo();
  sel.innerHTML = '<option value="">— selecione a espécie —</option>' +
    cat.map(c => `<option value="${escapeHtml(c.nome_popular)}">${escapeHtml(c.nome_popular)}${c.nome_cientifico ? ' (' + escapeHtml(c.nome_cientifico) + ')' : ''}</option>`).join('') +
    '<option value="__livre__">Outra (digitar)…</option>';
}

function abrirEspecies() { showPage('especies'); document.getElementById('esp-form').style.display = 'none'; renderEspecies(); }

function renderEspecies() {
  const busca = (document.getElementById('esp-busca').value || '').toLowerCase().trim();
  let cat = catalogo();
  if (busca) cat = cat.filter(c => (`${c.nome_popular || ''} ${c.nome_cientifico || ''}`).toLowerCase().includes(busca));
  const el = document.getElementById('esp-lista');
  if (!cat.length) { el.innerHTML = '<div class="empty">Nenhuma espécie no catálogo.</div>'; return; }
  const pode = podeEditarCatalogo();
  el.innerHTML = cat.map(c => {
    const tags = [
      c.origem ? (c.origem === 'nativa' ? 'Nativa' : 'Exótica') : null,
      c.classificacao === 'frutifera' ? 'Frutífera' : (c.classificacao === 'ornamental' ? 'Ornamental' : null),
      c.classificacao === 'frutifera' && c.fruto ? 'fruto: ' + c.fruto.split(',').map(f => f === 'comestivel' ? 'comestível' : 'fauna').join(' + ') : null
    ].filter(Boolean).join(' · ');
    return `
    <div class="list-item" style="cursor:default">
      <div>
        <div class="li-title">${escapeHtml(c.nome_popular)}</div>
        <div class="li-sub">${c.nome_cientifico ? '<i>' + escapeHtml(c.nome_cientifico) + '</i>' : ''}${tags ? (c.nome_cientifico ? ' · ' : '') + tags : ''}</div>
      </div>
      ${pode ? `<button class="btn btn-sm" style="width:auto" onclick="editarEspecie('${escapeHtml(c.id_especie)}')">Editar</button>` : ''}
    </div>`;
  }).join('');
}

function novaEspecie() {
  especieEditando = null;
  document.getElementById('esp-form-title').textContent = 'Nova espécie';
  document.getElementById('esp-form').style.display = 'block';
  document.getElementById('sp-nome').value = '';
  document.getElementById('sp-cient').value = '';
  limparChips('sp-class', 'on-green');
  limparChips('sp-origem', 'on-green');
  limparChips('sp-fruto', 'on');
  document.getElementById('sp-fruto-wrap').style.display = 'none';
  document.getElementById('sp-nome').focus();
}

function editarEspecie(id) {
  const c = catalogo().find(x => String(x.id_especie) === String(id));
  if (!c) return;
  especieEditando = c.id_especie;
  document.getElementById('esp-form-title').textContent = 'Editar espécie';
  document.getElementById('esp-form').style.display = 'block';
  document.getElementById('sp-nome').value = c.nome_popular || '';
  document.getElementById('sp-cient').value = c.nome_cientifico || '';
  marcarChip('sp-class', c.classificacao);
  marcarChip('sp-origem', c.origem);
  limparChips('sp-fruto', 'on');
  (c.fruto ? c.fruto.split(',') : []).forEach(f => {
    const chip = document.querySelector(`#sp-fruto .chip[data-v="${f}"]`);
    if (chip) chip.classList.add('on');
  });
  document.getElementById('sp-fruto-wrap').style.display = c.classificacao === 'frutifera' ? 'block' : 'none';
  document.getElementById('sp-nome').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelarEspecie() { document.getElementById('esp-form').style.display = 'none'; especieEditando = null; }

/* chip de seleção única (classificação / origem) */
function selEspChip(el, grupo) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('on-green'));
  el.classList.add('on-green');
  if (grupo.endsWith('class')) {   // sp-class → sp-fruto-wrap · qa-class → qa-fruto-wrap
    const wrap = document.getElementById(grupo.replace('class', 'fruto-wrap'));
    if (wrap) wrap.style.display = el.dataset.v === 'frutifera' ? 'block' : 'none';
  }
}
function marcarChip(grupo, valor) {
  limparChips(grupo, 'on-green');
  if (!valor) return;
  const chip = document.querySelector(`#${grupo} .chip[data-v="${valor}"]`);
  if (chip) chip.classList.add('on-green');
}
function valorChipUnico(grupo) {
  const c = document.querySelector('#' + grupo + ' .chip.on-green');
  return c ? c.dataset.v : null;
}

async function salvarEspecie() {
  const nome = document.getElementById('sp-nome').value.trim();
  if (!nome) return showToast('Informe o nome popular.', 'error');
  const classificacao = valorChipUnico('sp-class');
  const origem = valorChipUnico('sp-origem');
  const fruto = classificacao === 'frutifera'
    ? [...document.querySelectorAll('#sp-fruto .chip.on')].map(c => c.dataset.v).join(',')
    : null;

  const campos = {
    nome_popular: nome,
    nome_cientifico: document.getElementById('sp-cient').value.trim() || null,
    classificacao: classificacao || null,
    origem: origem || null,
    fruto: fruto || null
  };

  if (especieEditando) {
    await enqueue({ tipo: 'update', tabela: 'especies_catalogo', filter: { id_especie: 'eq.' + especieEditando }, patch: campos });
    const cat = catalogo();
    const i = cat.findIndex(x => String(x.id_especie) === String(especieEditando));
    if (i >= 0) { cat[i] = { ...cat[i], ...campos }; LS.set('catalogo', JSON.stringify(cat)); }
    showToast('Espécie atualizada.', 'success');
  } else {
    await inserirEspecieCatalogo(campos);
    showToast('Espécie cadastrada.', 'success');
  }
  especieEditando = null;
  document.getElementById('esp-form').style.display = 'none';
  montarSelectHortoEspecies();
  renderEspecies();
}

/* Insere uma espécie no catálogo (fila) e atualiza o cache local + selects.
   Retorna o registro criado. Usado pelo catálogo e pelo cadastro rápido. */
async function inserirEspecieCatalogo(campos) {
  const dados = { id_especie: uuid(), ativo: true, ...campos };
  await enqueue({ tipo: 'insert', tabela: 'especies_catalogo', dados });
  const cat = catalogo();
  cat.push({ ...dados, uso: '' });
  cat.sort((a, b) => (a.nome_popular || '').localeCompare(b.nome_popular || ''));
  LS.set('catalogo', JSON.stringify(cat));
  montarSelectHortoEspecies();
  return dados;
}

/* ── Cadastro rápido de espécie, direto no formulário do item ── */
function abrirEspecieRapida() {
  const box = document.getElementById('hi-nova-esp');
  const abrir = box.style.display === 'none';
  box.style.display = abrir ? 'block' : 'none';
  if (!abrir) return;
  ['qa-nome', 'qa-cient'].forEach(i => document.getElementById(i).value = '');
  limparChips('qa-class', 'on-green');
  limparChips('qa-origem', 'on-green');
  limparChips('qa-fruto', 'on');
  document.getElementById('qa-fruto-wrap').style.display = 'none';
  document.getElementById('qa-nome').focus();
}

async function salvarEspecieRapida() {
  const nome = document.getElementById('qa-nome').value.trim();
  if (!nome) return showToast('Informe o nome da espécie.', 'error');
  const classificacao = valorChipUnico('qa-class');
  const fruto = classificacao === 'frutifera'
    ? [...document.querySelectorAll('#qa-fruto .chip.on')].map(c => c.dataset.v).join(',')
    : null;
  await inserirEspecieCatalogo({
    nome_popular: nome,
    nome_cientifico: document.getElementById('qa-cient').value.trim() || null,
    classificacao: classificacao || null,
    origem: valorChipUnico('qa-origem') || null,
    fruto: fruto || null
  });
  // já seleciona a espécie recém-criada no item
  document.getElementById('hi-especie').value = nome;
  hortoEspecieChange();
  document.getElementById('hi-nova-esp').style.display = 'none';
  showToast('Espécie cadastrada e selecionada.', 'success');
}
