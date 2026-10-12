/* ================================================================
   MÓDULO: PLANTÃO EMERGENCIAL
   Número de WhatsApp da equipe terceirizada + Ordens de Serviço
   Emergenciais (queda de árvore / desobstrução de via) para
   acionamento em finais de semana e fora do horário comercial.
   Offline-first: grava pela fila, igual aos outros módulos.
   ================================================================ */

const EMERG_NUM_KEY = 'emerg_whatsapp_num';
const EMERG_NUM_DEFAULT = '41997350163';

function emergNumeroAtual() {
  return LS.get(EMERG_NUM_KEY) || EMERG_NUM_DEFAULT;
}

function emergNumeroFormatado(digits) {
  const d = (digits || '').replace(/\D/g, '');
  if (d.length !== 11 && d.length !== 10) return digits || '';
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}

function emergAtualizarUI() {
  const el = document.getElementById('emerg-numero-atual');
  if (el) el.textContent = emergNumeroFormatado(emergNumeroAtual());
}

function configurarNumeroEmergencia() {
  const atual = emergNumeroAtual();
  const entrada = prompt('Número de WhatsApp da equipe de plantão (com DDD):', emergNumeroFormatado(atual));
  if (entrada === null) return;
  const digitos = entrada.replace(/\D/g, '');
  if (digitos.length !== 10 && digitos.length !== 11) {
    showToast('Número inválido. Informe DDD + número (10 ou 11 dígitos).', 'error');
    return;
  }
  LS.set(EMERG_NUM_KEY, digitos);
  emergAtualizarUI();
  showToast('Número de plantão atualizado.', 'success');
}

/* ── OS EMERGENCIAL ── */
const OS_STATUS_LABEL = { aberta: 'Aberta', concluida: 'Concluída' };
const OS_STATUS_BADGE = { aberta: 'red', concluida: '' };

let osAtualId = null;

function cacheOS() { try { return JSON.parse(LS.get('cache_os') || '[]'); } catch (e) { return []; } }
function setCacheOS(arr) { LS.set('cache_os', JSON.stringify(arr.slice(0, 200))); }

function abrirOS() { showPage('os'); renderOSLista(); atualizarOSOnline(); }

function fmtDataHoraOS(iso) { try { return new Date(iso).toLocaleString('pt-BR'); } catch (e) { return ''; } }

// número vem do banco (sequência); antes de sincronizar ainda não existe
function numOS(r) { return r && r.numero ? `${r.numero}/${new Date(r.aberto_em || r.criado_em).getFullYear()}` : null; }

function renderOSLista() {
  const arr = cacheOS();
  const el = document.getElementById('os-lista');
  if (!arr.length) { el.innerHTML = '<div class="empty">Nenhuma OS emergencial ainda. Toque em “+ Nova OS”.</div>'; return; }
  el.innerHTML = arr.map(r => `
    <div class="list-item" onclick="abrirOSDetalhe('${r.id_os}')">
      <div class="li-main">
        <div class="li-title">${numOS(r) ? 'Nº ' + numOS(r) + ' · ' : ''}${escapeHtml(r.descricao || '(sem descrição)')}</div>
        <div class="li-sub">${escapeHtml(r.endereco || '')}${r.aberto_em ? ' · ' + fmtDataHoraOS(r.aberto_em) : ''}</div>
      </div>
      <span class="badge ${OS_STATUS_BADGE[r.status] || ''}">${OS_STATUS_LABEL[r.status] || r.status}</span>
    </div>`).join('');
}

async function atualizarOSOnline() {
  atualizarHomeOS();
  if (!sessionValida() || !navigator.onLine) return;
  try {
    const rows = (await sbSelect('os_emergencial', 'select=*&order=criado_em.desc&limit=100')) || [];
    // o servidor ainda não tem o que está na fila: reaplica inserts/baixas pendentes
    const pend = (await idbAll('fila')).filter(it => it.tabela === 'os_emergencial');
    for (const it of pend) {
      if (it.tipo === 'insert' && !rows.some(x => x.id_os === it.dados.id_os)) rows.unshift(it.dados);
      if (it.tipo === 'update') {
        const alvo = rows.find(x => 'eq.' + x.id_os === it.filter.id_os);
        if (alvo) Object.assign(alvo, it.patch);
      }
    }
    const apagados = pend.filter(it => it.tipo === 'delete').map(it => it.filter.id_os);
    setCacheOS(rows.filter(x => !apagados.includes('eq.' + x.id_os)));
    if (document.getElementById('page-os').classList.contains('active')) renderOSLista();
    atualizarHomeOS();
  } catch (e) { console.warn('os online:', e.message); }
}

