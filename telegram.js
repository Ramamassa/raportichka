const tg = window.Telegram?.WebApp;
const active = !!tg?.initData;
let revision = 0, pending = null, sending = false, failed = false;
let status = () => {};

export function onSyncStatus(fn) { status = fn; }

function getAuthHeaders() {
  const headers = {};
  if (active) {
    headers['X-Telegram-Init-Data'] = tg.initData;
  } else {
    const pin = localStorage.getItem('raportichka_pin');
    if (pin) headers['X-Owner-Pin'] = pin;
  }
  return headers;
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      signal: AbortSignal.timeout(30000),
      headers: {
        ...options.headers,
        ...getAuthHeaders()
      }
    });
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет; изменения пока не подтверждены сервером.');
  }

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !active) {
      localStorage.removeItem('raportichka_pin');
    }
    throw new Error(data.error || 'Ошибка запроса к серверу.');
  }
  return data;
}

export function promptPin(message = '') {
  const dialog = document.getElementById('pin-dialog');
  if (!dialog) {
    const entered = window.prompt(message || 'Введите пароль старосты для доступа к Рапортичке:');
    return Promise.resolve(entered ? entered.trim() : null);
  }

  const errorEl = document.getElementById('pin-error');
  const inputEl = document.getElementById('pin-input');
  const formEl = dialog.querySelector('form');

  if (errorEl) errorEl.textContent = message;
  if (inputEl) inputEl.value = '';

  dialog.showModal();
  inputEl?.focus();

  return new Promise(resolve => {
    function handleSubmit(e) {
      e.preventDefault();
      dialog.close();
      cleanup();
      resolve(inputEl ? inputEl.value.trim() : null);
    }
    function handleCancel() {
      cleanup();
      resolve(null);
    }
    function cleanup() {
      formEl.removeEventListener('submit', handleSubmit);
      dialog.removeEventListener('cancel', handleCancel);
    }
    formEl.addEventListener('submit', handleSubmit, { once: true });
    dialog.addEventListener('cancel', handleCancel, { once: true });
  });
}

export async function loadTelegramState() {
  if (active) {
    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes();
    const insets = () => {
      document.documentElement.style.setProperty('--tg-bottom', `${tg.safeAreaInset?.bottom || 0}px`);
      document.documentElement.style.setProperty('--tg-top', `${(tg.safeAreaInset?.top || 0) + (tg.contentSafeAreaInset?.top || 0)}px`);
    };
    insets();
    tg.onEvent('safeAreaChanged', insets);
    tg.onEvent('contentSafeAreaChanged', insets);

    const data = await api('/api/state');
    revision = data.revision;
    return data.state;
  }

  // Web Browser / Safari mode
  const preview = location.hostname === '127.0.0.1' && new URLSearchParams(location.search).get('preview') === '1';
  if (preview) return null;

  let pin = localStorage.getItem('raportichka_pin');
  if (!pin) {
    pin = await promptPin();
    if (!pin) {
      throw new Error('Для доступа к отметкам требуется пароль старосты.');
    }
    localStorage.setItem('raportichka_pin', pin);
  }

  try {
    const data = await api('/api/state');
    revision = data.revision;
    return data.state;
  } catch (err) {
    // Retry once with new PIN if authorization failed
    localStorage.removeItem('raportichka_pin');
    pin = await promptPin('Неверный пароль старосты. Попробуйте ещё раз:');
    if (!pin) throw err;
    localStorage.setItem('raportichka_pin', pin);
    const data = await api('/api/state');
    revision = data.revision;
    return data.state;
  }
}

export function queueTelegramSave(state) {
  // Sync to cloud in both Telegram and authenticated Safari
  if (!active && !localStorage.getItem('raportichka_pin')) return;
  pending = structuredClone(state);
  failed = false;
  if (active && tg.isVersionAtLeast('6.2')) tg.enableClosingConfirmation();
  status('Сохранение в облако…');
  drain();
}

async function drain() {
  if (sending || !pending) return;
  sending = true;
  const snapshot = pending;
  pending = null;
  try {
    const data = await api('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: snapshot, revision })
    });
    revision = data.revision;
    if (!pending) {
      status('Сохранено в облаке');
      if (active && tg.isVersionAtLeast('6.2')) tg.disableClosingConfirmation();
    }
  } catch (error) {
    pending = pending || snapshot;
    failed = true;
    status(error.message, true);
  } finally {
    sending = false;
    if (pending && !failed) drain();
  }
}

export function retryTelegramSave() {
  failed = false;
  drain();
}

export function logoutWeb() {
  localStorage.removeItem('raportichka_pin');
  location.reload();
}

window.addEventListener('online', () => { if (pending && !failed) drain(); });
window.addEventListener('beforeunload', event => {
  if (pending || sending) {
    event.preventDefault();
    event.returnValue = '';
  }
});

export async function telegramDownload(blob) {
  if (!active) return false; // Safari downloads directly to browser
  await api('/api/export', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  return true;
}

export const telegramActive = active;
