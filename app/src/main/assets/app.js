'use strict';
/* Моніторинг закупівель лікарні в Prozorro.
 * Дані: відкриті API Prozorro (пошук prozorro.gov.ua, public-api, risks, audit-api).
 * Мережеві запити виконує Android (window.Android.request) — без обмежень CORS.
 */

// ---------------------------------------------------------------- довідники
const STATUS = {
  'active.enquiries': ['Період уточнень', 'blue'],
  'active.tendering': ['Подання пропозицій', 'blue'],
  'active.pre-qualification': ['Прекваліфікація', 'amber'],
  'active.pre-qualification.stand-still': ['Прекваліфікація (оскарження)', 'amber'],
  'active.auction': ['Аукціон', 'violet'],
  'active.qualification': ['Кваліфікація переможця', 'amber'],
  'active.qualification.stand-still': ['Кваліфікація (оскарження)', 'amber'],
  'active.awarded': ['Пропозиції розглянуто', 'amber'],
  'active.stage2.pending': ['Очікування 2-го етапу', 'amber'],
  'active': ['Активна', 'teal'],
  'complete': ['Завершена', 'green'],
  'unsuccessful': ['Не відбулася', 'red'],
  'cancelled': ['Відмінена', 'gray'],
  'draft': ['Чернетка', 'gray'],
};
const METHOD = {
  belowThreshold: 'Спрощена закупівля',
  aboveThreshold: 'Відкриті торги з особливостями',
  aboveThresholdUA: 'Відкриті торги',
  aboveThresholdEU: 'Відкриті торги (з публікацією англ.)',
  reporting: 'Звіт про договір',
  negotiation: 'Переговорна процедура',
  'negotiation.quick': 'Переговорна процедура (скорочена)',
  priceQuotation: 'Електронний каталог (запит ціни)',
  competitiveOrdering: 'Конкурентний відбір',
  requestForProposal: 'Запит пропозицій',
  closeFrameworkAgreementUA: 'Укладання рамкової угоди',
  closeFrameworkAgreementSelectionUA: 'Відбір за рамковою угодою',
  competitiveDialogueUA: 'Конкурентний діалог',
  competitiveDialogueEU: 'Конкурентний діалог (англ.)',
  'competitiveDialogueUA.stage2': 'Конкурентний діалог, 2 етап',
  'competitiveDialogueEU.stage2': 'Конкурентний діалог, 2 етап',
  esco: 'Енергосервіс',
  'simple.defense': 'Спрощені торги (оборона)',
  'aboveThresholdUA.defense': 'Переговорна (оборона)',
};
const AWARD = { pending: ['Розглядається', 'amber'], active: ['Переможець', 'green'], unsuccessful: ['Відхилено', 'red'], cancelled: ['Скасовано', 'gray'] };
const CONTRACT = { pending: ['Очікує підписання', 'amber'], active: ['Підписаний', 'green'], terminated: ['Завершений', 'gray'], cancelled: ['Скасований', 'gray'], merged: ['Об’єднаний', 'gray'] };
const BID = { active: ['Активна', 'green'], pending: ['Очікує', 'amber'], unsuccessful: ['Відхилена', 'red'], invalid: ['Недійсна', 'red'], deleted: ['Видалена', 'gray'], draft: ['Чернетка', 'gray'] };
const COMPLAINT = {
  draft: ['Чернетка', 'gray'], claim: ['Вимога', 'amber'], answered: ['Відповідь надано', 'blue'],
  pending: ['Розглядається', 'amber'], accepted: ['Прийнята до розгляду', 'amber'], satisfied: ['Задоволена', 'red'],
  declined: ['Відхилена', 'green'], invalid: ['Залишена без розгляду', 'gray'], resolved: ['Вирішена', 'green'],
  stopped: ['Припинена', 'gray'], mistaken: ['Помилкова', 'gray'], cancelled: ['Скасована', 'gray'],
};
const MONITORING = {
  draft: 'Чернетка', active: 'Триває', addressed: 'Порушення усунено', declined: 'Порушень не усунено',
  completed: 'Завершено', closed: 'Закрито', stopped: 'Припинено', cancelled: 'Скасовано',
};

const GROUPS = [
  { id: 'active', label: 'Активні', status: ['active.enquiries', 'active.tendering', 'active.pre-qualification', 'active.pre-qualification.stand-still', 'active.auction', 'active.qualification', 'active.qualification.stand-still', 'active.awarded', 'active.stage2.pending', 'active'] },
  { id: 'all', label: 'Усі', status: null },
  { id: 'complete', label: 'Завершені', status: ['complete'] },
  { id: 'failed', label: 'Не відбулись / відмінені', status: ['unsuccessful', 'cancelled'] },
];
const COMPETITIVE = ['belowThreshold', 'aboveThreshold', 'aboveThresholdUA', 'aboveThresholdEU', 'priceQuotation', 'competitiveOrdering', 'requestForProposal', 'closeFrameworkAgreementUA', 'closeFrameworkAgreementSelectionUA', 'competitiveDialogueUA', 'competitiveDialogueEU', 'esco', 'simple.defense'];
const TYPES = [
  { id: 'all', label: 'Будь-який тип', proc: null },
  { id: 'competitive', label: 'Конкурентні', proc: COMPETITIVE },
  { id: 'reporting', label: 'Звіти про договір', proc: ['reporting'] },
  { id: 'negotiation', label: 'Переговорні', proc: ['negotiation', 'negotiation.quick'] },
];

