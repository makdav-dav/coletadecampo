/* ================================================================
   SMMACL Campo — núcleo: Supabase auth + REST, Drive p/ fotos
   ================================================================ */
const SUPABASE_URL = 'https://bsgkloaziukpjjzxxeja.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZ2tsb2F6aXVrcGpqenh4ZWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNTU4OTIsImV4cCI6MjA5OTczMTg5Mn0.Nbb_1X0soL35nFnbBMJO0lkyqlcfHq-o_AYD5hys90k';
const CX_MUDAS = 15;            // 1 caixa = 15 mudas
const ESPACAMENTO_M2 = 0.0225;  // 15 x 15 cm por muda
const FOTOS_BUCKET = 'fotos-campo';  // bucket público do Supabase Storage p/ as fotos

let sb = null;
let session = null;
let providerToken = null;       // token do Google (só p/ Drive)
let providerTokenExp = 0;
let userEmail = LS.get('user_email') || null;
let syncing = false;

/* ── AUTH via Supabase (Google OAuth c/ escopo do Drive) ── */
function handleAuth() {
  if (!sb) { showToast('Sem conexão com a biblioteca do banco. Verifique a rede e recarregue.', 'error'); return; }
  if (session) {
    sb.auth.signOut().then(() => {
      session = null; providerToken = null; providerTokenExp = 0;
      SS.del('drive_token');
      updateAuthUI(false);
      showToast('Desconectado.', 'info');
    });
    return;
  }
  sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });
}

function updateAuthUI(connected) {
  const btn = document.getElementById('btn-auth');
  const lbl = document.getElementById('auth-label');
  btn.classList.toggle('connected', connected);
  lbl.textContent = connected ? (userEmail ? userEmail.split('@')[0] : 'Conectado') : 'Conectar';
  document.getElementById('home-status').textContent = connected
    ? 'Conectado. Registros sincronizam automaticamente.'
    : 'Conecte-se para sincronizar. Dá pra trabalhar offline mesmo assim.';
}

function sessionValida() { return !!session; }
function driveTokenValido() { return providerToken && Date.now() < providerTokenExp - 60000; }

async function onSessionReady() {
  updateAuthUI(true);
  carregarCatalogo();
  sincronizarContadorJD();
  drainQueue();
}

async function aguardarSupabaseLib(ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (typeof supabase !== 'undefined') return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function bootSupabase() {
  const ok = await aguardarSupabaseLib(8000);
  if (!ok) {
    showToast('Biblioteca do banco não carregou (rede bloqueou cdn.jsdelivr.net?). O app segue em modo offline.', 'error');
    return;
  }
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: 'implicit' }
  });
  const { data: { session: s } } = await sb.auth.getSession();
  if (s) {
    session = s;
    userEmail = s.user?.email || userEmail;
    if (userEmail) LS.set('user_email', userEmail);
    if (s.provider_token) {
      providerToken = s.provider_token;
      providerTokenExp = Date.now() + 3300 * 1000; // 55 min de margem
      SS.set('drive_token', JSON.stringify({ t: providerToken, e: providerTokenExp }));
    } else {
      try {
        const c = JSON.parse(SS.get('drive_token') || 'null');
        if (c && Date.now() < c.e) { providerToken = c.t; providerTokenExp = c.e; }
      } catch(e) {}
    }
  }
  sb.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_IN' && s) {
      session = s;
      userEmail = s.user?.email || userEmail;
      if (userEmail) LS.set('user_email', userEmail);
      if (s.provider_token) {
        providerToken = s.provider_token;
        providerTokenExp = Date.now() + 3300 * 1000;
        SS.set('drive_token', JSON.stringify({ t: providerToken, e: providerTokenExp }));
      }
      onSessionReady();
    } else if (event === 'SIGNED_OUT') {
      session = null; providerToken = null;
      updateAuthUI(false);
    }
  });
}

