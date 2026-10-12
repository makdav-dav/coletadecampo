/* ================================================================
   PDF DA OS EMERGENCIAL — gerado no próprio aparelho (jsPDF), no
   papel timbrado do modelo oficial de OS da Prefeitura (repo
   emitir-os, "04-26 - Ordem_de_Serviço-Praça da Polônia.docx"):
   A4, faixa com brasão no topo, rodapé com endereço, tabelas.
   Bibliotecas em js/vendor (carregadas só quando precisa).
   ================================================================ */

// Dados fixos do modelo oficial — ajuste aqui quando mudar contrato/empresa/diretoria
const OS_DOC = {
  contrato: 'CONTRATO n° 134/2026',
  empresa: 'Ecosystem Serviços Urbanos Ltda.',
  diretora: 'Deborah N. S. de Araujo Macarini',
  cargo: ['Diretora do Departamento de Produção Vegetal e Arborização', 'Secretaria Municipal de Meio Ambiente'],
  rodape: ['Av. Padre Natal Pigato, 989 · CEP 83601-630 · Campo Largo – Paraná · Tel. (41) 291-5000 · Fax (41) 3291-5195', 'www.campolargo.pr.gov.br']
};

const _scripts = {};
function carregarScript(src) {
  if (!_scripts[src]) _scripts[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => { delete _scripts[src]; rej(new Error('Não carregou ' + src)); };
    document.head.appendChild(s);
  });
  return _scripts[src];
}
async function carregarLibsPdf() {
  await carregarScript('js/vendor/jspdf.umd.min.js');
  await carregarScript('js/vendor/jspdf.plugin.autotable.min.js');
}

/* WGS84 → UTM (o modelo oficial usa coordenadas UTM) */
function utmOS(lat, lon) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const zona = Math.floor((lon + 180) / 6) + 1;
  const l0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180;
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2), T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = Math.cos(p) * (l - l0);
  const e4 = e2 * e2, e6 = e4 * e2;
  const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let y = k0 * (M + N * Math.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) y += 10000000;
  return { x: Math.round(x), y: Math.round(y), zona };
}

/* Blob ou URL → { data: dataURL, w, h } */
async function imagemParaPdf(src) {
  const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
  const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  const dim = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = data; });
  return { data, ...dim };
}

const MESES_OS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function fmtDataHoraCurta(iso) { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return '—'; } }

function nomeArquivoPdfOS(r) {
  return 'OS_Emergencial_' + (r.numero ? r.numero + '-' + new Date(r.aberto_em || r.criado_em).getFullYear() : r.id_os.slice(0, 8)) + '.pdf';
}

