/** ================================================================
 * SMMACL Campo → Planilha Google (dashboard)
 * ----------------------------------------------------------------
 * Lê o banco (Supabase) e monta 3 abas:
 *   📊 Dashboard  — indicadores + progresso por rua (com gráfico)
 *   🌳 Pontos     — todos os pontos de arborização, com fotos na célula
 *   🌼 Jardinagem — espaços e canteiros, com fotos na célula
 *
 * COMO INSTALAR (uma vez):
 * 1. Na planilha: Extensões → Apps Script → apague o conteúdo e cole este arquivo.
 * 2. À esquerda, em ⚙️ Configurações do projeto → Propriedades do script,
 *    crie a propriedade:  SB_SERVICE_KEY  = (chave "service_role" do Supabase,
 *    em Project Settings → API Keys — NUNCA coloque essa chave numa célula).
 * 3. No editor, rode a função  atualizarTudo  e autorize.
 * 4. (Opcional) Rode  criarGatilhoHorario  para atualizar sozinho a cada hora.
 * Depois disso, aparece o menu "🌳 SMMACL" na planilha com "Atualizar agora".
 * ================================================================ */

const SB_URL = 'https://bsgkloaziukpjjzxxeja.supabase.co';

const CORES = {
  verde: '#1E8659', ambar: '#B07222', azul: '#2C5D9E',
  verdeEscuro: '#1F4A2B', verdeClaro: '#E3F0E5', cinza: '#55645B', trilha: '#E9EEE7'
};

/* ── acesso ao banco ─────────────────────────────────────────── */
function sbKey_() {
  const k = PropertiesService.getScriptProperties().getProperty('SB_SERVICE_KEY');
  if (!k) throw new Error('Configure a propriedade SB_SERVICE_KEY (⚙️ Configurações do projeto → Propriedades do script).');
  return k;
}

function sbGet_(pathEQuery) {
  const r = UrlFetchApp.fetch(SB_URL + '/rest/v1/' + pathEQuery, {
    headers: { apikey: sbKey_(), Authorization: 'Bearer ' + sbKey_() },
    muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 300) throw new Error('Supabase HTTP ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText() || '[]');
}

/* URL exibível da foto (Storage novo = URL direta; Drive antigo = thumbnail) */
function fotoUrl_(v) {
  return /^https?:\/\//.test(v) ? v
    : 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(v) + '&sz=w400';
}

/* ── principal ───────────────────────────────────────────────── */
function atualizarTudo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const ruas = sbGet_('arbo_ruas?select=id_rua,nome_rua,bairro,arbo_trechos(id_trecho,quadra,num_inicio,num_fim,status,arbo_pontos(id_ponto,seq,numeracao,lat,lng,especie_plano,especie_sugerida,impedimentos,obs,status,criado_em,criado_por))&order=nome_rua.asc');
  const espacos = sbGet_('jard_espacos?select=id_espaco,codigo,nome,tipo,endereco,bairro,lat,lng,obs,jard_canteiros(id_canteiro,seq,formato,area_m2,situacao,jard_especies(especie_texto,qtd_mudas))&order=nome.asc');
  const fotos = sbGet_('fotos?select=entidade,id_entidade,drive_file_id');

  const fotosPor = {};
  fotos.forEach(function (f) {
    const k = f.entidade + '|' + f.id_entidade;
    (fotosPor[k] = fotosPor[k] || []).push(fotoUrl_(f.drive_file_id));
  });

  const abaPontos = montarPontos_(ss, ruas, fotosPor);
  const abaJard = montarJard_(ss, espacos, fotosPor);
  montarDashboard_(ss, ruas, espacos, fotos.length);

  ss.toast('Atualizado: ' + abaPontos + ' ponto(s), ' + abaJard + ' espaço(s).', '🌳 SMMACL', 6);
}

/* ── aba 🌳 Pontos ───────────────────────────────────────────── */
function montarPontos_(ss, ruas, fotosPor) {
  const sh = aba_(ss, '🌳 Pontos');
  const head = ['Rua', 'Bairro', 'Quadra', 'Ponto', 'Numeração', 'Situação',
    'Espécie do plano', 'Sugestão da equipe', 'Impedimentos', 'Obs',
    'GPS', 'Foto 1', 'Foto 2', 'Foto 3'];
  const rows = [];
  ruas.forEach(function (r) {
    (r.arbo_trechos || []).forEach(function (t) {
      (t.arbo_pontos || []).sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); })
        .forEach(function (p) {
          const fs = fotosPor['arbo_ponto|' + p.id_ponto] || [];
          rows.push([
            r.nome_rua || '', r.bairro || '', t.quadra || '',
            'P' + (p.seq || '?'), p.numeracao || '',
            p.status === 'planejado' ? '⏳ a coletar' : '✓ coletado',
            p.especie_plano || '', p.especie_sugerida || '',
            (p.impedimentos || []).join(', '), p.obs || '',
            (p.lat && p.lng)
              ? '=HYPERLINK("https://www.google.com/maps?q=' + p.lat + ',' + p.lng + '";"📍 mapa")' : '',
            fs[0] ? '=IMAGE("' + fs[0] + '")' : '',
            fs[1] ? '=IMAGE("' + fs[1] + '")' : '',
            fs[2] ? '=IMAGE("' + fs[2] + '")' : ''
          ]);
        });
    });
  });
  escrever_(sh, head, rows);
  if (rows.length) {
    sh.setRowHeights(2, rows.length, 80);               // altura p/ as fotos
    sh.setColumnWidths(12, 3, 110);                     // colunas de foto
  }
  return rows.length;
}