/* ── SUPABASE REST helpers ── */
async function sbFetch(path, opts = {}) {
  if (!session) throw new Error('SEM_SESSION');
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=minimal',
      ...(opts.headers || {})
    },
    body: opts.body
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let msg = t;
    try { const j = JSON.parse(t); msg = j.message || j.hint || t; } catch(e) {}
    throw new Error(msg || ('HTTP ' + r.status));
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

function limparPayload(d) {
  return Object.fromEntries(Object.entries(d).filter(([k, v]) =>
    v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
}

async function sbInsert(tabela, dados) {
  await sbFetch(tabela, { method: 'POST', body: JSON.stringify(limparPayload(dados)) });
}

async function sbUpdate(tabela, filter, patch) {
  const q = Object.entries(filter).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  await sbFetch(tabela + '?' + q, { method: 'PATCH', body: JSON.stringify(patch) });
}

async function sbSelect(tabela, query) {
  return sbFetch(tabela + (query ? '?' + query : ''), { prefer: 'return=representation' });
}

async function sbDelete(tabela, filter) {
  const q = Object.entries(filter).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  await sbFetch(tabela + '?' + q, { method: 'DELETE' });
}

/* ── INDEXEDDB: fila offline ── */
let idb = null;
function abrirDB() {
  return new Promise((resolve, reject) => {
    if (idb) return resolve(idb);
    const req = indexedDB.open('smmacl_app', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = e => { idb = e.target.result; resolve(idb); };
    req.onerror = () => reject(req.error);
  });
}
function idbPut(store, obj) {
  return abrirDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  }));
}
function idbDel(store, id) {
  return abrirDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  }));
}
function idbAll(store) {
  return abrirDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error);
  }));
}
function idbGet(store, id) {
  return abrirDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store).objectStore(store).get(id);
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  }));
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}
function agora() { return new Date().toISOString(); }

async function enqueue(item) {
  item.id = item.id || uuid();
  item.status = 'pendente';
  item.criado_em = item.criado_em || agora();
  await idbPut('fila', item);
  atualizarBadgeFila();
  drainQueue();
}

/* Remove itens pendentes da fila que se refiram a um id específico,
   evitando enviar inserts órfãos após o usuário excluir localmente. */
async function cancelarPendentes(matcher) {
  const itens = await idbAll('fila');
  for (const it of itens) if (matcher(it)) {
    if (it.tipo === 'foto' && it.blobId) await idbDel('blobs', it.blobId);
    await idbDel('fila', it.id);
  }
  atualizarBadgeFila();
}

/* ── DRIVE: upload multipart; pasta criada pelo app (escopo drive.file) ── */
async function pastaDrive() {
  const salva = LS.get('drive_folder_ok');
  if (salva) return salva;
  if (!driveTokenValido()) throw new Error('SEM_TOKEN_DRIVE');
  const meta = { name: 'SMMACL — Fotos de Campo', mimeType: 'application/vnd.google-apps.folder' };
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + providerToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('Drive (criar pasta): ' + (t || r.status));
  }
  const j = await r.json();
  LS.set('drive_folder_ok', j.id);
  return j.id;
}

/* Upload da foto pro Supabase Storage (bucket público).
   Usa o MESMO token autenticado que grava os dados — garante o papel "authenticated". */
async function uploadFotoStorage(blob, path) {
  if (!session) throw new Error('SEM_SESSION');
  const alvo = `${SUPABASE_URL}/storage/v1/object/${FOTOS_BUCKET}/${encodeURI(path)}`;
  const r = await fetch(alvo, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true'
    },
    body: blob
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('Storage: ' + (t || r.status));
  }
  return { path, url: `${SUPABASE_URL}/storage/v1/object/public/${FOTOS_BUCKET}/${encodeURI(path)}` };
}

async function uploadDrive(blob, nome) {
  if (!driveTokenValido()) throw new Error('SEM_TOKEN_DRIVE');
  const folder = await pastaDrive();
  const meta = { name: nome, parents: [folder] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + providerToken },
    body: form
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || ('Drive HTTP ' + r.status));
  }
  return r.json();
}