function atualizarHomeOS() {
  const el = document.getElementById('home-os-desc');
  if (!el) return;
  const abertas = cacheOS().filter(r => r.status !== 'concluida').length;
  el.textContent = abertas ? `🚨 ${abertas} OS em aberto` : 'Nenhuma OS em aberto';
}

function novaOS() {
  showPage('os-form');
  ['os-desc', 'os-end', 'os-quem', 'os-equipe', 'os-equip'].forEach(i => { const e = document.getElementById(i); if (e) e.value = ''; });
  ['os-rede', 'os-vitimas', 'os-transito'].forEach(i => document.getElementById(i).classList.remove('on'));
  document.querySelectorAll('#os-situacao .chip').forEach(c => c.classList.remove('on'));
  gpsAtual = null;
  document.getElementById('os-gps-status').textContent = 'GPS não capturado';
  document.getElementById('os-gps-coord').textContent = '';
  fotosForm.os = [];
  document.querySelectorAll('#os-fotos .foto-wrap').forEach(el => el.remove());
  window.scrollTo(0, 0);
}

function montarMsgOS(dados) {
  const linhas = [
    '🚨 *OS EMERGENCIAL*' + (numOS(dados) ? ' *Nº ' + numOS(dados) + '*' : ''),
    dados.descricao || '(sem descrição)',
    '📍 ' + (dados.endereco || 'endereço não informado')
  ];
  if (dados.lat) linhas.push('🗺️ https://www.google.com/maps?q=' + dados.lat + ',' + dados.lng);
  if ((dados.situacao || []).length) linhas.push('Situação: ' + dados.situacao.join(', '));
  if (dados.risco_rede) linhas.push('⚠️ Risco de rede elétrica — NÃO atuar sem a concessionária.');
  if (dados.risco_vitimas) linhas.push('⚠️ Possíveis vítimas.');
  if (dados.risco_transito) linhas.push('⚠️ Trânsito afetado.');
  if (dados.quem_acionou) linhas.push('Acionado por: ' + dados.quem_acionou);
  linhas.push('Acionado em ' + fmtDataHoraOS(dados.aberto_em || agora()));
  if (dados.status === 'concluida') linhas.push('✅ Concluída em ' + fmtDataHoraOS(dados.concluido_em));
  return linhas.join('\n');
}

function montarLinkWhatsAppOS(dados) {
  const numero = (dados.numero_whatsapp || emergNumeroAtual()).replace(/\D/g, '');
  return 'https://wa.me/55' + numero + '?text=' + encodeURIComponent(montarMsgOS(dados));
}

/* Grava direto no banco para receber o número da OS na hora.
   Sem internet/sessão (ou se falhar) a OS segue pela fila, como os outros módulos. */
async function inserirOSDireto(dados) {
  if (!sessionValida() || !navigator.onLine) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/os_emergencial?select=numero', {
      method: 'POST', signal: ctrl.signal,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(limparPayload(dados))
    });
    if (!r.ok) throw new Error(await r.text().catch(() => 'HTTP ' + r.status));
    const j = await r.json();
    if (j && j[0] && j[0].numero) dados.numero = j[0].numero;
    return true;
  } catch (e) {
    console.warn('OS direto falhou, vai pela fila:', e.message);
    return false;
  } finally { clearTimeout(t); }
}

// fotos recém-tiradas ficam em memória para entrar no PDF antes de terminar o upload
const fotosLocaisOS = {};