// ---------------------------------------------------------------- утиліти
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusOf = (s) => STATUS[s] || [s || '—', 'gray'];
const badge = (pair) => `<span class="badge st-${pair[1]}">${esc(pair[0])}</span>`;
const method = (m) => METHOD[m] || m || '';
const shortName = (n) => {
  let s = String(n || '').replace(/КОМУНАЛЬНЕ НЕКОМЕРЦІЙНЕ ПІДПРИЄМСТВО/i, 'КНП').replace(/["“”«»]+/g, '"');
  s = s.replace(/"([^"]+)"/, (m, q) => {
    q = q === q.toUpperCase() ? q.charAt(0) + q.slice(1).toLowerCase() : q;
    return '«' + q.replace(/лікарня швидкої медичної допомоги/i, 'лікарня ШМД') + '»';
  });
  return s;
};

function money(v, withVat) {
  if (!v || v.amount == null) return '';
  const cur = v.currency || 'UAH';
  let s;
  try {
    s = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v.amount);
  } catch (e) {
    s = `${v.amount} ${cur}`;
  }
  if (withVat && v.valueAddedTaxIncluded != null) s += v.valueAddedTaxIncluded ? ' з ПДВ' : ' без ПДВ';
  return s;
}
function fmtDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  const date = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
}
function timeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  if (!(ms > 0)) return null;
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return { text: `${Math.max(1, Math.round(ms / 6e4))} хв`, soon: true };
  if (h < 48) return { text: `${h} год`, soon: h < 24 };
  return { text: `${Math.floor(h / 24)} дн`, soon: false };
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
const loadingHtml = () => '<div class="loading"><span class="dots"><i></i><i></i><i></i></span></div>';
const skeletons = (n) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
const errorHtml = (msg, retry) => `<div class="error">${esc(msg)}${retry ? `<br><button data-retry="${retry}">Спробувати ще раз</button>` : ''}</div>`;

// ---------------------------------------------------------------- міст до Android
const bridge = (() => {
  const A = window.Android;
  const pending = new Map();
  let seq = 0;
  window.__bridgeDone = (id, code, body, err) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (err) p.reject(new Error(err));
    else p.resolve({ code, body });
  };
  const LS = 'prozorro-monitor-settings';
  return {
    native: !!A,
    request(method, url, body) {
      if (A) {
        return new Promise((resolve, reject) => {
          const id = 'r' + (++seq);
          pending.set(id, { resolve, reject });
          A.request(id, method, url, body ? JSON.stringify(body) : null);
        });
      }
      // Режим браузера (для розробки): прямий запит.
      return fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      }).then(async (r) => ({ code: r.status, body: await r.text() }));
    },
    getSettings() {
      const raw = A ? A.getSettings() : localStorage.getItem(LS);
      try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    saveSettings(s) { A ? A.saveSettings(JSON.stringify(s)) : localStorage.setItem(LS, JSON.stringify(s)); },
    lastCheck() { return A ? Number(A.lastCheck()) : 0; },
    checkNow() { if (A) A.checkNow(); },
    notificationsAllowed() { return A ? A.notificationsAllowed() : true; },
    requestNotifications() { if (A) A.requestNotifications(); },
    openUrl(u) { A ? A.openUrl(u) : window.open(u, '_blank'); },
    share(t) { if (A) A.share(t); else if (navigator.share) navigator.share({ text: t }); },
    version() { return A ? A.appVersion() : 'web'; },
  };
})();

async function http(method, url, body) {
  const r = await bridge.request(method, url, body);
  if (r.code === 404) return null;
  if (r.code < 200 || r.code >= 300) throw new Error(`Prozorro відповів помилкою (HTTP ${r.code})`);
  try { return JSON.parse(r.body); } catch (e) { throw new Error('Некоректна відповідь сервера'); }
}

const API = {
  search: (body, page = 1) => http('POST', `https://prozorro.gov.ua/api/search/tenders?page=${page}`, body),
  summary: (tid) => http('GET', `https://prozorro.gov.ua/api/tenders/${encodeURIComponent(tid)}/summary`),
  tender: (hex) => http('GET', `https://public-api.prozorro.gov.ua/api/2.5/tenders/${hex}`),
  tenderRisks: (hex) => http('GET', `https://risks.prozorro.gov.ua/api/risks/${hex}`),
  buyerRisks: (edrpou, skip) => http('GET', `https://risks.prozorro.gov.ua/api/risks?edrpou=${edrpou}&limit=30&skip=${skip}&sort=dateAssessed&order=desc`),
  monitorings: (hex) => http('GET', `https://audit-api.prozorro.gov.ua/api/2.5/tenders/${hex}/monitorings?opt_fields=status,reasons,procuringStages,monitoringPeriod,conclusion,monitoring_id,dateModified`),
};

// ---------------------------------------------------------------- стан
const DEFAULTS = { edrpous: ['05503705'], watched: [], notify: true, intervalHours: 3 };
const state = {
  settings: Object.assign({}, DEFAULTS, bridge.getSettings() || {}),
  tab: 'list',
  group: 'active',
  type: 'all',
  text: '',
  list: { items: [], page: 0, total: 0, loading: false, error: null, done: false, token: 0 },
  risks: { items: [], skip: 0, total: 0, loading: false, error: null, done: false, loaded: false },
  detail: null, // { tid, data }
};
const saveSettings = () => bridge.saveSettings(state.settings);
const isWatched = (tid) => state.settings.watched.some((w) => w.id === tid);
function toggleWatch(tid, title) {
  if (isWatched(tid)) {
    state.settings.watched = state.settings.watched.filter((w) => w.id !== tid);
    toast('Більше не відстежується');
  } else {
    state.settings.watched.unshift({ id: tid, title: title || '' });
    toast('Додано до відстежуваних — сповіщу про зміни');
  }
  saveSettings();
}

