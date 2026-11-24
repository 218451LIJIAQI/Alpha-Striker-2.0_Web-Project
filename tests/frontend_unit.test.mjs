import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function createBrowserSandbox(pathname = '/pages/homepage.html', customFetchImpl = null) {
  const storage = new Map();
  const classes = new Set();
  const bodyClasses = new Set();
  const appended = [];
  const fetchCalls = [];
  const windowEvents = [];
  const domById = new Map();

  const makeClassList = (set) => ({
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    contains: (n) => set.has(n),
    toggle: (n, force) => {
      const shouldAdd = force !== undefined ? Boolean(force) : !set.has(n);
      if (shouldAdd) set.add(n);
      else set.delete(n);
      return shouldAdd;
    },
  });

  const makeElement = (tag) => {
    const attrs = new Map();
    const listeners = new Map();
    return {
      tagName: tag.toUpperCase(),
      id: '',
      rel: '',
      href: '',
      className: '',
      innerHTML: '',
      textContent: '',
      parentNode: { removeChild: () => {} },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      remove() {
        this.removed = true;
      },
      querySelector: () => ({ addEventListener: () => {} }),
      querySelectorAll: () => [],
      addEventListener: (ev, fn) => listeners.set(ev, fn),
      trigger: (ev, arg) => listeners.get(ev)?.(arg),
    };
  };

  const sandbox = {
    window: null,
    Date: Date,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail || null;
      }
    },
    FormData: class FormData {},
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear(),
    },
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      if (customFetchImpl) return customFetchImpl(url, opts);
      return { status: 200, json: async () => ({ success: true }) };
    },
    setTimeout: (fn) => fn,
    clearTimeout: () => {},
    dispatchEvent: (ev) => windowEvents.push(ev),
    document: {
      documentElement: { classList: makeClassList(classes) },
      body: {
        classList: makeClassList(bodyClasses),
        appendChild: (el) => appended.push(el),
      },
      head: {
        appendChild: (el) => appended.push(el),
      },
      getElementById: (id) => domById.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: makeElement,
      addEventListener: () => {},
    },
    location: { pathname, search: '', href: pathname },
  };
  sandbox.window = sandbox;

  const commonCode = fs.readFileSync(path.join(ROOT, 'public/js/common.js'), 'utf8');
  vm.runInNewContext(commonCode, sandbox);
  return { sandbox, storage, classes, bodyClasses, appended, fetchCalls, windowEvents, domById, makeElement };
}

test('escapeHtml neutralizes XSS characters accurately', () => {
  const { sandbox } = createBrowserSandbox();
  const escaped = sandbox.CineTicket.escapeHtml('<img src=x onerror="alert(\'xss\')">&');
  assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;&amp;');
});

test('path resolution adapts cleanly across root, /pages/, and /admin/', () => {
  const rootEnv = createBrowserSandbox('/index.html').sandbox.CineTicket;
  assert.equal(rootEnv.pageUrl('booking3.html?movie_code=2'), 'pages/booking3.html?movie_code=2');
  assert.equal(rootEnv.resolveAssetUrl('../img/homepage/frozen_2.jpeg'), 'img/homepage/frozen_2.jpeg');

  const pageEnv = createBrowserSandbox('/pages/homepage.html').sandbox.CineTicket;
  assert.equal(pageEnv.pageUrl('booking3.html?movie_code=2'), 'booking3.html?movie_code=2');
  assert.equal(pageEnv.resolveAssetUrl('../img/homepage/frozen_2.jpeg'), '../img/homepage/frozen_2.jpeg');
  assert.equal(pageEnv.rootUrl('login.html'), '../login.html');

  const adminEnv = createBrowserSandbox('/admin/movies.html').sandbox.CineTicket;
  assert.equal(adminEnv.pageUrl('homepage.html'), '../pages/homepage.html');
  assert.equal(adminEnv.resolveAssetUrl('img/logo.jpg'), '../img/logo.jpg');
});

