/* ================================================================
   MÓDULO IMPORTAÇÃO (fase 3) — planilha CSV → pontos planejados
   ================================================================ */
const IMP_COLS = ['rua','bairro','quadra','num_inicio','num_fim','ordem','numeracao','especie_plano','distancia_anterior_m','obs'];
let impPend = null;   // { grupos } aguardando confirmação

function baixarModeloCSV() {
  const exemplo = [
    IMP_COLS,
    ['Rua Barão do Rio Branco','Centro','12','1973','1577','1','1899','Quaresmeira','','tirar a existente'],
    ['Rua Barão do Rio Branco','Centro','12','1973','1577','2','1850','Quaresmeira','8',''],
    ['Rua Barão do Rio Branco','Centro','14','1575','1301','1','1560','Ipê-amarelo','',''],
    ['Rua Saldanha Marinho','Centro','','','','1','','Jacarandá','','rua curta, sem quadra']
  ];
  baixarCSV('modelo_importacao_arborizacao.csv', exemplo);
  showToast('Modelo baixado. Preencha uma linha por ponto.', 'success');
}

/* Parser CSV: detecta ; ou , e respeita aspas */
function parseCSV(texto) {
  texto = texto.replace(/^\ufeff/, '');
  const primeira = texto.split(/\r?\n/)[0] || '';
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let linha = [], campo = '', dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (dentro) {
      if (ch === '"') { if (texto[i+1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += ch;
    } else if (ch === '"') dentro = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i+1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(c => c.trim() !== '')) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); if (linha.some(c => c.trim() !== '')) linhas.push(linha); }
  return linhas;
}

