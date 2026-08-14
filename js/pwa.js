/* ================================================================
   PWA — registra o service worker e oferece o botão "Instalar app".
   ================================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err =>
      console.warn('Service worker não registrou:', err));
  });
}

let _promptInstalar = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();          // não mostra o balão automático do Chrome…
  _promptInstalar = e;         // …guarda pra disparar no nosso botão
  mostrarBotaoInstalar();
});

function mostrarBotaoInstalar() {
  if (document.getElementById('btn-instalar')) return;
  const b = document.createElement('button');
  b.id = 'btn-instalar';
  b.className = 'btn-instalar';
  b.type = 'button';
  b.innerHTML = '📲 Instalar app';
  b.onclick = async () => {
    if (!_promptInstalar) return;
    _promptInstalar.prompt();
    const { outcome } = await _promptInstalar.userChoice;
    _promptInstalar = null;
    b.remove();
    if (typeof showToast === 'function') {
      showToast(outcome === 'accepted' ? 'App instalado! Abra pelo ícone na tela inicial.' : 'Instalação cancelada.',
        outcome === 'accepted' ? 'success' : 'info');
    }
  };
  document.body.appendChild(b);
}

window.addEventListener('appinstalled', () => {
  const b = document.getElementById('btn-instalar');
  if (b) b.remove();
});