test('AuthStore persists user identity, syncs server session state, and purges stale pseudo-login state', async () => {
  let serverAuth = false;
  const { sandbox, storage } = createBrowserSandbox('/pages/homepage.html', async () => ({
    status: 200,
    json: async () => ({
      success: true,
      data: serverAuth
        ? { authenticated: true, user_id: 9, user_name: 'Verified Member', email: 'member@example.com' }
        : { authenticated: false, user_id: 0, user_name: 'Guest', email: '' },
    }),
  }));
  storage.set('pwd', 'legacy-secret');

  sandbox.CineTicket.AuthStore.setUser({
    user_id: 7,
    user_name: 'Alice Tan',
    email: 'alice@example.com',
  });

  assert.equal(storage.has('pwd'), false);
  assert.equal(sandbox.CineTicket.AuthStore.getUser().isLoggedIn, true);

  await sandbox.CineTicket.AuthStore.syncSession();
  assert.equal(sandbox.CineTicket.AuthStore.getUser().isLoggedIn, false);
  assert.equal(sandbox.CineTicket.AuthStore.getUser().userName, 'Guest');

  serverAuth = true;
  await sandbox.CineTicket.AuthStore.syncSession();
  assert.equal(sandbox.CineTicket.AuthStore.getUser().isLoggedIn, true);
  assert.equal(sandbox.CineTicket.AuthStore.getUser().userId, 9);
  assert.equal(sandbox.CineTicket.AuthStore.getUser().userName, 'Verified Member');

  await sandbox.CineTicket.AuthStore.logout();
  const afterLogout = sandbox.CineTicket.AuthStore.getUser();
  assert.equal(afterLogout.isLoggedIn, false);
  assert.equal(afterLogout.userId, 0);
});

test('toggleDarkMode toggles html/body classes reversibly, persists preference, and dispatches cinetix:themechange', () => {
  const { sandbox, storage, classes, bodyClasses, windowEvents } = createBrowserSandbox('/pages/homepage.html');
  assert.equal(classes.has('dark-mode'), false);

  sandbox.toggleDarkMode();
  assert.equal(classes.has('dark-mode'), true);
  assert.equal(bodyClasses.has('dark-mode'), true);
  assert.equal(storage.get('darkMode'), 'true');
  assert.equal(windowEvents[windowEvents.length - 1]?.type, 'cinetix:themechange');
  assert.equal(windowEvents[windowEvents.length - 1]?.detail?.isDark, true);

  sandbox.toggleDarkMode();
  assert.equal(classes.has('dark-mode'), false);
  assert.equal(bodyClasses.has('dark-mode'), false);
  assert.equal(storage.get('darkMode'), 'false');
  assert.equal(windowEvents[windowEvents.length - 1]?.detail?.isDark, false);
});

test('showNotification supports both 2-argument and 3-argument call signatures safely', () => {
  const { sandbox, appended } = createBrowserSandbox('/pages/about.html');
  const before = appended.length;

  sandbox.showNotification('Saved successfully', 'success');
  sandbox.showNotification('Custom Title', 'Detailed <script> message', 'warning');

  assert.equal(appended.length, before + 2);
  const secondToast = appended[appended.length - 1];
  assert.ok(secondToast.innerHTML.includes('Custom Title'));
  assert.ok(secondToast.innerHTML.includes('&lt;script&gt;'));
});

test('shared pricing, card expiry validation, star-rating, and fetchJson helpers enforce unified contracts', async () => {
  const { sandbox, fetchCalls } = createBrowserSandbox('/pages/pay.html');
  const CT = sandbox.CineTicket;

  assert.equal(CT.calcGroupDiscount(156, 4), 0);
  assert.equal(CT.calcGroupDiscount(195, 5), 58.5);

  const twoSeats = CT.calculateCheckoutPricing(39, 2, 5);
  assert.equal(twoSeats.subtotal, 78.0);
  assert.equal(twoSeats.groupDiscount, 0);
  assert.equal(twoSeats.promoDiscount, 5.0);
  assert.equal(twoSeats.serviceFee, 2.5);
  assert.equal(twoSeats.totalAmount, 75.5);

  const fiveSeats = CT.calculateCheckoutPricing(39, 5, 5);
  assert.equal(fiveSeats.subtotal, 195.0);
  assert.equal(fiveSeats.groupDiscount, 58.5);
  assert.equal(fiveSeats.totalDiscount, 63.5);
  assert.equal(fiveSeats.totalAmount, 134.0);

  const floored = CT.calculateCheckoutPricing(5, 1, 20);
  assert.equal(floored.totalAmount, 0);

  const refDate = new Date(2026, 10, 24);
  assert.equal(CT.isCardExpiryValid('12/25', refDate), false);
  assert.equal(CT.isCardExpiryValid('10/26', refDate), false);
  assert.equal(CT.isCardExpiryValid('11/26', refDate), true);
  assert.equal(CT.isCardExpiryValid('01/28', refDate), true);
  assert.equal(CT.isCardExpiryValid('13/28', refDate), false);
  assert.equal(CT.isCardExpiryValid('00/28', refDate), false);

  assert.equal(CT.formatStars(4.5), '★★★★½');
  assert.equal(
    CT.renderStarIcons(3.5),
    '<i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star-half-alt"></i><i class="far fa-star"></i>'
  );

  const res = await CT.fetchJson('/index.php/user/user/login', {
    method: 'POST',
    body: { email: 'test@example.com' },
  });
  assert.equal(res.success, true);
  assert.equal(res.httpStatus, 200);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].opts.headers['Content-Type'], 'application/json');
  assert.equal(fetchCalls[0].opts.body, '{"email":"test@example.com"}');
});