async function salvarOS() {
  const descricao = document.getElementById('os-desc').value.trim();
  if (!descricao) return showToast('Descreva a ocorrência.', 'error');
  const endereco = document.getElementById('os-end').value.trim();
  if (!endereco) return showToast('Informe o endereço.', 'error');
  const g = gpsAtual;
  const situacao = [...document.querySelectorAll('#os-situacao .chip.on')].map(c => c.dataset.v);
  const risco_rede = document.getElementById('os-rede').classList.contains('on');
  const risco_vitimas = document.getElementById('os-vitimas').classList.contains('on');
  const risco_transito = document.getElementById('os-transito').classList.contains('on');
  const dados = {
    id_os: uuid(),
    descricao, endereco,
    lat: g ? g.lat : null, lng: g ? g.lng : null,
    quem_acionou: document.getElementById('os-quem').value.trim() || null,
    situacao,
    risco_rede, risco_vitimas, risco_transito,
    equipe_responsavel: document.getElementById('os-equipe').value.trim() || null,
    equipamentos: document.getElementById('os-equip').value.trim() || null,
    status: 'aberta',
    numero_whatsapp: emergNumeroAtual(),
    aberto_por: userEmail || null,
    aberto_em: agora(),
    criado_em: agora(),
    criado_por: userEmail
  };
  const btn = document.getElementById('os-btn-salvar');
  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    fotosLocaisOS[dados.id_os] = { antes: fotosForm.os.map(f => f.blob), depois: [] };
    if (!(await inserirOSDireto(dados))) await enqueue({ tipo: 'insert', tabela: 'os_emergencial', dados });
    await enfileirarFotos('os', 'os_emergencial', dados.id_os, 'abertura');
    const arr = cacheOS();
    arr.unshift(dados);
    setCacheOS(arr);
    atualizarHomeOS();
    showToast(dados.numero ? `OS nº ${numOS(dados)} aberta. Envie para a equipe.` : 'OS salva. O número sai quando sincronizar.', 'success');
    abrirOSDetalhe(dados.id_os);
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar e gerar OS';
  }
}

/* ── PDF + envio ── */
let pdfOS = null;   // { chave, file, erro }

async function fotosParaPdf(r) {
  const local = fotosLocaisOS[r.id_os] || { antes: [], depois: [] };
  let srv = [];
  if (sessionValida() && navigator.onLine) {
    try { srv = ((await carregarFotos('os_emergencial', [r.id_os]))[r.id_os] || []).map(f => f.drive_file_id); } catch (e) {}
  }
  const antes = srv.filter(u => /abertura/i.test(u)), depois = srv.filter(u => /conclusao/i.test(u));
  return { antes: antes.length ? antes : local.antes, depois: depois.length ? depois : local.depois };
}

async function prepararPdfOS(r) {
  const chave = JSON.stringify(r);
  if (pdfOS && pdfOS.chave === chave) return pintarBotoesPdf();
  pdfOS = { chave, file: null, erro: null };
  pintarBotoesPdf();
  try {
    const blob = await gerarPdfOS(r, await fotosParaPdf(r));
    if (pdfOS.chave === chave) pdfOS.file = new File([blob], nomeArquivoPdfOS(r), { type: 'application/pdf' });
  } catch (e) {
    if (pdfOS.chave === chave) pdfOS.erro = e.message;
  }
  pintarBotoesPdf();
}

function pintarBotoesPdf() {
  const b = document.getElementById('os-btn-enviar');
  if (!b) return;
  const pronto = pdfOS && pdfOS.file;
  b.disabled = !pronto;
  b.textContent = pronto ? '📲 Enviar no WhatsApp com PDF' : (pdfOS && pdfOS.erro ? '⚠️ Erro ao gerar PDF' : '⏳ Preparando PDF…');
  const d = document.getElementById('os-btn-baixar');
  if (d) d.disabled = !pronto;
}