/* ── FILA: drenagem ── */
async function drainQueue(manual) {
  if (syncing) return;
  if (!navigator.onLine) { if (manual) showToast('Sem conexão de rede.', 'error'); atualizarBadgeFila(); return; }
  if (!sessionValida())  { if (manual) showToast('Conecte-se primeiro (botão no topo).', 'error'); atualizarBadgeFila(); return; }
  syncing = true;
  try {
    const itens = (await idbAll('fila')).sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    let ok = 0, falha = 0;
    for (const it of itens) {
      try {
        if (it.tipo === 'insert') {
          await sbInsert(it.tabela, it.dados);
        } else if (it.tipo === 'update') {
          await sbUpdate(it.tabela, it.filter, it.patch);
        } else if (it.tipo === 'delete') {
          await sbDelete(it.tabela, it.filter);
        } else if (it.tipo === 'foto') {
          const b = await idbGet('blobs', it.blobId);
          if (b && b.blob) {
            const path = `${it.entidade}/${it.idEntidade}/${it.nomeArquivo}`;
            const up = await uploadFotoStorage(b.blob, path);
            await sbInsert('fotos', {
              id_foto: it.idFoto, drive_file_id: up.url, web_link: up.url,
              entidade: it.entidade, id_entidade: it.idEntidade,
              criado_em: it.criado_em, criado_por: userEmail
            });
            await idbDel('blobs', it.blobId);
          }
        }
        await idbDel('fila', it.id);
        ok++;
      } catch (e) {
        if (e.message === 'SEM_SESSION') break;
        // Já existe no banco (reenvio de item que na verdade foi gravado): considera OK
        if (/duplicate key|already exists|23505/i.test(e.message)) {
          if (it.tipo === 'foto' && it.blobId) { try { await idbDel('blobs', it.blobId); } catch(_) {} }
          await idbDel('fila', it.id);
          ok++;
          continue;
        }
        it.status = 'erro'; it.erro = e.message;
        await idbPut('fila', it);
        falha++;
      }
    }
    if (ok) showToast(`${ok} registro(s) sincronizado(s).`, 'success');
    if (falha && manual) showToast(`${falha} com erro — veja a fila.`, 'error');
  } finally {
    syncing = false;
    atualizarBadgeFila();
    if (document.getElementById('page-fila').classList.contains('active')) renderFila();
  }
}

async function atualizarBadgeFila() {
  const n = (await idbAll('fila')).length;
  const dot = document.getElementById('fila-dot');
  dot.style.display = n ? 'flex' : 'none';
  dot.textContent = n;
  document.getElementById('home-fila-desc').textContent =
    n ? `${n} registro(s) aguardando sincronização` : 'Nenhum registro pendente';
}

window.addEventListener('online', () => { document.body.classList.remove('offline'); drainQueue(); });
window.addEventListener('offline', () => document.body.classList.add('offline'));
if (!navigator.onLine) document.body.classList.add('offline');
setInterval(() => drainQueue(), 45000);

/* ── FOTOS: compressão + carimbo (GPS, endereço, data/hora) ── */
const fotosForm = { pt: [], es: [], ct: [] };

/* Geocodificação reversa (OpenStreetMap/Nominatim) com cache e timeout curto */
const endCache = {};
async function reverseGeo(lat, lng) {
  if (!navigator.onLine) return null;
  const key = lat.toFixed(4) + ',' + lng.toFixed(4);
  if (endCache[key] !== undefined) return endCache[key];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
      { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (!r.ok) throw new Error('geo ' + r.status);
    const j = await r.json();
    endCache[key] = j.address || {};
    return endCache[key];
  } catch(e) { endCache[key] = null; return null; }
}

async function enderecoAproximado(lat, lng) {
  const a = await reverseGeo(lat, lng);
  if (!a) return null;
  const partes = [
    [a.road, a.house_number].filter(Boolean).join(', '),
    a.suburb || a.neighbourhood || a.village,
    a.city || a.town || a.municipality
  ].filter(Boolean);
  return partes.join(' – ') || null;
}