/* ── aba 🌼 Jardinagem ───────────────────────────────────────── */
function montarJard_(ss, espacos, fotosPor) {
  const sh = aba_(ss, '🌼 Jardinagem');
  const TIPO = { praca: 'Praça', rotatoria: 'Rotatória', canteiro_rua: 'Canteiro de rua', floreira: 'Floreira', jardim: 'Jardim', outro: 'Outro' };
  const head = ['Espaço', 'Código', 'Tipo', 'Endereço', 'Bairro',
    'Canteiros', 'Área (m²)', 'Mudas', 'GPS', 'Foto 1', 'Foto 2', 'Foto 3'];
  const rows = espacos.map(function (e) {
    const cs = e.jard_canteiros || [];
    const area = cs.reduce(function (s, c) { return s + (Number(c.area_m2) || 0); }, 0);
    const mudas = cs.reduce(function (s, c) {
      return s + (c.jard_especies || []).reduce(function (a, x) { return a + (Number(x.qtd_mudas) || 0); }, 0);
    }, 0);
    let fs = fotosPor['jard_espaco|' + e.id_espaco] || [];
    cs.forEach(function (c) { fs = fs.concat(fotosPor['jard_canteiro|' + c.id_canteiro] || []); });
    return [
      e.nome || '', e.codigo || '', TIPO[e.tipo] || e.tipo || '',
      e.endereco || '', e.bairro || '', cs.length,
      area ? Number(area.toFixed(1)) : '', mudas || '',
      (e.lat && e.lng)
        ? '=HYPERLINK("https://www.google.com/maps?q=' + e.lat + ',' + e.lng + '";"📍 mapa")' : '',
      fs[0] ? '=IMAGE("' + fs[0] + '")' : '',
      fs[1] ? '=IMAGE("' + fs[1] + '")' : '',
      fs[2] ? '=IMAGE("' + fs[2] + '")' : ''
    ];
  });
  escrever_(sh, head, rows);
  if (rows.length) {
    sh.setRowHeights(2, rows.length, 80);
    sh.setColumnWidths(10, 3, 110);
  }
  return rows.length;
}