function baixarPdfOS() {
  if (!pdfOS || !pdfOS.file) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(pdfOS.file); a.download = pdfOS.file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// sem await antes do share: o celular só abre o compartilhamento dentro do gesto do toque
function enviarOSWhatsApp() {
  const r = osAtual();
  if (!r || !pdfOS || !pdfOS.file) return;
  const texto = montarMsgOS(r);
  if (navigator.canShare && navigator.canShare({ files: [pdfOS.file] })) {
    navigator.share({ files: [pdfOS.file], text: texto, title: 'OS Emergencial ' + (numOS(r) || '') })
      .catch(e => { if (e.name !== 'AbortError') showToast('Não foi possível compartilhar: ' + e.message, 'error'); });
    return;
  }
  // computador / navegador sem compartilhamento de arquivo: baixa o PDF e abre a conversa
  baixarPdfOS();
  window.open(montarLinkWhatsAppOS(r), '_blank');
  showToast('PDF baixado — anexe na conversa do WhatsApp que abriu.', 'info');
}

function osAtual() { return cacheOS().find(r => r.id_os === osAtualId); }

function abrirOSDetalhe(id) {
  osAtualId = id;
  showPage('os-detalhe');
  renderOSDetalhe();
  renderOSFotosDetalhe(id);
  const r = osAtual();
  if (r && !r.numero) aguardarNumeroOS(id, 8);
}

// OS que foi pela fila: tenta buscar o número gerado pelo banco enquanto a tela estiver aberta
function aguardarNumeroOS(id, tentativas) {
  setTimeout(async () => {
    const naTela = () => osAtualId === id && document.getElementById('page-os-detalhe').classList.contains('active');
    if (!naTela()) return;
    await atualizarOSOnline();
    if (!naTela()) return;
    const r = osAtual();
    if (r && r.numero) renderOSDetalhe();
    else if (tentativas > 1) aguardarNumeroOS(id, tentativas - 1);
  }, 5000);
}

function renderOSDetalhe() {
  const r = osAtual();
  const el = document.getElementById('os-det-corpo');
  if (!r) { el.innerHTML = '<div class="empty">OS não encontrada.</div><div class="btn-row"><button class="btn" onclick="abrirOS()">Voltar à lista</button></div>'; return; }
  el.innerHTML = `
    <div class="card">
      <div class="li-sub" style="font-weight:700; margin-bottom:4px">${numOS(r) ? 'OS Emergencial nº ' + numOS(r) : 'Nº da OS: aguardando sincronização…'}</div>
      <div class="li-title">${escapeHtml(r.descricao || '')} <span class="badge ${OS_STATUS_BADGE[r.status] || ''}">${OS_STATUS_LABEL[r.status] || r.status}</span></div>
      <div class="li-sub" style="margin-top:6px">📍 ${escapeHtml(r.endereco || '')}</div>
      ${r.lat ? `<div class="li-sub"><a href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank" rel="noopener">Ver no mapa</a></div>` : ''}
      ${(r.situacao || []).length ? `<div class="li-sub">Situação: ${escapeHtml(r.situacao.join(', '))}</div>` : ''}
      ${r.risco_rede ? '<div class="li-sub" style="color:var(--danger); font-weight:700; margin-top:4px">⚠️ Risco de rede elétrica</div>' : ''}
      ${r.risco_vitimas ? '<div class="li-sub" style="color:var(--danger); font-weight:700">⚠️ Possíveis vítimas</div>' : ''}
      ${r.risco_transito ? '<div class="li-sub" style="color:var(--danger); font-weight:700">⚠️ Trânsito afetado</div>' : ''}
      ${r.quem_acionou ? `<div class="li-sub">Acionado por: ${escapeHtml(r.quem_acionou)}</div>` : ''}
      <div class="li-sub" style="margin-top:6px">Aberta em ${fmtDataHoraOS(r.aberto_em)}${r.aberto_por ? ' por ' + escapeHtml(r.aberto_por) : ''}</div>
      ${r.equipe_responsavel ? `<div class="li-sub">Equipe: ${escapeHtml(r.equipe_responsavel)}</div>` : ''}
      ${r.equipamentos ? `<div class="li-sub">Equipamentos: ${escapeHtml(r.equipamentos)}</div>` : ''}
      ${r.concluido_em ? `<div class="li-sub">Concluída em ${fmtDataHoraOS(r.concluido_em)}</div>` : ''}
      ${r.obs_conclusao ? `<div class="li-sub">Serviço realizado: ${escapeHtml(r.obs_conclusao)}</div>` : ''}
      ${r.pendencias ? `<div class="li-sub">Pendências: ${escapeHtml(r.pendencias)}</div>` : ''}
    </div>
    <div id="os-det-fotos" class="foto-strip" style="margin-bottom:12px"></div>
    ${r.numero ? '' : '<div class="page-sub" style="margin:0 0 6px">Sem internet ou ainda sincronizando: o PDF sai sem número até a OS chegar ao servidor.</div>'}
    <button class="btn btn-primary" id="os-btn-enviar" onclick="enviarOSWhatsApp()" disabled>⏳ Preparando PDF…</button>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn" id="os-btn-baixar" onclick="baixarPdfOS()" disabled>⬇️ Baixar PDF</button>
      <button class="btn" onclick="window.open(montarLinkWhatsAppOS(osAtual()),'_blank')">💬 Só mensagem</button>
    </div>
    <div class="btn-row">
      ${r.status !== 'concluida' ? `<button class="btn btn-primary" onclick="abrirBaixaOS()">✔️ Dar baixa</button>` : ''}
      <button class="btn" onclick="abrirOS()">Voltar à lista</button>
    </div>
    <button class="btn btn-danger-ghost" style="margin-top:16px" onclick="excluirOS()">🗑️ Excluir OS</button>`;
  prepararPdfOS(r);
}

async function excluirOS() {
  const r = osAtual();
  if (!r) return;
  if (!confirm(`Excluir a OS "${r.descricao || ''}"?\n\nEssa ação não pode ser desfeita.`)) return;
  const id = r.id_os;
  await cancelarPendentes(it =>
    (it.tabela === 'os_emergencial' && (it.dados?.id_os === id || it.filter?.id_os === 'eq.' + id)) ||
    (it.tipo === 'foto' && it.entidade === 'os_emergencial' && it.idEntidade === id)
  );
  await enqueue({ tipo: 'delete', tabela: 'os_emergencial', filter: { id_os: 'eq.' + id } });
  setCacheOS(cacheOS().filter(x => x.id_os !== id));
  atualizarHomeOS();
  showToast('OS excluída.', 'success');
  abrirOS();
}

async function renderOSFotosDetalhe(id) {
  const el = document.getElementById('os-det-fotos');
  if (!el) return;
  try {
    const map = await carregarFotos('os_emergencial', [id]);
    const fs = map[id] || [];
    el.innerHTML = fs.map(f => `<a href="${f.drive_file_id}" target="_blank" rel="noopener"><img class="foto-thumb" src="${f.drive_file_id}" alt="foto" onerror="this.style.opacity=0.25"></a>`).join('');
  } catch (e) { /* offline ou sem sessão: silencioso */ }
}

function abrirBaixaOS() {
  showPage('os-baixa');
  document.getElementById('os-baixa-obs').value = '';
  document.getElementById('os-baixa-pend').value = '';
  fotosForm.osb = [];
  document.querySelectorAll('#osb-fotos .foto-wrap').forEach(el => el.remove());
  window.scrollTo(0, 0);
}

async function confirmarBaixaOS() {
  const r = osAtual();
  if (!r) return;
  const obs_conclusao = document.getElementById('os-baixa-obs').value.trim() || null;
  const pendencias = document.getElementById('os-baixa-pend').value.trim() || null;
  const patch = { status: 'concluida', concluido_em: agora(), obs_conclusao, pendencias };
  await enqueue({ tipo: 'update', tabela: 'os_emergencial', filter: { id_os: 'eq.' + r.id_os }, patch });
  (fotosLocaisOS[r.id_os] = fotosLocaisOS[r.id_os] || { antes: [], depois: [] }).depois = fotosForm.osb.map(f => f.blob);
  await enfileirarFotos('osb', 'os_emergencial', r.id_os, 'conclusao');
  Object.assign(r, patch);
  setCacheOS(cacheOS().map(x => x.id_os === r.id_os ? r : x));
  atualizarHomeOS();
  showToast('Baixa registrada.', 'success');
  abrirOSDetalhe(r.id_os);
}

window.addEventListener('DOMContentLoaded', () => { emergAtualizarUI(); atualizarHomeOS(); });