test('AdminApp.createTableController and bindCheckControls handle search, filter, sort, pagination, and checklists', () => {
  const { sandbox, domById, makeElement } = createBrowserSandbox('/admin/movies.html');
  const adminCode = fs.readFileSync(path.join(ROOT, 'public/js/admin/admin.js'), 'utf8');
  vm.runInNewContext(adminCode, sandbox);

  const searchInput = makeElement('input');
  const filterSelect = makeElement('select');
  const sortSelect = makeElement('select');
  const countSpan = makeElement('span');
  const pagerDiv = makeElement('div');
  const toolbar = makeElement('div');
  toolbar.querySelector = (sel) => {
    if (sel === '.toolbar-search') return searchInput;
    if (sel === '[data-role="filter"]') return filterSelect;
    if (sel === '[data-role="sort"]') return sortSelect;
    if (sel === '[data-role="count"]') return countSpan;
    if (sel === '[data-role="pager"]') return pagerDiv;
    return null;
  };
  const tbody = makeElement('tbody');
  domById.set('test-toolbar', toolbar);
  domById.set('test-tbody', tbody);

  const ctrl = sandbox.AdminApp.createTableController({
    toolbarId: 'test-toolbar',
    tbodyId: 'test-tbody',
    pageSize: 2,
    colSpan: 3,
    filters: [{ value: 'all', label: 'All' }, { value: 'Sci-Fi', label: 'Sci-Fi' }],
    sorts: [
      { key: 'id_asc', label: 'ID', compare: (a, b) => a.id - b.id },
      { key: 'rating_desc', label: 'Rating', compare: (a, b) => b.rating - a.rating },
    ],
    searchText: (item) => item.title,
    matchFilter: (item, f) => item.genre === f,
    renderRow: (item) => `<tr><td>${item.title}</td></tr>`,
  });

  ctrl.setItems([
    { id: 1, title: 'Alpha', genre: 'Action', rating: 4.2 },
    { id: 2, title: 'Interstellar', genre: 'Sci-Fi', rating: 4.9 },
    { id: 3, title: 'Arrival', genre: 'Sci-Fi', rating: 4.7 },
  ]);

  assert.equal(countSpan.textContent, '3 records');
  assert.ok(tbody.innerHTML.includes('Alpha') && tbody.innerHTML.includes('Interstellar'));
  assert.ok(!tbody.innerHTML.includes('Arrival'));

  filterSelect.trigger('change', { target: { value: 'Sci-Fi' } });
  assert.ok(countSpan.textContent.includes('2 of 2'));
  assert.ok(tbody.innerHTML.includes('Interstellar') && tbody.innerHTML.includes('Arrival'));

  searchInput.trigger('input', { target: { value: 'arr' } });
  assert.ok(tbody.innerHTML.includes('Arrival') && !tbody.innerHTML.includes('Interstellar'));

  const checkboxes = [{ value: '1', checked: false }, { value: '3', checked: false }];
  const grid = {
    querySelectorAll: (sel) => (sel.includes(':checked') ? checkboxes.filter((c) => c.checked) : checkboxes),
  };
  const btnAll = makeElement('button');
  const btnClear = makeElement('button');
  domById.set('sel-all', btnAll);
  domById.set('clr-all', btnClear);

  sandbox.AdminApp.bindCheckControls(grid, 'sel-all', 'clr-all');
  btnAll.trigger('click');
  assert.deepEqual(Array.from(sandbox.AdminApp.getCheckedIds(grid)), [1, 3]);
  btnClear.trigger('click');
  assert.deepEqual(Array.from(sandbox.AdminApp.getCheckedIds(grid)), []);
});