/* ── aba 📊 Dashboard ────────────────────────────────────────── */
function montarDashboard_(ss, ruas, espacos, nFotos) {
  const sh = aba_(ss, '📊 Dashboard');

  let total = 0, feitos = 0, nTrechos = 0;
  const porRua = [];
  ruas.forEach(function (r) {
    let t = 0, f = 0;
    (r.arbo_trechos || []).forEach(function (tr) {
      nTrechos++;
      (tr.arbo_pontos || []).forEach(function (p) { t++; if (p.status !== 'planejado') f++; });
    });
    total += t; feitos += f;
    if (t) porRua.push([r.nome_rua, f, t - f, Math.round(f / t * 100) / 100]);
  });
  porRua.sort(function (a, b) { return b[2] - a[2] || b[1] + b[2] - (a[1] + a[2]); });

  let cants = 0, area = 0, mudas = 0;
  espacos.forEach(function (e) {
    (e.jard_canteiros || []).forEach(function (c) {
      cants++; area += Number(c.area_m2) || 0;
      (c.jard_especies || []).forEach(function (x) { mudas += Number(x.qtd_mudas) || 0; });
    });
  });
  const pct = total ? feitos / total : 0;

  // KPIs (linhas 1–3)
  sh.getRange(1, 1).setValue('Painel SMMACL Campo — atualizado em ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontWeight('bold').setFontSize(14).setFontColor(CORES.verdeEscuro);

  const kpis = [
    ['Progresso do plantio', 'Pontos', '✓ Coletados', '⏳ A coletar', 'Ruas', 'Trechos', 'Espaços jardim', 'Canteiros', 'Área (m²)', 'Mudas', 'Fotos'],
    [pct, total, feitos, total - feitos, ruas.length, nTrechos, espacos.length, cants, Number(area.toFixed(1)), mudas, nFotos]
  ];
  sh.getRange(2, 1, 2, kpis[0].length).setValues(kpis);
  sh.getRange(2, 1, 1, kpis[0].length).setFontWeight('bold').setFontColor(CORES.cinza).setFontSize(9);
  sh.getRange(3, 1, 1, kpis[0].length).setFontWeight('bold').setFontSize(16);
  sh.getRange(3, 1).setNumberFormat('0%').setFontColor(CORES.verde);

  // Tabela: progresso por rua (linha 6 em diante)
  sh.getRange(5, 1).setValue('Progresso por rua (mais pendências primeiro)')
    .setFontWeight('bold').setFontColor(CORES.verdeEscuro);
  const headR = [['Rua', 'Coletados', 'A coletar', '% feito']];
  sh.getRange(6, 1, 1, 4).setValues(headR).setFontWeight('bold').setBackground(CORES.verdeClaro);
  if (porRua.length) {
    sh.getRange(7, 1, porRua.length, 4).setValues(porRua);
    sh.getRange(7, 4, porRua.length, 1).setNumberFormat('0%');
  }

  // Gráfico de barras empilhadas (coletados x a coletar)
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  if (porRua.length) {
    const chart = sh.newChart().asColumnChart()
      .addRange(sh.getRange(6, 1, Math.min(porRua.length, 12) + 1, 3))
      .setStacked()
      .setOption('colors', [CORES.verde, CORES.ambar])
      .setOption('title', 'Coletados × a coletar, por rua')
      .setOption('legend', { position: 'top' })
      .setPosition(6, 6, 0, 0)
      .setOption('width', 640).setOption('height', 360)
      .build();
    sh.insertChart(chart);
  }
  sh.setFrozenRows(0);
  sh.autoResizeColumns(1, 11);
}

/* ── util ────────────────────────────────────────────────────── */
function aba_(ss, nome) {
  let sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);
  sh.clear();
  return sh;
}

function escrever_(sh, head, rows) {
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground(CORES.verdeClaro).setFontColor(CORES.verdeEscuro);
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, Math.min(head.length, 11));
}

/* ── menu e gatilho ──────────────────────────────────────────── */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌳 SMMACL')
    .addItem('↻ Atualizar agora', 'atualizarTudo')
    .addItem('⏰ Atualizar a cada hora (ligar)', 'criarGatilhoHorario')
    .addItem('🛑 Desligar atualização automática', 'removerGatilhos')
    .addToUi();
}

function criarGatilhoHorario() {
  removerGatilhos();
  ScriptApp.newTrigger('atualizarTudo').timeBased().everyHours(1).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Atualização automática ligada (a cada hora).', '🌳 SMMACL', 5);
}

function removerGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'atualizarTudo') ScriptApp.deleteTrigger(t);
  });
}