// ---------------------------------------------------------------- картки списку
function tenderCard(t) {
  const st = statusOf(t.status);
  const pe = t.procuringEntity || {};
  const showBuyer = state.settings.edrpous.length > 1 && pe.name;
  let deadline = '';
  const end = (t.tenderPeriod || {}).endDate;
  if (end && ['active.enquiries', 'active.tendering'].includes(t.status)) {
    const left = timeLeft(end);
    if (left) {
      deadline = `<div class="deadline ${left.soon ? 'soon' : ''}">
        <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 11h-5v-2h3V6h2v7z"/></svg>
        Подання до ${esc(fmtDate(end))} · лишилось ${esc(left.text)}</div>`;
    }
  }
  const on = isWatched(t.tenderID);
  return `<div class="card tap st-${st[1]}" data-open="${esc(t.tenderID)}" data-title="${esc(t.title)}">
    <div class="card-head">
      <span class="tid">${esc(t.tenderID)}</span>
      ${badge(st)}
      <button class="mini-star ${on ? 'on' : ''}" data-star="${esc(t.tenderID)}" aria-label="Відстежувати">
        <svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
      </button>
    </div>
    <h3>${esc(t.title || 'Без назви')}</h3>
    ${showBuyer ? `<div class="method">${esc(shortName(pe.name))}</div>` : ''}
    <div class="card-foot">
      <span class="method">${esc(method(t.procurementMethodType))}</span>
      <span class="amount">${esc(money(t.value))}</span>
    </div>
    ${deadline}
  </div>`;
}

// ---------------------------------------------------------------- вкладка «Закупівлі»
function renderFilters() {
  $('#groupChips').innerHTML = GROUPS.map((g) => `<button class="chip ${state.group === g.id ? 'on' : ''}" data-group="${g.id}">${esc(g.label)}</button>`).join('');
  $('#typeChips').innerHTML = TYPES.map((g) => `<button class="chip ${state.type === g.id ? 'on' : ''}" data-type="${g.id}">${esc(g.label)}</button>`).join('');
  $('#typeChips').classList.add('small');
}

function searchBody() {
  const body = { buyer: state.settings.edrpous.slice() };
  const g = GROUPS.find((x) => x.id === state.group);
  if (g && g.status) body.status = g.status;
  const t = TYPES.find((x) => x.id === state.type);
  if (t && t.proc) body.proc_type = t.proc;
  if (state.text) body.text = state.text;
  return body;
}

async function loadList(reset) {
  const L = state.list;
  if (L.loading && !reset) return;
  if (!state.settings.edrpous.length) {
    $('#list').innerHTML = '<div class="empty">Вкажіть код ЄДРПОУ замовника в налаштуваннях.</div>';
    $('#listMeta').innerHTML = '';
    $('#listMore').innerHTML = '';
    return;
  }
  if (reset) Object.assign(L, { items: [], page: 0, total: 0, error: null, done: false, token: L.token + 1 });
  const token = L.token;
  L.loading = true;
  renderList();
  try {
    const r = (await API.search(searchBody(), L.page + 1)) || {};
    if (token !== L.token) return; // відповідь на застарілий запит
    const data = r.data || [];
    L.items = L.items.concat(data);
    L.page += 1;
    L.total = r.total || L.items.length;
    L.done = !data.length || L.items.length >= L.total;
    const pe = (data[0] || {}).procuringEntity;
    if (pe && pe.name && state.settings.edrpous.length === 1) $('#buyerName').textContent = shortName(pe.name);
  } catch (e) {
    if (token !== L.token) return;
    L.error = e.message;
  } finally {
    if (token === L.token) {
      L.loading = false;
      renderList();
      $('#refreshBtn').classList.remove('spin');
    }
  }
}

function renderList() {
  const L = state.list;
  if (!L.items.length) {
    $('#listMeta').innerHTML = '';
    $('#listMore').innerHTML = '';
    if (L.loading) $('#list').innerHTML = skeletons(5);
    else if (L.error) $('#list').innerHTML = errorHtml(L.error, 'list');
    else $('#list').innerHTML = '<div class="empty">Закупівель за цими фільтрами не знайдено.</div>';
    return;
  }
  $('#listMeta').innerHTML = `<span>Знайдено: ${L.total.toLocaleString('uk-UA')}</span><span>нові зверху</span>`;
  $('#list').innerHTML = L.items.map(tenderCard).join('');
  if (L.loading) $('#listMore').innerHTML = loadingHtml();
  else if (L.error) $('#listMore').innerHTML = errorHtml(L.error, 'list');
  else if (!L.done) $('#listMore').innerHTML = '<button class="more-btn" data-more="list">Показати ще</button>';
  else $('#listMore').innerHTML = '';
}

// ---------------------------------------------------------------- вкладка «Відстежую»
const watchedCache = {};
async function renderWatched() {
  const box = $('#watched');
  const w = state.settings.watched;
  if (!w.length) {
    box.innerHTML = '<div class="empty">Тут будуть закупівлі, позначені ★.<br><br>Для них приходять сповіщення про будь-які зміни: нові питання, скарги, зміну статусу, підписання договору.</div>';
    return;
  }
  const draw = () => {
    box.innerHTML = w.map((x) => {
      const s = watchedCache[x.id];
      return s ? tenderCard(s) : tenderCard({ tenderID: x.id, title: x.title, status: '' });
    }).join('');
  };
  draw();
  await Promise.all(w.map(async (x) => {
    if (watchedCache[x.id] && Date.now() - watchedCache[x.id]._ts < 120000) return;
    try {
      const s = await API.summary(x.id);
      if (s) { s._ts = Date.now(); watchedCache[x.id] = s; if (!x.title && s.title) x.title = s.title; }
    } catch (e) { /* лишаємо як є */ }
  }));
  if (state.tab === 'watched') draw();
}

