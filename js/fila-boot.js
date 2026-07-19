/* ================================================================
   FILA (tela)
   ================================================================ */
const ROTULO_TIPO = { insert: 'Registro', update: 'Atualização', delete: 'Exclusão', foto: 'Foto' };

async function limparErrosFila() {
  const erros = (await idbAll('fila')).filter(it => it.status === 'erro');
  if (!erros.length) return showToast('Não há registros com erro.', 'info');
  if (!confirm(`Remover ${erros.length} registro(s) com erro da fila?\n\nOs dados que não sincronizaram serão descartados.`)) return;
  for (const it of erros) {
    if (it.tipo === 'foto' && it.blobId) { try { await idbDel('blobs', it.blobId); } catch(_) {} }
    await idbDel('fila', it.id);
  }
  atualizarBadgeFila();
  renderFila();
  showToast(`${erros.length} registro(s) removido(s) da fila.`, 'success');
}

async function renderFila() {
  const itens = (await idbAll('fila')).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  const el = document.getElementById('fila-lista');
  document.getElementById('fila-sub').textContent = itens.length
    ? itens.length + ' registro(s) na fila.'
    : 'Tudo sincronizado.';
  if (!itens.length) { el.innerHTML = '<div class="empty">Nada pendente. Todos os registros já estão no BigQuery.</div>'; return; }
  el.innerHTML = itens.map(it => `
    <div class="list-item" style="cursor:default">
      <div>
        <div class="li-title">${ROTULO_TIPO[it.tipo] || it.tipo}${it.tabela ? ' · ' + it.tabela : ''}${it.entidade ? ' · ' + it.entidade : ''}</div>
        <div class="li-sub">${new Date(it.criado_em).toLocaleString('pt-BR')}${it.erro ? ' — ' + escapeHtml(it.erro) : ''}</div>
      </div>
      <span class="badge ${it.status === 'erro' ? 'red' : 'warn'}">${it.status === 'erro' ? 'Erro' : 'Pendente'}</span>
    </div>`).join('');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ── BOOT (cada etapa isolada: uma falha não derruba as demais) ── */
(async function init() {
  const passo = async (nome, fn) => {
    try { await fn(); } catch (e) { console.warn('init/' + nome + ':', e); showToast('Aviso (' + nome + '): ' + e.message, 'error'); }
  };
  await passo('banco-local', () => abrirDB());
  await passo('fila', () => atualizarBadgeFila());
  await passo('chips', () => { montarChips('pt-imped', IMPEDIMENTOS, 'on'); montarChips('ct-itens', ITENS_CANTEIRO, 'on-green'); });
  await passo('especies', () => montarSelectsEspecies());
  await passo('supabase', () => bootSupabase());
  await passo('auth-ui', () => { updateAuthUI(!!session); if (session) onSessionReady(); });
})();