function normalizarHeader(h) {
  return h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function importarCSV(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  let texto;
  try { texto = await file.text(); } catch(e) { return showToast('Não consegui ler o arquivo.', 'error'); }
  processarImportCSV(texto);
}

function processarImportCSV(texto) {
  const linhas = parseCSV(texto);
  if (linhas.length < 2) return showToast('Planilha vazia ou sem linhas de dados.', 'error');

  const headers = linhas[0].map(normalizarHeader);
  const idx = {};
  IMP_COLS.forEach(c => idx[c] = headers.indexOf(c));
  if (idx.rua === -1) return showToast('Coluna obrigatória "rua" não encontrada. Baixe o modelo.', 'error');

  const erros = [];
  const pontos = [];
  for (let n = 1; n < linhas.length; n++) {
    const l = linhas[n];
    const get = c => idx[c] >= 0 ? (l[idx[c]] || '').trim() : '';
    const rua = get('rua');
    if (!rua) { erros.push(`Linha ${n+1}: rua vazia`); continue; }
    const dist = get('distancia_anterior_m');
    if (dist && isNaN(parseFloat(dist.replace(',','.')))) { erros.push(`Linha ${n+1}: distância "${dist}" não é número`); continue; }
    const ordem = get('ordem');
    if (ordem && isNaN(parseInt(ordem, 10))) { erros.push(`Linha ${n+1}: ordem "${ordem}" não é número`); continue; }
    pontos.push({
      rua, bairro: get('bairro'), quadra: get('quadra'),
      num_inicio: get('num_inicio'), num_fim: get('num_fim'),
      ordem: ordem ? parseInt(ordem, 10) : null,
      numeracao: get('numeracao'), especie_plano: get('especie_plano'),
      distancia_anterior_m: dist ? parseFloat(dist.replace(',','.')) : null,
      obs: get('obs')
    });
  }

  // Agrupa: rua+bairro → trechos (quadra+faixa) → pontos ordenados
  const grupos = {};
  pontos.forEach(pt => {
    const kR = pt.rua.toLowerCase() + '|' + pt.bairro.toLowerCase();
    grupos[kR] = grupos[kR] || { rua: pt.rua, bairro: pt.bairro, trechos: {} };
    const kT = [pt.quadra, pt.num_inicio, pt.num_fim].join('|');
    const g = grupos[kR].trechos;
    g[kT] = g[kT] || { quadra: pt.quadra || null, num_inicio: pt.num_inicio || null, num_fim: pt.num_fim || null, pontos: [] };
    g[kT].pontos.push(pt);
  });
  Object.values(grupos).forEach(r => Object.values(r.trechos).forEach(t =>
    t.pontos.sort((a,b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9))));

  impPend = { grupos };
  const nRuas = Object.keys(grupos).length;
  const nTrechos = Object.values(grupos).reduce((s,r) => s + Object.keys(r.trechos).length, 0);

  const el = document.getElementById('imp-preview');
  el.style.display = 'block';
  el.innerHTML = `
    <div class="action-title">Prévia da importação</div>
    <div class="det-row"><span class="dk">Pontos válidos</span><span class="dv">${pontos.length}</span></div>
    <div class="det-row"><span class="dk">Ruas</span><span class="dv">${nRuas}</span></div>
    <div class="det-row"><span class="dk">Trechos</span><span class="dv">${nTrechos}</span></div>
    <div class="det-row"><span class="dk">Linhas com erro</span><span class="dv" style="color:${erros.length?'var(--danger)':'inherit'}">${erros.length}</span></div>
    ${erros.length ? `<div class="page-sub" style="margin-top:8px; color:var(--danger)">${erros.slice(0,8).map(escapeHtml).join('<br>')}${erros.length>8?'<br>… e mais '+(erros.length-8):''}</div>` : ''}
    <div class="page-sub" style="margin-top:8px">Ruas com mesmo nome já cadastradas serão reaproveitadas; os pontos entram como <b>planejados</b> para a equipe coletar em campo.</div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn btn-primary" onclick="confirmarImport()" ${pontos.length?'':'disabled'}>Importar ${pontos.length} ponto(s)</button>
      <button class="btn btn-sm" onclick="cancelarImport()">Cancelar</button>
    </div>`;
  el.scrollIntoView({ behavior: 'smooth' });
}

function cancelarImport() {
  impPend = null;
  const el = document.getElementById('imp-preview');
  el.style.display = 'none'; el.innerHTML = '';
}

async function confirmarImport() {
  if (!impPend) return;
  const { grupos } = impPend;

  // Ruas existentes: tenta servidor, cai pro cache
  let existentes = [];
  if (sessionValida() && navigator.onLine) {
    try { existentes = await sbSelect('arbo_ruas', 'select=id_rua,nome_rua,bairro&limit=500') || []; } catch(e) {}
  }
  if (!existentes.length) existentes = cacheRuas();
  const porNome = {};
  existentes.forEach(r => porNome[(r.nome_rua||'').toLowerCase().trim()] = r);

  let cRuas = 0, cTrechos = 0, cPontos = 0;
  const cache = cacheRuas();

  for (const g of Object.values(grupos)) {
    let rua = porNome[g.rua.toLowerCase().trim()];
    if (!rua) {
      rua = { id_rua: uuid(), nome_rua: g.rua, bairro: g.bairro || null, obs: null, criado_em: agora(), criado_por: userEmail };
      await enqueue({ tipo: 'insert', tabela: 'arbo_ruas', dados: rua });
      porNome[g.rua.toLowerCase().trim()] = rua;
      cache.unshift({ ...rua, trechos: 0 });
      cRuas++;
    }
    for (const t of Object.values(g.trechos)) {
      const trecho = {
        id_trecho: uuid(), id_rua: rua.id_rua,
        quadra: t.quadra, num_inicio: t.num_inicio, num_fim: t.num_fim,
        status: 'em_andamento', obs: null, criado_em: agora(), criado_por: userEmail
      };
      await enqueue({ tipo: 'insert', tabela: 'arbo_trechos', dados: trecho });
      cTrechos++;
      const ct = cacheTrechos(rua.id_rua);
      ct.unshift({ ...trecho, pontos: t.pontos.length });
      setCacheTrechos(rua.id_rua, ct);
      const ic = cache.findIndex(x => x.id_rua === rua.id_rua);
      if (ic >= 0) cache[ic] = { ...cache[ic], trechos: (cache[ic].trechos || 0) + 1 };

      let seq = 0;
      for (const pt of t.pontos) {
        seq++;
        await enqueue({ tipo: 'insert', tabela: 'arbo_pontos', dados: {
          id_ponto: uuid(), id_trecho: trecho.id_trecho, seq,
          numeracao: pt.numeracao || null, lat: null, lng: null, precisao_m: null,
          impedimentos: [], impedimento_outro: null,
          especie_plano: pt.especie_plano || null, especie_sugerida: null,
          distancia_anterior_m: pt.distancia_anterior_m, obs: pt.obs || null,
          status: 'planejado', criado_em: agora(), criado_por: userEmail
        }});
        cPontos++;
      }
    }
  }
  LS.set('cache_ruas', JSON.stringify(cache.slice(0, 120)));
  cancelarImport();
  renderArboLista();
  showToast(`Importado: ${cPontos} ponto(s), ${cTrechos} trecho(s), ${cRuas} rua(s) nova(s).`, 'success');
}