// ---------------------------------------------------------------- вкладка «Ризики»
function riskNames(item) {
  const out = [];
  const risks = item.risks || {};
  Object.keys(risks).forEach((k) => {
    const arr = risks[k] || [];
    if (arr.some((r) => r.indicator === 'risk_found')) out.push({ id: k, name: (arr[0] || {}).name || k });
  });
  return out;
}
async function loadRisks(reset) {
  const R = state.risks;
  if (R.loading) return;
  if (reset) Object.assign(R, { items: [], skip: 0, total: 0, error: null, done: false });
  R.loading = true;
  R.loaded = true;
  renderRisks();
  try {
    const codes = state.settings.edrpous;
    const results = await Promise.all(codes.map((c) => API.buyerRisks(c, R.skip)));
    let added = 0;
    let total = 0;
    results.forEach((r) => {
      if (!r) return;
      const items = r.items || r.data || [];
      added += items.length;
      total += r.count || r.total || 0;
      R.items = R.items.concat(items);
    });
    R.items.sort((a, b) => String(b.dateAssessed || '').localeCompare(String(a.dateAssessed || '')));
    R.skip += 30;
    R.total = total || R.items.length;
    R.done = added === 0 || R.items.length >= R.total;
  } catch (e) {
    R.error = e.message;
  } finally {
    R.loading = false;
    renderRisks();
  }
}
function renderRisks() {
  const R = state.risks;
  const box = $('#risks');
  if (!R.items.length) {
    $('#riskMeta').innerHTML = '';
    $('#riskMore').innerHTML = '';
    if (R.loading) box.innerHTML = skeletons(3);
    else if (R.error) box.innerHTML = errorHtml(R.error, 'risks');
    else box.innerHTML = '<div class="empty">Закупівель зі спрацьованими індикаторами ризику не знайдено.</div>';
    return;
  }
  $('#riskMeta').innerHTML = `<span>Процедур з ризиками: ${R.total.toLocaleString('uk-UA')}</span>`;
  box.innerHTML = R.items.map((it) => {
    const names = riskNames(it);
    const tid = it.tenderID || '';
    const title = it.title || (it.procuringEntity || {}).name || '';
    return `<div class="card tap st-red" data-open="${esc(tid)}" data-title="${esc(it.title || '')}">
      <div class="card-head"><span class="tid">${esc(tid)}</span>${it.status ? badge(statusOf(it.status)) : ''}</div>
      ${it.title ? `<h3>${esc(title)}</h3>` : ''}
      <div class="li-sub" style="color:var(--muted);font-size:12.5px">Оцінено: ${esc(fmtDate(it.dateAssessed))}${it.value ? ' · ' + esc(money(it.value)) : ''}</div>
      <ul style="margin:8px 0 0;padding-left:18px;font-size:13.5px">${names.map((n) => `<li>${esc(n.name)}</li>`).join('') || '<li>Індикатор ризику спрацював</li>'}</ul>
    </div>`;
  }).join('');
  if (R.loading) $('#riskMore').innerHTML = loadingHtml();
  else if (R.error) $('#riskMore').innerHTML = errorHtml(R.error, 'risks');
  else if (!R.done) $('#riskMore').innerHTML = '<button class="more-btn" data-more="risks">Показати ще</button>';
  else $('#riskMore').innerHTML = '';
}

// ---------------------------------------------------------------- вкладка «Налаштування»
function renderSettings() {
  const s = state.settings;
  const last = bridge.lastCheck();
  const allowed = bridge.notificationsAllowed();
  $('#settings').innerHTML = `
  <div class="set-card">
    <h4>Замовник</h4>
    <p>Код ЄДРПОУ, закупівлі якого відстежуються. Можна кілька через кому.</p>
    <input id="edrpouInput" class="field" inputmode="numeric" value="${esc(s.edrpous.join(', '))}">
    <button class="btn" id="saveEdrpou" style="margin-top:10px;width:100%">Зберегти</button>
  </div>
  <div class="set-card">
    <h4>Сповіщення</h4>
    <div class="set-row"><span>Фонова перевірка змін</span>
      <label class="switch"><input type="checkbox" id="notifyToggle" ${s.notify ? 'checked' : ''}><span></span></label></div>
    <div class="set-row"><span>Перевіряти кожні</span>
      <select id="intervalSel" class="field" style="width:auto">
        ${[1, 2, 3, 6, 12, 24].map((h) => `<option value="${h}" ${s.intervalHours === h ? 'selected' : ''}>${h} год</option>`).join('')}
      </select></div>
    ${allowed ? '' : '<div class="warn">Сповіщення вимкнені в Android. <button id="askNotif">Увімкнути</button></div>'}
    <p style="margin-top:10px">Сповіщаю про: нові закупівлі замовника, зміну статусу, будь-які зміни у закупівлях з ★.
    Остання перевірка: ${last ? esc(fmtDate(new Date(last).toISOString())) : 'ще не було'}.</p>
    <button class="btn ghost" id="checkNow" style="width:100%">Перевірити зараз</button>
  </div>
  <div class="set-card">
    <h4>Про додаток</h4>
    <p>Дані з відкритих API Prozorro: пошук закупівель, повні дані тендерів, індикатори ризиків і моніторинги ДАСУ. Додаток лише читає відкриті дані й нічого не надсилає від імені лікарні.</p>
    <p style="margin:0">Версія ${esc(bridge.version())}</p>
  </div>`;
}

