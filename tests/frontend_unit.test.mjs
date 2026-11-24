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
  const windowListeners = new Map();
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
    const elClasses = new Set();
    const children = [];
    return {
      tagName: tag.toUpperCase(),
      id: '',
      rel: '',
      href: '',
      value: '',
      download: '',
      checked: false,
      disabled: false,
      className: '',
      innerHTML: '',
      textContent: '',
      options: children,
      classList: makeClassList(elClasses),
      parentNode: { removeChild: () => {} },
      appendChild(child) {
        children.push(child);
        return child;
      },
      click() {
        this.clicked = true;
      },
      focus() {
        this.focused = true;
      },
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
    TextEncoder: TextEncoder,
    URLSearchParams: URLSearchParams,
    Blob: class Blob {
      constructor(parts, opts) {
        this.parts = parts;
        this.type = opts?.type || '';
      }
    },
    URL: {
      createObjectURL: (blob) => {
        sandbox.__lastBlob = blob;
        return 'blob:cinetix-test';
      },
      revokeObjectURL: () => {},
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail || null;
      }
    },
    FormData: class FormData {},
    confirm: () => true,
    print: () => {
      sandbox.__printed = true;
    },
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
    addEventListener: (ev, fn) => {
      const arr = windowListeners.get(ev) || [];
      arr.push(fn);
      windowListeners.set(ev, arr);
    },
    dispatchEvent: (ev) => {
      windowEvents.push(ev);
      (windowListeners.get(ev.type) || []).forEach((fn) => fn(ev));
    },
    document: {
      documentElement: { classList: makeClassList(classes) },
      body: {
        classList: makeClassList(bodyClasses),
        appendChild: (el) => appended.push(el),
      },
      head: {
        appendChild: (el) => appended.push(el),
      },
      activeElement: null,
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
  return { sandbox, storage, classes, bodyClasses, appended, fetchCalls, windowEvents, windowListeners, domById, makeElement };
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
  const { sandbox, storage, windowEvents } = createBrowserSandbox('/pages/homepage.html', async () => ({
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
  assert.ok(windowEvents.some((e) => e.type === 'cinetix:authchange'));

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

test('shared pricing, card expiry, Gregorian calendar date, email validation, and fetchJson helpers enforce unified contracts', async () => {
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

  assert.equal(CT.toIsoDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.match(CT.todayIso(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(CT.isValidIsoDate('2024-02-29'), true);
  assert.equal(CT.isValidIsoDate('2026-02-29'), false);
  assert.equal(CT.isValidIsoDate('2026-04-31'), false);
  assert.equal(CT.isValidIsoDate('not-a-date'), false);

  assert.equal(CT.isValidEmail('member@example.com'), true);
  assert.equal(CT.isValidEmail('bad-email'), false);
  assert.equal(CT.isValidEmail('a@' + 'b'.repeat(105) + '.com'), false);

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

test('cross-tab storage listener syncs darkMode and customer auth state across tabs', () => {
  const { storage, classes, windowEvents, windowListeners } = createBrowserSandbox('/pages/homepage.html');
  const storageHandlers = windowListeners.get('storage') || [];
  assert.ok(storageHandlers.length >= 1);

  storage.set('darkMode', 'true');
  storageHandlers.forEach((fn) => fn({ key: 'darkMode' }));
  assert.equal(classes.has('dark-mode'), true);

  storage.set('userToken', 'authenticated');
  storage.set('userId', '1');
  storage.set('userName', 'LI JIAQI');
  const beforeLen = windowEvents.length;
  storageHandlers.forEach((fn) => fn({ key: 'userToken' }));
  assert.ok(windowEvents.slice(beforeLen).some((e) => e.type === 'cinetix:authchange' && e.detail?.userId === 1));
});

test('AdminApp.createTableController, populateUserSelect, ensureSelectOption, and downloadCsv handle reset, bulk actions, and CSV export', async () => {
  const deletedIds = [];
  const { sandbox, storage, domById, makeElement } = createBrowserSandbox('/admin/movies.html', async (url, opts) => {
    const parsed = JSON.parse(opts.body);
    deletedIds.push(parsed.id);
    return { status: 200, json: async () => ({ success: true }) };
  });
  storage.set('adminToken', 'csrf-token-123');
  const adminCode = fs.readFileSync(path.join(ROOT, 'public/js/admin/admin.js'), 'utf8');
  vm.runInNewContext(adminCode, sandbox);

  const searchInput = makeElement('input');
  const filterSelect = makeElement('select');
  const sortSelect = makeElement('select');
  const resetBtn = makeElement('button');
  const bulkBtn = makeElement('button');
  const exportBtn = makeElement('button');
  const printBtn = makeElement('button');
  const countSpan = makeElement('span');
  const pagerDiv = makeElement('div');
  const toolbar = makeElement('div');
  toolbar.querySelector = (sel) => {
    if (sel === '.toolbar-search') return searchInput;
    if (sel === '[data-role="filter"]') return filterSelect;
    if (sel === '[data-role="sort"]') return sortSelect;
    if (sel === '[data-role="reset"]') return resetBtn;
    if (sel === '[data-role="bulk"]') return bulkBtn;
    if (sel === '[data-role="export"]') return exportBtn;
    if (sel === '[data-role="print"]') return printBtn;
    if (sel === '[data-role="count"]') return countSpan;
    if (sel === '[data-role="pager"]') return pagerDiv;
    return null;
  };

  let rowChecks = [];
  const checkAll = makeElement('input');
  const tbody = makeElement('tbody');
  tbody.closest = () => ({ querySelector: () => checkAll });
  tbody.querySelectorAll = (sel) => (sel === '.row-check' ? rowChecks : []);
  domById.set('test-toolbar', toolbar);
  domById.set('test-tbody', tbody);

  const ctrl = sandbox.AdminApp.createTableController({
    toolbarId: 'test-toolbar',
    tbodyId: 'test-tbody',
    pageSize: 2,
    colSpan: 4,
    filters: [{ value: 'all', label: 'All' }, { value: 'Sci-Fi', label: 'Sci-Fi' }],
    sorts: [
      { key: 'id_asc', label: 'ID', compare: (a, b) => a.id - b.id },
      { key: 'rating_desc', label: 'Rating', compare: (a, b) => b.rating - a.rating },
    ],
    bulkAction: {
      label: 'Delete Selected',
      endpoint: '/index.php/admin/movie/delete',
      idKey: 'id',
    },
    exportCsv: {
      filename: 'movies.csv',
      headers: ['ID', 'Title'],
      row: (item) => [item.id, item.title],
    },
    searchText: (item) => item.title,
    matchFilter: (item, f) => item.genre === f,
    renderRow: (item) => `<tr><td>${item.title}</td></tr>`,
  });

  rowChecks = [makeElement('input'), makeElement('input')];
  rowChecks[0].value = '1';
  rowChecks[1].value = '2';

  ctrl.setItems([
    { id: 1, title: 'Alpha, "Director\'s Cut"', genre: 'Action', rating: 4.2 },
    { id: 2, title: 'Interstellar', genre: 'Sci-Fi', rating: 4.9 },
    { id: 3, title: 'Arrival', genre: 'Sci-Fi', rating: 4.7 },
  ]);

  assert.equal(countSpan.textContent, '3 records');
  assert.equal(resetBtn.classList.contains('is-hidden'), true);

  filterSelect.trigger('change', { target: { value: 'Sci-Fi' } });
  assert.equal(resetBtn.classList.contains('is-hidden'), false);
  assert.ok(tbody.innerHTML.includes('Interstellar') && tbody.innerHTML.includes('Arrival'));

  resetBtn.trigger('click');
  assert.equal(countSpan.textContent, '3 records');
  assert.equal(resetBtn.classList.contains('is-hidden'), true);

  checkAll.checked = true;
  checkAll.trigger('change');
  assert.equal(bulkBtn.classList.contains('is-hidden'), false);
  await bulkBtn.trigger('click', { currentTarget: bulkBtn });
  assert.deepEqual(deletedIds, ['1', '2']);

  exportBtn.trigger('click');
  const csvBody = sandbox.__lastBlob.parts[0];
  assert.ok(csvBody.includes('"Alpha, ""Director\'s Cut"""'));

  const userSel = makeElement('select');
  sandbox.AdminApp.populateUserSelect(userSel, [{ user_code: 5, user_name: 'Jane', email: 'j@e.com' }], 5);
  assert.equal(userSel.value, '5');
  assert.equal(userSel.options.length, 1);

  const genreSel = makeElement('select');
  sandbox.AdminApp.ensureSelectOption(genreSel, 'Documentary');
  assert.equal(genreSel.value, 'Documentary');
  assert.equal(genreSel.options.length, 1);
});

test('sanitizeRedirectPath, UTF-8 password byte bounds, parseSeatCodes, activatePill, and renderStateCard enforce security & UI invariants', () => {
  const { sandbox, makeElement } = createBrowserSandbox('/login.html');
  const CT = sandbox.CineTicket;

  // Open-redirect defense
  assert.equal(CT.sanitizeRedirectPath('https://evil.example/phish', 'pages/homepage.html'), 'pages/homepage.html');
  assert.equal(CT.sanitizeRedirectPath('//evil.example', 'pages/homepage.html'), 'pages/homepage.html');
  assert.equal(CT.sanitizeRedirectPath('\\\\evil.example', 'pages/homepage.html'), 'pages/homepage.html');
  assert.equal(CT.sanitizeRedirectPath('javascript:alert(1)', 'pages/homepage.html'), 'pages/homepage.html');
  assert.equal(CT.sanitizeRedirectPath('data:text/html,<h1>x</h1>', 'pages/homepage.html'), 'pages/homepage.html');
  assert.equal(CT.sanitizeRedirectPath('pages/booking3.html?movie_code=1', 'pages/homepage.html'), 'pages/booking3.html?movie_code=1');
  assert.equal(CT.sanitizeRedirectPath('/pages/generate_ticket.html', 'pages/homepage.html'), '/pages/generate_ticket.html');

  // UTF-8 byte ceiling (19 x 4-byte emoji = 76 UTF-8 bytes even though .length is 38)
  assert.equal(CT.isValidPasswordBytes('short'), false);
  assert.equal(CT.isValidPasswordBytes('x'.repeat(72)), true);
  assert.equal(CT.isValidPasswordBytes('x'.repeat(73)), false);
  assert.equal(CT.utf8ByteLength('🎬'.repeat(19)), 76);
  assert.equal(CT.isValidPasswordBytes('🎬'.repeat(19)), false);

  // Canonical natural seat code parsing, deduplication & invalid filtering
  assert.deepEqual(
    Array.from(CT.parseSeatCodes('d10, a2, D2, Z9, A13, d2, b1', 10)),
    ['A2', 'B1', 'D2', 'D10']
  );
  assert.equal(CT.parseSeatCodes('A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12', 10).length, 10);

  // Pill activation + ARIA pressed sync
  const b1 = makeElement('button');
  const b2 = makeElement('button');
  CT.activatePill([b1, b2], b2);
  assert.equal(b1.classList.contains('active'), false);
  assert.equal(b1.getAttribute('aria-pressed'), 'false');
  assert.equal(b2.classList.contains('active'), true);
  assert.equal(b2.getAttribute('aria-pressed'), 'true');

  // State card alert rendering
  const box = makeElement('div');
  let retried = false;
  CT.renderStateCard(box, {
    heading: 'Connection <Error>',
    message: 'Unable to load catalog',
    actionLabel: 'Retry',
    onAction: () => { retried = true; },
    isError: true,
  });
  assert.ok(box.innerHTML.includes('role="alert"'));
  assert.ok(box.innerHTML.includes('is-error-state'));
  assert.ok(box.innerHTML.includes('Connection &lt;Error&gt;'));
  assert.equal(retried, false);
});

test('AdminApp.sanitizeCsvCell neutralizes spreadsheet formula injection and createTableController renders error/retry state', async () => {
  let shouldFail = true;
  const { sandbox, storage, domById, makeElement } = createBrowserSandbox('/admin/offers.html', async () => {
    if (shouldFail) throw new Error('offline');
    return { status: 200, json: async () => ({ success: true, data: [{ id: 7, title: '=CMD|\' /C calc\'!A0' }] }) };
  });
  storage.set('adminToken', 'csrf-token-456');
  const adminCode = fs.readFileSync(path.join(ROOT, 'public/js/admin/admin.js'), 'utf8');
  vm.runInNewContext(adminCode, sandbox);

  const sanitize = sandbox.AdminApp.sanitizeCsvCell;
  assert.equal(sanitize('=1+1'), "'=1+1");
  assert.equal(sanitize('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(sanitize('-2+3'), "'-2+3");
  assert.equal(sanitize('@IMPORTXML("http://x","//a")'), '\'@IMPORTXML(""http://x"",""//a"")"'.startsWith("'") ? '"\'@IMPORTXML(""http://x"",""//a"")"' : '');
  assert.equal(sanitize('  =HYPERLINK("http://evil")'), '"\'  =HYPERLINK(""http://evil"")"');
  assert.equal(sanitize('\t+cmd'), "'\t+cmd");
  assert.equal(sanitize('Frozen 2'), 'Frozen 2');

  const tbody = makeElement('tbody');
  let retryBtn = null;
  tbody.querySelector = (sel) => {
    if (sel === '.retry-table-btn') {
      retryBtn = makeElement('button');
      return retryBtn;
    }
    return null;
  };
  domById.set('err-tbody', tbody);

  const ctrl = sandbox.AdminApp.createTableController({
    endpoint: '/index.php/admin/offer/index',
    tbodyId: 'err-tbody',
    colSpan: 5,
    exportCsv: {
      filename: 'offers.csv',
      headers: ['ID', 'Title'],
      row: (it) => [it.id, it.title],
    },
    renderRow: (it) => `<tr><td>${sandbox.AdminApp.escapeHtml(it.title)}</td></tr>`,
  });

  await ctrl.reload();
  assert.ok(tbody.innerHTML.includes('table-error-state'));
  assert.ok(tbody.innerHTML.includes('Unable to load records:'));
  assert.ok(retryBtn !== null);

  shouldFail = false;
  await retryBtn.trigger('click');
  assert.ok(tbody.innerHTML.includes('=CMD|'));
  assert.ok(!tbody.innerHTML.includes('table-error-state'));
});
