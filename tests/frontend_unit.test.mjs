import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function createBrowserSandbox(pathname = '/pages/homepage.html') {
  const storage = new Map();
  const classes = new Set();
  const bodyClasses = new Set();
  const appended = [];
  const fetchCalls = [];

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

  const makeElement = (tag) => ({
    tagName: tag.toUpperCase(),
    id: '',
    rel: '',
    href: '',
    className: '',
    innerHTML: '',
    parentNode: { removeChild: () => {} },
    remove() {
      this.removed = true;
    },
    querySelector: () => ({ addEventListener: () => {} }),
    addEventListener: () => {},
  });

  const sandbox = {
    window: null,
    FormData: class FormData {},
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear(),
    },
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { json: async () => ({ success: true }) };
    },
    setTimeout: (fn) => fn,
    clearTimeout: () => {},
    document: {
      documentElement: { classList: makeClassList(classes) },
      body: {
        classList: makeClassList(bodyClasses),
        appendChild: (el) => appended.push(el),
      },
      head: {
        appendChild: (el) => appended.push(el),
      },
      getElementById: () => null,
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
  return { sandbox, storage, classes, bodyClasses, appended, fetchCalls };
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

test('AuthStore persists user identity without storing passwords and clears state on logout', async () => {
  const { sandbox, storage } = createBrowserSandbox('/pages/homepage.html');
  storage.set('pwd', 'legacy-secret');

  sandbox.CineTicket.AuthStore.setUser({
    user_id: 7,
    user_name: 'Alice Tan',
    email: 'alice@example.com',
  });

  assert.equal(storage.has('pwd'), false);
  const user = sandbox.CineTicket.AuthStore.getUser();
  assert.equal(user.isLoggedIn, true);
  assert.equal(user.userId, 7);
  assert.equal(user.userName, 'Alice Tan');

  await sandbox.CineTicket.AuthStore.logout();
  const afterLogout = sandbox.CineTicket.AuthStore.getUser();
  assert.equal(afterLogout.isLoggedIn, false);
  assert.equal(afterLogout.userId, 0);
  assert.equal(afterLogout.userName, 'Guest');
});

test('toggleDarkMode toggles html/body classes reversibly and persists preference', () => {
  const { sandbox, storage, classes, bodyClasses } = createBrowserSandbox('/pages/homepage.html');
  assert.equal(classes.has('dark-mode'), false);

  sandbox.toggleDarkMode();
  assert.equal(classes.has('dark-mode'), true);
  assert.equal(bodyClasses.has('dark-mode'), true);
  assert.equal(storage.get('darkMode'), 'true');

  sandbox.toggleDarkMode();
  assert.equal(classes.has('dark-mode'), false);
  assert.equal(bodyClasses.has('dark-mode'), false);
  assert.equal(storage.get('darkMode'), 'false');
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

test('shared pricing, star-rating, and fetchJson helpers enforce unified contracts', async () => {
  const { sandbox, fetchCalls } = createBrowserSandbox('/pages/pay.html');
  const CT = sandbox.CineTicket;

  assert.equal(CT.calcGroupDiscount(156, 4), 0);
  assert.equal(CT.calcGroupDiscount(195, 5), 58.5);
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
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].opts.headers['Content-Type'], 'application/json');
  assert.equal(fetchCalls[0].opts.body, '{"email":"test@example.com"}');
});