// ---------------------------------------------------------------- картка закупівлі
function openDetail(tid, title) {
  if (!tid) return;
  state.detail = { tid, title };
  const d = $('#detail');
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  $('#detailId').textContent = tid;
  updateDetailStar();
  $('#detailBody').innerHTML = loadingHtml();
  $('#detailBody').scrollTop = 0;
  loadDetail(tid);
}
function closeDetail() {
  state.detail = null;
  const d = $('#detail');
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
  if (state.tab === 'list') renderList();
  if (state.tab === 'watched') renderWatched();
}
function updateDetailStar() {
  if (!state.detail) return;
  $('#detailStar').classList.toggle('on', isWatched(state.detail.tid));
}

async function loadDetail(tid) {
  try {
    const sum = await API.summary(tid);
    if (!state.detail || state.detail.tid !== tid) return;
    if (!sum || !sum.id) throw new Error('Закупівлю не знайдено');
    const full = await API.tender(sum.id);
    if (!state.detail || state.detail.tid !== tid) return;
    const t = (full && full.data) || sum;
    state.detail.data = t;
    state.detail.title = t.title;
    $('#detailBody').innerHTML = renderTender(t);
    loadDetailExtras(t);
  } catch (e) {
    if (!state.detail || state.detail.tid !== tid) return;
    $('#detailBody').innerHTML = errorHtml(e.message, 'detail');
  }
}

function section(id, title, count, inner, open, alert) {
  return `<details class="sec" id="${id}" ${open ? 'open' : ''}>
    <summary>${esc(title)}<span class="cnt ${alert ? 'alert' : ''}">${count == null ? '' : esc(count)}</span></summary>
    <div class="inner">${inner}</div></details>`;
}
const supplierName = (arr) => ((arr || [])[0] || {}).name || ((((arr || [])[0] || {}).identifier || {}).legalName) || '—';
const edr = (o) => ((o || {}).identifier || {}).id || '';

