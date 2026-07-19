/* ================================================================
   MÓDULO CONSULTA (desktop) — tabela, detalhe, galeria navegável
   ================================================================ */
let consTabAtual = 'arbo';
let consDados = [];          // linhas carregadas (ruas OU espacos, com filhos e fotos)
let consFotosFlat = [];      // p/ lightbox: [{groupId, groupLabel, url, capSub}]
let lbGroups = [];           // grupos (pontos/canteiros) com fotos, p/ navegação
let lbGroupIdx = 0, lbPhotoIdx = 0;

function abrirConsulta() {
  showPage('consulta');
  consTab(consTabAtual);
}

function consTab(t) {
  consTabAtual = t;
  document.querySelectorAll('.cons-tab').forEach(b => b.classList.toggle('active', b.dataset.t === t));
  const dash = t === 'dash';
  document.getElementById('cons-filtros').style.display = dash ? 'none' : '';
  document.querySelector('.cons-actions').style.display = dash ? 'none' : '';
  document.getElementById('cons-resultado').innerHTML = '';
  document.getElementById('cons-count').textContent = '';
  if (dash) return dashAbrir();
  renderFiltros();
  consBuscar();
}

function renderFiltros() {
  const el = document.getElementById('cons-filtros');
  if (consTabAtual === 'arbo') {
    el.innerHTML = `
      <div><label>Rua</label><input type="text" id="f-rua" placeholder="nome da rua"></div>
      <div><label>Bairro</label><input type="text" id="f-bairro" placeholder="bairro"></div>
      <div><label>Situação do trecho</label>
        <select id="f-status"><option value="">todas</option><option value="em_andamento">Em andamento</option><option value="encerrado">Encerrado</option></select>
      </div>
      <div><label>Só com foto</label>
        <select id="f-foto"><option value="">não filtrar</option><option value="1">só com foto</option></select>
      </div>`;
  } else {
    el.innerHTML = `
      <div><label>Nome / código</label><input type="text" id="f-nome" placeholder="praça, JD-0003…"></div>
      <div><label>Bairro</label><input type="text" id="f-bairro" placeholder="bairro"></div>
      <div><label>Tipo</label>
        <select id="f-tipo"><option value="">todos</option><option value="praca">Praça</option><option value="rotatoria">Rotatória</option><option value="canteiro_rua">Canteiro de rua</option><option value="floreira">Floreira</option><option value="jardim">Jardim</option><option value="outro">Outro</option></select>
      </div>
      <div><label>Situação canteiro</label>
        <select id="f-situacao"><option value="">todas</option><option value="existente">Existente</option><option value="criar">Criar</option><option value="reformular">Reformular</option></select>
      </div>`;
  }
}

function consLimparFiltros() { renderFiltros(); consBuscar(); }
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }

async function consBuscar() {
  const box = document.getElementById('cons-resultado');
  if (!sessionValida() || !navigator.onLine) {
    box.innerHTML = '<div class="empty">Conecte-se à internet para consultar os dados no servidor.</div>';
    document.getElementById('cons-count').textContent = '';
    return;
  }
  box.innerHTML = '<div class="empty">Carregando…</div>';
  try {
    consTabAtual === 'arbo' ? await buscarArbo() : await buscarJard();
  } catch (e) {
    box.innerHTML = '<div class="empty">Erro ao consultar: ' + escapeHtml(e.message) + '</div>';
  }
}

/* ---------- ARBORIZAÇÃO ---------- */
async function buscarArbo() {
  // Puxa ruas → trechos → pontos aninhados, e fotos à parte
  let q = 'select=id_rua,nome_rua,bairro,criado_em,arbo_trechos(id_trecho,quadra,num_inicio,num_fim,status,arbo_pontos(id_ponto,seq,numeracao,lat,lng,impedimentos,impedimento_outro,especie_plano,especie_sugerida,distancia_anterior_m,obs,status,criado_em,criado_por))&order=criado_em.desc';
  const rua = val('f-rua'), bairro = val('f-bairro');
  if (rua) q += `&nome_rua=ilike.*${encodeURIComponent(rua)}*`;
  if (bairro) q += `&bairro=ilike.*${encodeURIComponent(bairro)}*`;
  const ruas = await sbSelect('arbo_ruas', q) || [];

  // Coleta todos os id_ponto p/ buscar fotos
  const pts = [];
  ruas.forEach(r => (r.arbo_trechos || []).forEach(t => (t.arbo_pontos || []).forEach(p => pts.push(p))));
  const fotosByPonto = await carregarFotos('arbo_ponto', pts.map(p => p.id_ponto));
  pts.forEach(p => p.fotos = fotosByPonto[p.id_ponto] || []);

  // Filtros locais (status do trecho, só com foto)
  const fStatus = val('f-status'), soFoto = val('f-foto');
  const linhas = [];
  ruas.forEach(r => {
    (r.arbo_trechos || []).forEach(t => {
      if (fStatus && t.status !== fStatus) return;
      const pontos = (t.arbo_pontos || []).slice().sort((a,b)=>(a.seq||0)-(b.seq||0));
      const nFotos = pontos.reduce((s,p)=>s+(p.fotos?.length||0),0);
      if (soFoto === '1' && nFotos === 0) return;
      linhas.push({ rua: r, trecho: t, pontos, nFotos });
    });
  });
  consDados = linhas;
  renderTabelaArbo(linhas);
}