/* Pega GPS atual (reaproveita o do formulário de ponto se existir) */
function gpsAgora() {
  if (gpsAtual) return Promise.resolve(gpsAtual);
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('GPS indisponível neste navegador'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, prec: p.coords.accuracy }),
      e => rej(new Error('GPS: ' + (e.message || 'sem permissão'))),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });
}

/* Preenche campos de um formulário a partir do endereço do GPS.
   mapa = { idDoCampo: fn(address) } — só preenche campo vazio. */
async function usarGPSnosCampos(mapa, rotulo) {
  try {
    showToast('Buscando endereço pelo GPS…', 'info');
    const g = await gpsAgora();
    const a = await reverseGeo(g.lat, g.lng);
    if (!a) return showToast('Sem internet ou endereço não encontrado para essas coordenadas.', 'error');
    let preencheu = 0, jaTinha = 0, semDado = 0;
    for (const [id, fn] of Object.entries(mapa)) {
      const campo = document.getElementById(id);
      if (!campo) continue;
      if (campo.value.trim()) { jaTinha++; continue; }   // campo já preenchido — não sobrescreve
      const v = fn(a);
      if (v) { campo.value = v; preencheu++; }
      else   { semDado++; }                               // GPS não retornou esse dado
    }
    if (preencheu)      showToast('Preenchido pelo GPS.', 'success');
    else if (semDado)   showToast('O GPS não encontrou ' + (rotulo || 'esse dado') + ' para este local. Preencha manualmente.', 'info');
    else                showToast('Campo já preenchido — nada alterado.', 'info');
  } catch (e) { showToast(e.message, 'error'); }
}
function gpsRua()    { return usarGPSnosCampos({ 'ru-nome': a => a.road, 'ru-bairro': a => a.suburb || a.neighbourhood || a.village }, 'a rua/bairro'); }
function gpsPonto()  { return usarGPSnosCampos({ 'pt-num': a => a.house_number }, 'o número desta casa'); }
function gpsEspaco() { return usarGPSnosCampos({ 'es-end': a => [a.road, a.house_number].filter(Boolean).join(', '), 'es-bairro': a => a.suburb || a.neighbourhood || a.village }, 'o endereço/bairro'); }