function renderTender(t) {
  const st = statusOf(t.status);
  const lotsById = {};
  (t.lots || []).forEach((l) => { lotsById[l.id] = l; });
  const lotName = (id) => (id && lotsById[id] ? lotsById[id].title : '');
  const vat = t.value && t.value.valueAddedTaxIncluded != null ? (t.value.valueAddedTaxIncluded ? 'з ПДВ' : 'без ПДВ') : '';

  let html = `<div class="hero">
    <div class="row">${badge(st)}</div>
    <h2>${esc(t.title || '')}</h2>
    <div class="amount-big">${esc(money(t.value)) || '—'} <span class="vat">${esc(vat)}</span></div>
    <div class="method">${esc(method(t.procurementMethodType))}</div>
    <div class="actions">
      <button class="btn" data-url="https://prozorro.gov.ua/tender/${esc(t.tenderID)}">Відкрити на Prozorro</button>
    </div>
  </div>`;

  // Терміни
  const now = Date.now();
  const steps = [
    ['Оголошено', t.date || (t.tenderPeriod || {}).startDate],
    ['Кінець періоду уточнень', (t.enquiryPeriod || {}).endDate],
    ['Кінцевий строк подання пропозицій', (t.tenderPeriod || {}).endDate],
    ['Аукціон', (t.auctionPeriod || {}).startDate || ((t.lots || []).map((l) => (l.auctionPeriod || {}).startDate).filter(Boolean)[0])],
    ['Початок кваліфікації', (t.awardPeriod || {}).startDate],
    ['Завершення', (t.awardPeriod || {}).endDate],
  ].filter((s) => s[1]);
  let nextMarked = false;
  const tl = steps.map(([label, iso]) => {
    const past = new Date(iso).getTime() <= now;
    let cls = past ? 'past' : '';
    if (!past && !nextMarked) { cls = 'next'; nextMarked = true; }
    const left = !past ? timeLeft(iso) : null;
    return `<li class="${cls}"><span class="tl-label">${esc(label)}${left ? `<br><small style="color:var(--${left.soon ? 'red' : 'muted'})">через ${esc(left.text)}</small>` : ''}</span><span class="tl-date">${esc(fmtDate(iso))}</span></li>`;
  }).join('');
  if (tl) html += section('s-time', 'Терміни', null, `<ul class="timeline">${tl}</ul>`, true);

  // Предмет закупівлі
  const items = t.items || [];
  if (items.length) {
    const inner = items.map((i) => {
      const cls = i.classification || {};
      const unit = (i.unit || {}).name || '';
      return `<div class="list-item"><div class="li-title">${esc(i.description || '')}</div>
        <div class="li-sub">${i.quantity != null ? esc(`${i.quantity} ${unit}`) + ' · ' : ''}${esc(cls.id || '')} ${esc(cls.description || '')}${lotName(i.relatedLot) ? ' · Лот: ' + esc(lotName(i.relatedLot)) : ''}</div>
        ${(i.deliveryDate || {}).endDate ? `<div class="li-sub">Поставка до ${esc(fmtDate(i.deliveryDate.endDate, false))}</div>` : ''}</div>`;
    }).join('');
    html += section('s-items', 'Предмет закупівлі', items.length, inner, items.length <= 3);
  }

  // Лоти
  if ((t.lots || []).length > 1) {
    const inner = t.lots.map((l) => `<div class="list-item"><div class="li-row"><span class="li-title">${esc(l.title || '')}</span>${badge(statusOf(l.status))}</div><div class="li-sub">${esc(money(l.value))}</div></div>`).join('');
    html += section('s-lots', 'Лоти', t.lots.length, inner, false);
  }

  // Пропозиції
  const bids = t.bids || [];
  if (bids.length || t.numberOfBids) {
    const inner = bids.length ? bids.map((b) => {
      const val = b.value || ((b.lotValues || [])[0] || {}).value;
      return `<div class="list-item"><div class="li-row"><span class="li-title">${esc(supplierName(b.tenderers))}</span>${b.status ? badge(BID[b.status] || [b.status, 'gray']) : ''}</div>
        <div class="li-sub">${esc(edr((b.tenderers || [])[0]))}${val ? ' · ' + esc(money(val)) : ''}${b.date ? ' · ' + esc(fmtDate(b.date)) : ''}</div></div>`;
    }).join('') : '<div class="li-sub">Учасників буде видно після розкриття пропозицій.</div>';
    html += section('s-bids', 'Пропозиції учасників', bids.length || t.numberOfBids, inner, false);
  }

  // Кваліфікація / переможці
  const awards = t.awards || [];
  if (awards.length) {
    const inner = awards.map((a) => `<div class="list-item">
      <div class="li-row"><span class="li-title">${esc(supplierName(a.suppliers))}</span>${badge(AWARD[a.status] || [a.status, 'gray'])}</div>
      <div class="li-sub">${esc(edr((a.suppliers || [])[0]))}${a.value ? ' · ' + esc(money(a.value)) : ''}${a.date ? ' · ' + esc(fmtDate(a.date)) : ''}${lotName(a.lotID) ? ' · Лот: ' + esc(lotName(a.lotID)) : ''}</div>
      ${a.status === 'unsuccessful' && (a.title || a.description) ? `<div class="li-text" style="font-size:13px">${esc(a.title || '')}${a.description ? '\n' + esc(a.description) : ''}</div>` : ''}
    </div>`).join('');
    html += section('s-awards', 'Кваліфікація та переможці', awards.length, inner, true);
  }

  // Договори
  const contracts = t.contracts || [];
  if (contracts.length) {
    const inner = contracts.map((c) => `<div class="list-item">
      <div class="li-row"><span class="li-title">${esc(c.contractNumber ? '№ ' + c.contractNumber : (c.title || 'Договір'))}</span>${badge(CONTRACT[c.status] || [c.status, 'gray'])}</div>
      <div class="li-sub">${esc(supplierName(c.suppliers))}${c.value ? ' · ' + esc(money(c.value)) : ''}</div>
      ${c.dateSigned ? `<div class="li-sub">Підписано ${esc(fmtDate(c.dateSigned, false))}${(c.period || {}).endDate ? ' · діє до ' + esc(fmtDate(c.period.endDate, false)) : ''}</div>` : ''}
    </div>`).join('');
    html += section('s-contracts', 'Договори', contracts.length, inner, true);
  }

  // Питання
  const qs = t.questions || [];
  if (qs.length) {
    const unanswered = qs.filter((q) => !q.answer).length;
    const inner = qs.slice().reverse().map((q) => `<div class="list-item">
      <div class="li-title">${esc(q.title || 'Питання')}</div>
      <div class="li-sub">${esc(fmtDate(q.date))}${q.author && q.author.name ? ' · ' + esc(q.author.name) : ''}</div>
      ${q.description ? `<div class="li-text">${esc(q.description)}</div>` : ''}
      ${q.answer ? `<div class="answer">${esc(q.answer)}</div>` : '<div class="noanswer">Без відповіді</div>'}
    </div>`).join('');
    html += section('s-questions', 'Питання', unanswered ? `${qs.length} · без відповіді: ${unanswered}` : qs.length, inner, unanswered > 0, unanswered > 0);
  }

  // Скарги / вимоги (тендер, лоти, кваліфікація)
  const complaints = [].concat(
    t.complaints || [],
    ...(t.awards || []).map((a) => a.complaints || []),
    ...(t.qualifications || []).map((q) => q.complaints || []),
    ...(t.cancellations || []).map((c) => c.complaints || []),
  );
  if (complaints.length) {
    const open = complaints.filter((c) => ['pending', 'accepted', 'claim', 'answered'].includes(c.status)).length;
    const inner = complaints.map((c) => `<div class="list-item">
      <div class="li-row"><span class="li-title">${esc(c.title || (c.type === 'claim' ? 'Вимога' : 'Скарга'))}</span>${badge(COMPLAINT[c.status] || [c.status, 'gray'])}</div>
      <div class="li-sub">${c.type === 'complaint' ? 'Скарга до АМКУ' : 'Вимога'} · ${esc(fmtDate(c.dateSubmitted || c.date))}${c.author && c.author.name ? ' · ' + esc(c.author.name) : ''}</div>
      ${c.description ? `<div class="li-text" style="font-size:13px">${esc(c.description.slice(0, 700))}${c.description.length > 700 ? '…' : ''}</div>` : ''}
      ${c.resolution ? `<div class="answer">${esc(c.resolution.slice(0, 700))}</div>` : ''}
    </div>`).join('');
    html += section('s-complaints', 'Скарги та вимоги', open ? `${complaints.length} · активних: ${open}` : complaints.length, inner, open > 0, open > 0);
  }

  // Відміна
  const canc = (t.cancellations || []).filter((c) => c.status !== 'draft');
  if (canc.length) {
    const inner = canc.map((c) => `<div class="list-item"><div class="li-row"><span class="li-title">${esc(c.reasonType || 'Відміна')}</span>${badge([c.status === 'active' ? 'Діє' : c.status, c.status === 'active' ? 'red' : 'gray'])}</div>
      <div class="li-text" style="font-size:13px">${esc(c.reason || '')}</div><div class="li-sub">${esc(fmtDate(c.date))}</div></div>`).join('');
    html += section('s-cancel', 'Відміна', canc.length, inner, true);
  }

  // Документи
  const docs = [].concat(
    (t.documents || []).map((d) => [d, '']),
    ...(t.awards || []).map((a) => (a.documents || []).map((d) => [d, 'кваліфікація'])),
    ...(t.contracts || []).map((c) => (c.documents || []).map((d) => [d, 'договір'])),
  );
  // лишаємо останню версію кожного документа
  const latest = new Map();
  docs.forEach(([d, src]) => {
    const key = d.id || d.url;
    const prev = latest.get(key);
    if (!prev || String(d.dateModified || d.datePublished) > String(prev[0].dateModified || prev[0].datePublished)) latest.set(key, [d, src]);
  });
  const docList = Array.from(latest.values()).sort((a, b) => String(b[0].datePublished).localeCompare(String(a[0].datePublished)));
  if (docList.length) {
    const inner = docList.map(([d, src]) => `<a class="doc" data-url="${esc(d.url)}">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
      <span class="d-title">${esc(d.title || 'Документ')}${src ? ` <small style="color:var(--muted)">(${esc(src)})</small>` : ''}</span>
      <span class="d-date">${esc(fmtDate(d.datePublished, false))}</span></a>`).join('');
    html += section('s-docs', 'Документи', docList.length, inner, false);
  }

  // Ризики ДАСУ та моніторинги — довантажуються окремо
  html += section('s-risks', 'Ризики та моніторинг ДАСУ', '…', loadingHtml(), false);

  const pe = t.procuringEntity || {};
  const cp = pe.contactPoint || {};
  html += section('s-buyer', 'Замовник', null, `<dl class="kv">
    <dt>Назва</dt><dd>${esc(pe.name || '')}</dd>
    <dt>ЄДРПОУ</dt><dd>${esc(edr(pe))}</dd>
    ${cp.name ? `<dt>Контактна особа</dt><dd>${esc(cp.name)}</dd>` : ''}
    ${cp.telephone ? `<dt>Телефон</dt><dd>${esc(cp.telephone)}</dd>` : ''}
    ${cp.email ? `<dt>Email</dt><dd>${esc(cp.email)}</dd>` : ''}
    <dt>Змінено</dt><dd>${esc(fmtDate(t.dateModified))}</dd>
  </dl>`, false);

  return html;
}