function renderTabelaArbo(linhas) {
  document.getElementById('cons-count').textContent = linhas.length + ' trecho(s)';
  const box = document.getElementById('cons-resultado');
  if (!linhas.length) { box.innerHTML = '<div class="empty">Nenhum resultado com esses filtros.</div>'; return; }
  const rows = linhas.map((l, i) => {
    const faixa = l.trecho.num_inicio && l.trecho.num_fim ? l.trecho.num_inicio + '–' + l.trecho.num_fim : (l.trecho.num_inicio || l.trecho.num_fim || '—');
    return `
    <tr onclick="abrirDetalheArbo(${i})">
      <td data-l="Rua">${escapeHtml(l.rua.nome_rua)}</td>
      <td data-l="Trecho">${l.trecho.quadra ? 'Q ' + escapeHtml(l.trecho.quadra) : 'sem quadra'} · ${escapeHtml(faixa)}</td>
      <td data-l="Bairro">${escapeHtml(l.rua.bairro || '—')}</td>
      <td data-l="Pontos">${l.pontos.length}</td>
      <td data-l="Fotos">${l.nFotos ? `<span class="cons-photo-count">📷 ${l.nFotos}</span>` : '—'}</td>
      <td data-l="Situação">${l.trecho.status === 'encerrado' ? 'Encerrado' : 'Em andamento'}</td>
    </tr>`;
  }).join('');
  box.innerHTML = `<table class="cons-table"><thead><tr>
    <th>Rua</th><th>Trecho</th><th>Bairro</th><th>Pontos</th><th>Fotos</th><th>Situação</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

const IMPED_L = { poste:'Poste', garagem:'Garagem', comercio:'Comércio', guia_rebaixada:'Guia rebaixada', placa:'Placa', esgoto:'Esgoto', hidrante:'Hidrante', outro:'Outro' };

function abrirDetalheArbo(i) {
  const l = consDados[i];
  const faixa = l.trecho.num_inicio && l.trecho.num_fim ? l.trecho.num_inicio + '–' + l.trecho.num_fim : (l.trecho.num_inicio || l.trecho.num_fim || '');
  document.getElementById('drawer-title').textContent = l.rua.nome_rua;
  document.getElementById('drawer-sub').textContent = [l.trecho.quadra ? 'Quadra ' + l.trecho.quadra : 'sem quadra', faixa, l.rua.bairro].filter(Boolean).join(' · ');

  // Monta grupos p/ o lightbox (um grupo por ponto que tem foto)
  lbGroups = l.pontos.filter(p => (p.fotos||[]).length).map(p => ({
    label: 'Ponto ' + (p.seq || '?'),
    sub: [p.numeracao && 'nº ' + p.numeracao, p.especie_plano].filter(Boolean).join(' · '),
    fotos: p.fotos
  }));

  const pontosHtml = l.pontos.map(p => {
    const imp = (p.impedimentos||[]).map(v=>IMPED_L[v]||v).join(', ');
    const det = [p.numeracao && 'nº ' + p.numeracao, p.especie_plano && 'Plano: ' + p.especie_plano,
                 p.especie_sugerida && 'Sugestão: ' + p.especie_sugerida,
                 p.distancia_anterior_m && p.distancia_anterior_m + ' m', imp, p.obs].filter(Boolean).join(' · ');
    const fs = p.fotos || [];
    const gIdx = lbGroups.findIndex(g => g.label === 'Ponto ' + (p.seq || '?'));
    const strip = fs.length ? `<div class="foto-strip">${fs.map((f,fi)=>
      `<img class="foto-thumb" src="${thumbDrive(f.drive_file_id)}" alt="foto" onerror="this.style.opacity=0.25" onclick="lbOpen(${gIdx},${fi})">`).join('')}</div>` : '';
    return `<div class="sub-item">
      <div class="si-t">Ponto ${p.seq || '?'} ${p.status==='planejado'?'<span class="li-quadra" style="background:var(--warning-light);color:var(--warning)">planejado</span>':''}</div>
      <div class="si-s">${escapeHtml(det) || 'sem detalhes'}</div>
      ${p.lat&&p.lng?`<div class="si-s"><a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener">📍 ${(+p.lat).toFixed(5)}, ${(+p.lng).toFixed(5)}</a></div>`:''}
      ${strip}
    </div>`;
  }).join('');

  document.getElementById('drawer-body').innerHTML = `
    <div class="det-row"><span class="dk">Pontos</span><span class="dv">${l.pontos.length}</span></div>
    <div class="det-row"><span class="dk">Fotos</span><span class="dv">${l.nFotos}</span></div>
    <div class="det-row"><span class="dk">Situação</span><span class="dv">${l.trecho.status==='encerrado'?'Encerrado':'Em andamento'}</span></div>
    <div class="det-sec-title">Pontos do trecho</div>
    ${pontosHtml || '<div class="empty">Nenhum ponto lançado.</div>'}`;
  abrirDrawer();
}

/* ---------- JARDINAGEM ---------- */
async function buscarJard() {
  let q = 'select=id_espaco,codigo,nome,tipo,endereco,bairro,lat,lng,obs,criado_em,jard_canteiros(id_canteiro,seq,formato,comp_m,larg_m,diametro_m,vias,area_m2,situacao,itens,obs,jard_especies(especie_texto,qtd_mudas,qtd_caixas,condicao))&order=criado_em.desc';
  const nome = val('f-nome'), bairro = val('f-bairro'), tipo = val('f-tipo');
  if (nome) q += `&or=(nome.ilike.*${encodeURIComponent(nome)}*,codigo.ilike.*${encodeURIComponent(nome)}*)`;
  if (bairro) q += `&bairro=ilike.*${encodeURIComponent(bairro)}*`;
  if (tipo) q += `&tipo=eq.${tipo}`;
  const espacos = await sbSelect('jard_espacos', q) || [];

  const cants = [];
  espacos.forEach(e => (e.jard_canteiros||[]).forEach(c => cants.push(c)));
  const fotosByCant = await carregarFotos('jard_canteiro', cants.map(c => c.id_canteiro));
  // fotos do espaço também
  const fotosByEsp = await carregarFotos('jard_espaco', espacos.map(e => e.id_espaco));
  cants.forEach(c => c.fotos = fotosByCant[c.id_canteiro] || []);
  espacos.forEach(e => e.fotos = fotosByEsp[e.id_espaco] || []);

  const fSit = val('f-situacao');
  const linhas = espacos.map(e => {
    let canteiros = (e.jard_canteiros||[]).slice().sort((a,b)=>(a.seq||0)-(b.seq||0));
    if (fSit) canteiros = canteiros.filter(c => c.situacao === fSit);
    const nFotos = (e.fotos?.length||0) + canteiros.reduce((s,c)=>s+(c.fotos?.length||0),0);
    const areaTot = canteiros.reduce((s,c)=>s+(+c.area_m2||0),0);
    const mudasTot = canteiros.reduce((s,c)=>s+(c.jard_especies||[]).reduce((a,x)=>a+(+x.qtd_mudas||0),0),0);
    return { espaco: e, canteiros, nFotos, areaTot, mudasTot };
  }).filter(l => !fSit || l.canteiros.length);
  consDados = linhas;
  renderTabelaJard(linhas);
}

const TIPO_L2 = { praca:'Praça', rotatoria:'Rotatória', canteiro_rua:'Canteiro de rua', floreira:'Floreira', jardim:'Jardim', outro:'Outro' };

function renderTabelaJard(linhas) {
  document.getElementById('cons-count').textContent = linhas.length + ' espaço(s)';
  const box = document.getElementById('cons-resultado');
  if (!linhas.length) { box.innerHTML = '<div class="empty">Nenhum resultado com esses filtros.</div>'; return; }
  const rows = linhas.map((l,i) => `
    <tr onclick="abrirDetalheJard(${i})">
      <td data-l="Espaço">${escapeHtml(l.espaco.nome)}</td>
      <td data-l="Código">${escapeHtml(l.espaco.codigo || '—')}</td>
      <td data-l="Tipo">${TIPO_L2[l.espaco.tipo]||l.espaco.tipo||'—'}</td>
      <td data-l="Bairro">${escapeHtml(l.espaco.bairro || '—')}</td>
      <td data-l="Canteiros">${l.canteiros.length}</td>
      <td data-l="Área">${l.areaTot ? l.areaTot.toFixed(1).replace('.',',')+' m²' : '—'}</td>
      <td data-l="Fotos">${l.nFotos ? `<span class="cons-photo-count">📷 ${l.nFotos}</span>` : '—'}</td>
    </tr>`).join('');
  box.innerHTML = `<table class="cons-table"><thead><tr>
    <th>Espaço</th><th>Código</th><th>Tipo</th><th>Bairro</th><th>Canteiros</th><th>Área total</th><th>Fotos</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function abrirDetalheJard(i) {
  const l = consDados[i];
  document.getElementById('drawer-title').textContent = l.espaco.nome;
  document.getElementById('drawer-sub').textContent = [l.espaco.codigo, TIPO_L2[l.espaco.tipo]||l.espaco.tipo, l.espaco.bairro].filter(Boolean).join(' · ');

  lbGroups = [];
  if ((l.espaco.fotos||[]).length) lbGroups.push({ label: 'Espaço', sub: l.espaco.nome, fotos: l.espaco.fotos });
  l.canteiros.forEach(c => { if ((c.fotos||[]).length) lbGroups.push({ label: 'Canteiro ' + (c.seq||'?'), sub: FORMATO_L[c.formato]||c.formato||'', fotos: c.fotos }); });

  const espFotos = (l.espaco.fotos||[]);
  const gEsp = lbGroups.findIndex(g => g.label === 'Espaço');
  const espStrip = espFotos.length ? `<div class="foto-strip">${espFotos.map((f,fi)=>
    `<img class="foto-thumb" src="${thumbDrive(f.drive_file_id)}" onerror="this.style.opacity=0.25" onclick="lbOpen(${gEsp},${fi})">`).join('')}</div>` : '';

  const cantHtml = l.canteiros.map(c => {
    const esp = (c.jard_especies||[]).map(s=>`${s.especie_texto||''} ${s.qtd_mudas?'×'+s.qtd_mudas:''}${s.qtd_caixas?' ('+s.qtd_caixas+'cx)':''}`).filter(x=>x.trim()).join(', ');
    const dim = c.formato==='circular' ? `⌀ ${c.diametro_m||'?'} m` : c.formato==='retangular' ? `${c.comp_m||'?'}×${c.larg_m||'?'} m` : 'área livre';
    const det = [dim, c.vias>1&&c.vias+' vias', c.area_m2&&(+c.area_m2).toFixed(1).replace('.',',')+' m²', c.situacao, esp, c.obs].filter(Boolean).join(' · ');
    const fs = c.fotos||[];
    const gIdx = lbGroups.findIndex(g => g.label === 'Canteiro ' + (c.seq||'?'));
    const strip = fs.length ? `<div class="foto-strip">${fs.map((f,fi)=>
      `<img class="foto-thumb" src="${thumbDrive(f.drive_file_id)}" onerror="this.style.opacity=0.25" onclick="lbOpen(${gIdx},${fi})">`).join('')}</div>` : '';
    return `<div class="sub-item">
      <div class="si-t">Canteiro ${c.seq||'?'} — ${FORMATO_L[c.formato]||c.formato||''}</div>
      <div class="si-s">${escapeHtml(det)||'sem detalhes'}</div>${strip}</div>`;
  }).join('');

  document.getElementById('drawer-body').innerHTML = `
    <div class="det-row"><span class="dk">Endereço</span><span class="dv">${escapeHtml(l.espaco.endereco||'—')}</span></div>
    <div class="det-row"><span class="dk">Canteiros</span><span class="dv">${l.canteiros.length}</span></div>
    <div class="det-row"><span class="dk">Área total</span><span class="dv">${l.areaTot?l.areaTot.toFixed(1).replace('.',',')+' m²':'—'}</span></div>
    <div class="det-row"><span class="dk">Mudas (soma)</span><span class="dv">${l.mudasTot||0}</span></div>
    ${l.espaco.lat&&l.espaco.lng?`<div class="det-row"><span class="dk">GPS</span><span class="dv"><a href="https://www.google.com/maps?q=${l.espaco.lat},${l.espaco.lng}" target="_blank" rel="noopener">📍 abrir</a></span></div>`:''}
    ${espStrip?`<div class="det-sec-title">Fotos do espaço</div>${espStrip}`:''}
    <div class="det-sec-title">Canteiros</div>
    ${cantHtml || '<div class="empty">Nenhum canteiro.</div>'}`;
  abrirDrawer();
}