function desenharCarimbo(ctx, w, h, linhas) {
  if (!linhas.length) return;
  const fs = Math.max(15, Math.round(h * 0.028));       // fonte proporcional
  const lh = Math.round(fs * 1.35);
  const pad = Math.round(fs * 0.8);
  const alturaFaixa = pad * 2 + lh * linhas.length;
  // faixa degradê no rodapé pra garantir contraste
  const grad = ctx.createLinearGradient(0, h - alturaFaixa - lh, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - alturaFaixa - lh, w, alturaFaixa + lh);
  // texto branco com sombra
  ctx.font = `600 ${fs}px -apple-system, 'Segoe UI', Roboto, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  linhas.forEach((ln, i) => {
    ctx.fillText(ln, pad, h - pad - (linhas.length - 1 - i) * lh, w - pad * 2);
  });
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

/* Logo institucional no canto superior direito das fotos.
   Coloque o arquivo "logo.png" na mesma pasta do index.html. */
const logoCarimbo = new Image();
let logoCarimboOk = false;
logoCarimbo.onload  = () => { logoCarimboOk = logoCarimbo.naturalWidth > 0; };
logoCarimbo.onerror = () => { logoCarimboOk = false; };
logoCarimbo.src = 'logo.png';

function desenharLogo(ctx, w, h) {
  if (!logoCarimboOk) return;
  const ratio = logoCarimbo.naturalHeight / logoCarimbo.naturalWidth;
  const lw = Math.min(Math.round(w * 0.52), 600);   // largura ~52% da foto (40% + 30%)
  const lh = Math.round(lw * ratio);
  const m  = Math.round(w * 0.02);
  const x  = w - lw - m, y = m;
  ctx.drawImage(logoCarimbo, x, y, lw, lh);
}

function comprimirFoto(file, carimbo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600;
      let { width: w, height: h } = img;
      if (Math.max(w, h) > MAX) { const k = MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      if (carimbo && carimbo.length) {
        try { desenharCarimbo(ctx, w, h, carimbo); } catch(e) { console.warn('carimbo:', e.message); }
      }
      try { desenharLogo(ctx, w, h); } catch(e) { console.warn('logo:', e.message); }
      cv.toBlob(b => b ? resolve(b) : reject(new Error('Falha na compressão')), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    img.src = url;
  });
}

async function montarCarimbo() {
  const ts = new Date();
  const dataHora = ts.toLocaleDateString('pt-BR') + ' ' + ts.toLocaleTimeString('pt-BR');
  const linhas = [];
  if (gpsAtual) {
    const a = await reverseGeo(gpsAtual.lat, gpsAtual.lng);
    if (a) {
      const l1 = [a.road, a.house_number].filter(Boolean).join(', ');
      const l2 = [a.suburb || a.neighbourhood || a.village,
                  a.city || a.town || a.municipality,
                  a.state].filter(Boolean).join(' · ');
      if (l1) linhas.push(l1);
      if (l2) linhas.push(l2);
    }
    linhas.push(gpsAtual.lat.toFixed(6) + ', ' + gpsAtual.lng.toFixed(6) +
      (gpsAtual.prec ? ' (±' + Math.round(gpsAtual.prec) + ' m)' : ''));
  }
  linhas.push(dataHora + ' · SMMA Campo Largo');
  return linhas;
}

async function addFoto(input, pfx) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const carimbo = await montarCarimbo();
    const blob = await comprimirFoto(file, carimbo);
    const id = uuid();
    fotosForm[pfx].push({ id, blob });
    const wrap = document.createElement('div');
    wrap.className = 'foto-wrap';
    wrap.dataset.fid = id;
    const im = document.createElement('img');
    im.className = 'foto-thumb';
    im.src = URL.createObjectURL(blob);
    im.onclick = () => abrirPreviewLocal(im.src);
    const x = document.createElement('button');
    x.className = 'foto-x'; x.textContent = '×';
    x.onclick = () => { fotosForm[pfx] = fotosForm[pfx].filter(f => f.id !== id); wrap.remove(); };
    wrap.appendChild(im); wrap.appendChild(x);
    document.getElementById(pfx + '-fotos').appendChild(wrap);
  } catch (e) { showToast('Erro na foto: ' + e.message, 'error'); }
}

function abrirPreviewLocal(src) {
  document.getElementById('foto-prev-img').src = src;
  document.getElementById('foto-prev').classList.add('open');
}
function fecharPreviewLocal() {
  document.getElementById('foto-prev').classList.remove('open');
  document.getElementById('foto-prev-img').src = '';
}

async function enfileirarFotos(pfx, entidade, idEntidade, rotulo) {
  const lista = fotosForm[pfx].splice(0);
  document.querySelectorAll('#' + pfx + '-fotos .foto-wrap').forEach(el => el.remove());
  for (let i = 0; i < lista.length; i++) {
    const f = lista[i];
    await idbPut('blobs', { id: f.id, blob: f.blob });
    await enqueue({
      tipo: 'foto', blobId: f.id, idFoto: uuid(),
      entidade, idEntidade,
      nomeArquivo: `${entidade}_${rotulo}_${Date.now()}_${i + 1}.jpg`
    });
  }
}

/* ── GPS ── */
let gpsAtual = null;
function capturarGPS(pfx) {
  const sId = pfx === 'es' ? 'es-gps-status' : 'gps-status';
  const cId = pfx === 'es' ? 'es-gps-coord' : 'gps-coord';
  const st = document.getElementById(sId), co = document.getElementById(cId);
  if (!navigator.geolocation) { st.textContent = 'GPS indisponível neste aparelho'; return; }
  st.textContent = 'Capturando GPS…'; co.textContent = '';
  navigator.geolocation.getCurrentPosition(pos => {
    gpsAtual = { lat: pos.coords.latitude, lng: pos.coords.longitude, prec: pos.coords.accuracy };
    st.textContent = `GPS ok (±${Math.round(gpsAtual.prec)} m)`;
    co.textContent = gpsAtual.lat.toFixed(6) + ', ' + gpsAtual.lng.toFixed(6);
  }, err => {
    gpsAtual = null;
    st.textContent = 'GPS falhou: ' + (err.message || 'sem sinal');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
}

/* ================================================================
   UI: navegação, catálogo e módulos
   ================================================================ */
function showPage(p) {
  document.querySelectorAll('.page').forEach(s => s.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    const alvo = { home:'home', arbo:'arbo', rua:'arbo', ponto:'arbo', jard:'jard', espaco:'jard', consulta:'consulta', fila:'fila' }[p];
    b.classList.toggle('active', b.dataset.p === alvo);
  });
  window.scrollTo(0, 0);
}
function navTo(p) {
  if (p === 'arbo') return abrirArbo();
  if (p === 'jard') return abrirJard();
  if (p === 'consulta') return abrirConsulta();
  if (p === 'fila') { showPage('fila'); return renderFila(); }
  showPage(p);
}

/* ── CATÁLOGO DE ESPÉCIES (cache local p/ offline) ── */
function catalogo() {
  try { return JSON.parse(LS.get('catalogo') || '[]'); } catch(e) { return []; }
}
async function carregarCatalogo() {
  try {
    const rows = await sbSelect('especies_catalogo',
      'select=id_especie,nome_popular,categoria,uso&ativo=eq.true&order=nome_popular.asc');
    const norm = (rows || []).map(c => ({ ...c, uso: Array.isArray(c.uso) ? c.uso.join(',') : (c.uso || '') }));
    LS.set('catalogo', JSON.stringify(norm));
    montarSelectsEspecies();
  } catch(e) { console.warn('catalogo:', e.message); }
}
function optionsEspecies(uso, incluirVazio) {
  const cat = catalogo().filter(c => !uso || (c.uso || '').includes(uso));
  let h = incluirVazio ? '<option value="">— selecione —</option>' : '';
  h += cat.map(c => `<option value="${c.nome_popular}">${c.nome_popular}</option>`).join('');
  h += '<option value="__livre__">Outra (digitar)…</option>';
  return h;
}
function montarSelectsEspecies() {
  document.getElementById('pt-esp-plano').innerHTML = optionsEspecies('arborizacao', true);
  document.getElementById('pt-esp-sug').innerHTML = optionsEspecies('arborizacao', true);
}

/* ── IMPEDIMENTOS / ITENS (chips) ── */
const IMPEDIMENTOS = [
  ['poste','Poste'], ['garagem','Garagem'], ['comercio','Comércio'], ['guia_rebaixada','Guia rebaixada'],
  ['placa','Placa'], ['esgoto','Esgoto'], ['hidrante','Hidrante'], ['outro','Outro']
];
const ITENS_CANTEIRO = [
  ['poste','Poste'], ['placa','Placa'], ['banco','Banco'], ['lixeira','Lixeira'],
  ['monumento','Monumento'], ['hidrante','Hidrante'], ['floreira','Floreira'], ['outro','Outro']
];
function montarChips(elId, lista, classeOn) {
  const el = document.getElementById(elId);
  el.innerHTML = lista.map(([v, l]) => `<span class="chip" data-v="${v}">${l}</span>`).join('');
  el.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    c.classList.toggle(classeOn);
    if (elId === 'pt-imped' && c.dataset.v === 'outro')
      document.getElementById('pt-imped-outro').style.display = c.classList.contains(classeOn) ? 'block' : 'none';
  });
}
function chipsMarcados(elId, classeOn) {
  return [...document.querySelectorAll('#' + elId + ' .chip.' + classeOn)].map(c => c.dataset.v);
}
function limparChips(elId, classeOn) {
  document.querySelectorAll('#' + elId + ' .chip').forEach(c => c.classList.remove(classeOn));
}
function pickOne(el) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('on-green'));
  el.classList.add('on-green');
}