async function loadDetailExtras(t) {
  const tid = t.tenderID;
  let risksHtml = '';
  let found = 0;
  let mons = [];
  const [risk, mon] = await Promise.all([
    API.tenderRisks(t.id).catch(() => undefined),
    API.monitorings(t.id).catch(() => undefined),
  ]);
  if (!state.detail || state.detail.tid !== tid) return;
  if (risk === undefined) risksHtml += '<div class="li-sub">Не вдалося отримати індикатори ризиків.</div>';
  else if (!risk) risksHtml += '<div class="li-sub">Індикатори ризиків для цієї процедури ще не розраховувались.</div>';
  else {
    const names = riskNames(risk);
    found = names.length;
    risksHtml += names.length
      ? `<div class="li-title" style="color:var(--red);margin-bottom:4px">Спрацювали індикатори ризику:</div><ul style="margin:0;padding-left:18px">${names.map((n) => `<li>${esc(n.name)}</li>`).join('')}</ul>`
      : '<div class="li-sub" style="color:var(--green)">Перевірено ДАСУ: індикатори ризику не спрацювали.</div>';
    if (risk.dateAssessed) risksHtml += `<div class="li-sub" style="margin-top:6px">Оцінено: ${esc(fmtDate(risk.dateAssessed))}</div>`;
  }
  if (mon && mon.data) mons = mon.data;
  if (mons.length) {
    risksHtml += '<div class="li-title" style="margin-top:12px">Моніторинги ДАСУ</div>' + mons.map((m) => {
      const c = m.conclusion || {};
      return `<div class="list-item"><div class="li-row"><span class="li-title">${esc(m.monitoring_id || 'Моніторинг')}</span>${badge([MONITORING[m.status] || m.status, m.status === 'active' ? 'amber' : 'gray'])}</div>
        ${c.violationOccurred != null ? `<div class="li-sub" style="color:var(--${c.violationOccurred ? 'red' : 'green'})">${c.violationOccurred ? 'Виявлено порушення' : 'Порушень не виявлено'}</div>` : ''}
        ${c.auditFinding ? `<div class="li-text" style="font-size:13px">${esc(c.auditFinding.slice(0, 600))}</div>` : ''}
        <div class="li-sub">${esc(fmtDate(m.dateModified))}</div></div>`;
    }).join('');
  } else if (mon !== undefined) {
    risksHtml += '<div class="li-sub" style="margin-top:8px">Моніторингів ДАСУ немає.</div>';
  }
  const sec = $('#s-risks');
  if (!sec) return;
  sec.querySelector('.inner').innerHTML = risksHtml;
  const cnt = sec.querySelector('.cnt');
  const label = [found ? `ризиків: ${found}` : '', mons.length ? `моніторингів: ${mons.length}` : ''].filter(Boolean).join(' · ');
  cnt.textContent = label || 'немає';
  cnt.classList.toggle('alert', found > 0 || mons.length > 0);
  if (found || mons.length) sec.setAttribute('open', '');
}