/* r = linha de os_emergencial; fotos = { antes: [Blob|url], depois: [Blob|url] } → Blob PDF */
async function gerarPdfOS(r, fotos) {
  await carregarLibsPdf();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, ML = 27, MR = 29, TOPO = 76, BASE = 24, CW = W - ML - MR;
  const PT = 0.3528;   // mm por ponto
  let y = TOPO;

  const garante = h => { if (y + h > H - BASE) { doc.addPage(); y = TOPO; } };
  const fonte = (tam, negrito) => { doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(tam); };
  const centro = (txt, tam, negrito, depois) => {
    fonte(tam, negrito);
    const linhas = doc.splitTextToSize(txt, CW), lh = tam * PT * 1.3;
    garante(linhas.length * lh);
    linhas.forEach(l => { y += lh; doc.text(l, W / 2, y - lh * 0.25, { align: 'center' }); });
    y += depois || 0;
  };
  const paragrafo = txt => {
    fonte(11, false);
    const lh = 11 * PT * 1.4, linhas = doc.splitTextToSize(txt, CW);
    garante(linhas.length * lh);
    doc.text(txt, ML, y + lh * 0.75, { maxWidth: CW, align: 'justify', lineHeightFactor: 1.4 });
    y += linhas.length * lh + 3;
  };
  const tabela = (titulo, linhas) => {
    garante(22);   // título nunca fica sozinho no pé da página
    centro(titulo.toUpperCase(), 11, true, 1.5);
    doc.autoTable({
      startY: y, theme: 'grid', body: linhas,
      margin: { left: ML, right: MR, top: TOPO, bottom: BASE },
      styles: { font: 'helvetica', fontSize: 10, textColor: 0, lineColor: 0, lineWidth: 0.25, cellPadding: 1.8, valign: 'top' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: CW * 0.34 } },
      rowPageBreak: 'avoid'
    });
    y = doc.lastAutoTable.finalY + 5;
  };
  const sn = v => v ? 'SIM' : 'Não';

  // ── cabeçalho
  centro('SECRETARIA MUNICIPAL DE MEIO AMBIENTE', 14, true);
  centro('SUPERINTENDÊNCIA DE PRESERVAÇÃO E SUSTENTABILIDADE AMBIENTAL', 10, true);
  centro('DEPARTAMENTO DE PRODUÇÃO VEGETAL E ARBORIZAÇÃO', 10, true);
  centro('DIVISÃO DO HORTO MUNICIPAL', 10, true, 5);
  centro(OS_DOC.contrato, 11, false);
  centro('ORDEM DE SERVIÇO EMERGENCIAL ' + (numOS(r) || '(nº a definir)'), 11, true);
  centro('À ' + OS_DOC.empresa, 11, false, 5);
  paragrafo('O Município de Campo Largo, através da Secretaria Municipal de Meio Ambiente de Campo Largo (SMMA-CL), por meio do Departamento de Produção Vegetal e Arborização, manifesta-se através da presente ORDEM DE SERVIÇO EMERGENCIAL, solicitando o atendimento imediato da ocorrência descrita abaixo, fora do horário comercial, para desobstrução da via e garantia da segurança da população.');
  paragrafo('A empresa deverá informar quanto ao cumprimento da presente Ordem de Serviço para a fiscalização do serviço realizado, com o consequente atestado pelo(a) fiscal de contrato. Conforme especificado abaixo:');

  // ── seções
  let coord = '—';
  if (r.lat != null && r.lng != null) {
    const u = utmOS(+r.lat, +r.lng);
    coord = `Long.: ${u.x}\nLat.: ${u.y}\n(UTM ${u.zona}S · ${(+r.lat).toFixed(6)}, ${(+r.lng).toFixed(6)})`;
  }
  const situacao = [...(r.situacao || [])];
  if (r.risco_rede) situacao.push('Rede elétrica envolvida');

  tabela('Acionamento', [
    ['DATA/HORA DO ACIONAMENTO', fmtDataHoraCurta(r.aberto_em)],
    ['QUEM ACIONOU', r.quem_acionou || '—']
  ]);
  tabela('Ocorrência', [
    ['LOCAL', r.endereco || '—'],
    ['COORDENADAS (UTM)', coord],
    ['DESCRIÇÃO', r.descricao || '—'],
    ['SITUAÇÃO', situacao.length ? situacao.join('; ') : '—'],
    ['RISCO', `Vítimas: ${sn(r.risco_vitimas)}  ·  Trânsito: ${sn(r.risco_transito)}  ·  Fios energizados: ${sn(r.risco_rede)}`]
  ]);
  if (r.risco_rede) { y -= 2; paragrafo('ATENÇÃO: com rede elétrica envolvida a equipe NÃO deve atuar antes do desligamento pela concessionária (Copel).'); }
  tabela('Atendimento', [
    ['EQUIPE / RESPONSÁVEL', r.equipe_responsavel || '—'],
    ['EQUIPAMENTOS', r.equipamentos || '—'],
    ['HORA DE CONCLUSÃO', r.concluido_em ? fmtDataHoraCurta(r.concluido_em) : '—']
  ]);
  tabela('Execução', [
    ['SERVIÇO REALIZADO', r.obs_conclusao || '—'],
    ['PENDÊNCIAS', r.pendencias || '—']
  ]);

  // ── fotos (3 por linha, sem distorcer)
  const gap = 4, cw = (CW - 2 * gap) / 3, ch = cw * 0.75;
  for (const [titulo, lista] of [['Registro fotográfico — antes', fotos.antes || []], ['Registro fotográfico — depois', fotos.depois || []]]) {
    if (!lista.length) continue;
    garante(8 + ch);
    fonte(10, true); doc.text(titulo, ML, y + 4); y += 6;
    for (let i = 0; i < lista.length; i++) {
      if (i % 3 === 0) { if (i) y += ch + gap; garante(ch); }
      let im;
      try { im = await imagemParaPdf(lista[i]); } catch (e) { continue; }
      const k = Math.min(cw / im.w, ch / im.h), w = im.w * k, h = im.h * k;
      const x = ML + (i % 3) * (cw + gap) + (cw - w) / 2, yy = y + (ch - h) / 2;
      doc.addImage(im.data, 'JPEG', x, yy, w, h);
      doc.setLineWidth(0.2); doc.rect(x, yy, w, h);
    }
    y += ch + 6;
  }

  // ── local/data e assinaturas
  garante(48);
  const d = r.concluido_em ? new Date(r.concluido_em) : new Date(r.aberto_em || Date.now());
  centro(`Campo Largo, ${String(d.getDate()).padStart(2, '0')} de ${MESES_OS[d.getMonth()]} de ${d.getFullYear()}`, 11, false, 16);
  const colW = CW / 2 - 6;
  [[ML, [r.equipe_responsavel || 'Responsável da equipe', OS_DOC.empresa]],
   [ML + CW / 2 + 6, [OS_DOC.diretora, ...OS_DOC.cargo]]].forEach(([x, linhas]) => {
    doc.setLineWidth(0.3); doc.line(x, y, x + colW, y);
    fonte(10, false);
    let yy = y + 4.5;
    linhas.forEach(t => doc.splitTextToSize(t, colW).forEach(l => { doc.text(l, x + colW / 2, yy, { align: 'center' }); yy += 4.3; }));
  });

  // ── faixa timbrada e rodapé em todas as páginas
  const timbre = await imagemParaPdf('timbre-campo-largo.jpg');
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.addImage(timbre.data, 'JPEG', 0, 0, W, W * timbre.h / timbre.w);
    doc.setLineWidth(0.3); doc.line(ML, H - 17, W - MR, H - 17);
    fonte(7, false);
    OS_DOC.rodape.forEach((t, j) => doc.text(t, W / 2, H - 13 + j * 3.2, { align: 'center' }));
    if (n > 1) doc.text(`${i}/${n}`, W - MR, H - 6.5, { align: 'right' });
  }
  return doc.output('blob');
}