// ---------------------------------------------------------------- навігація
const TITLES = { list: 'Закупівлі', watched: 'Відстежую', risks: 'Ризики ДАСУ', settings: 'Налаштування' };
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab));
  $('#screenTitle').textContent = TITLES[tab];
  $('#top').classList.toggle('compact', tab !== 'list');
  $('#refreshBtn').style.visibility = tab === 'settings' ? 'hidden' : 'visible';
  $('#views').scrollTop = 0;
  if (tab === 'watched') renderWatched();
  if (tab === 'risks' && !state.risks.loaded) loadRisks(true);
  if (tab === 'settings') renderSettings();
}

window.handleBack = () => {
  if (state.detail) { closeDetail(); return true; }
  if (state.tab !== 'list') { setTab('list'); return true; }
  return false;
};
window.openTenderFromNotification = (tid) => openDetail(tid);
window.onAppResume = () => { if (state.tab === 'settings') renderSettings(); };

// ---------------------------------------------------------------- події
document.addEventListener('click', (e) => {
  const el = (sel) => e.target.closest(sel);
  let x;
  if ((x = el('[data-star]'))) {
    e.stopPropagation();
    const card = x.closest('[data-open]');
    toggleWatch(x.dataset.star, card ? card.dataset.title : '');
    x.classList.toggle('on', isWatched(x.dataset.star));
    if (state.tab === 'watched') renderWatched();
    return;
  }
  if ((x = el('[data-url]'))) { e.preventDefault(); bridge.openUrl(x.dataset.url); return; }
  if ((x = el('[data-open]'))) { openDetail(x.dataset.open, x.dataset.title); return; }
  if ((x = el('[data-group]'))) { state.group = x.dataset.group; renderFilters(); loadList(true); return; }
  if ((x = el('[data-type]'))) { state.type = x.dataset.type; renderFilters(); loadList(true); return; }
  if ((x = el('[data-more]'))) { x.dataset.more === 'list' ? loadList(false) : loadRisks(false); return; }
  if ((x = el('[data-retry]'))) {
    const r = x.dataset.retry;
    if (r === 'list') loadList(state.list.items.length === 0);
    else if (r === 'risks') loadRisks(state.risks.items.length === 0);
    else if (r === 'detail' && state.detail) openDetail(state.detail.tid, state.detail.title);
    return;
  }
  if ((x = el('#tabs button'))) { if (state.detail) closeDetail(); setTab(x.dataset.tab); return; }
  if (el('#detailBack')) { closeDetail(); return; }
  if (el('#detailStar') && state.detail) { toggleWatch(state.detail.tid, state.detail.title); updateDetailStar(); return; }
  if (el('#detailShare') && state.detail) {
    bridge.share(`${state.detail.title || ''}\nhttps://prozorro.gov.ua/tender/${state.detail.tid}`);
    return;
  }
  if (el('#refreshBtn')) {
    $('#refreshBtn').classList.add('spin');
    Object.keys(watchedCache).forEach((k) => delete watchedCache[k]);
    if (state.tab === 'risks') loadRisks(true).then(() => $('#refreshBtn').classList.remove('spin'));
    else if (state.tab === 'watched') renderWatched().then(() => $('#refreshBtn').classList.remove('spin'));
    else loadList(true);
    if (state.tab === 'settings') { renderSettings(); $('#refreshBtn').classList.remove('spin'); }
    return;
  }
  if (el('#saveEdrpou')) {
    const codes = $('#edrpouInput').value.split(/[\s,;]+/).map((c) => c.replace(/\D/g, '')).filter((c) => c.length >= 6 && c.length <= 10);
    if (!codes.length) { toast('Введіть коректний код ЄДРПОУ (8 цифр)'); return; }
    state.settings.edrpous = Array.from(new Set(codes));
    saveSettings();
    state.risks.loaded = false;
    $('#buyerName').textContent = 'Код ЄДРПОУ: ' + state.settings.edrpous.join(', ');
    loadList(true);
    toast('Збережено');
    return;
  }
  if (el('#checkNow')) { bridge.checkNow(); toast('Перевіряю… Результат прийде сповіщенням'); return; }
  if (el('#askNotif')) { bridge.requestNotifications(); return; }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'notifyToggle') {
    state.settings.notify = e.target.checked;
    saveSettings();
    if (e.target.checked && !bridge.notificationsAllowed()) bridge.requestNotifications();
    toast(e.target.checked ? 'Фонову перевірку увімкнено' : 'Фонову перевірку вимкнено');
  }
  if (e.target.id === 'intervalSel') {
    state.settings.intervalHours = Number(e.target.value);
    saveSettings();
    toast('Інтервал збережено');
  }
});
let searchTimer;
$('#searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const v = e.target.value.trim();
    if (v === state.text) return;
    state.text = v;
    // Пошук за номером закупівлі відкриває її одразу.
    if (/^UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]$/i.test(v)) {
      openDetail(v.slice(0, -1).toUpperCase() + v.slice(-1).toLowerCase());
      return;
    }
    loadList(true);
  }, 500);
});
$('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// ---------------------------------------------------------------- старт
if (!Array.isArray(state.settings.edrpous)) state.settings.edrpous = DEFAULTS.edrpous.slice();
if (!Array.isArray(state.settings.watched)) state.settings.watched = [];
renderFilters();
loadList(true);
