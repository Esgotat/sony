/* ============================================================
ХРАНИЛИЩЕ + ЕДИНАЯ СИНХРОНИЗАЦИЯ ВСЕХ ДАННЫХ (Firebase через функцию).
Андреев удалён навсегда; кафедра-шаблон исключена из базы.
============================================================ */
const hashPass = (p) => btoa(unescape(encodeURIComponent(p)));
const _ts = () => Date.now();

/* ---------- СЛИЯНИЕ СОСТОЯНИЙ ---------- */
function mergeKeyOf(k, item) {
  if (item == null) return 'null';
  if (typeof item !== 'object') return 'v:' + String(item);
  if (item.id != null) return 'i:' + item.id;
  if (item.n != null) return 'n:' + item.n;
  return 'j:' + JSON.stringify(item);
}
function mergeListByKey(k, a, b) {
  const m = new Map();
  (a || []).forEach((x) => m.set(mergeKeyOf(k, x), x));
  (b || []).forEach((x) => {
    const key = mergeKeyOf(k, x);
    const ex = m.get(key);
    if (!ex || ((x && x._ts) || 0) > ((ex && ex._ts) || 0)) m.set(key, x);
  });
  return Array.from(m.values());
}
function mergeObjByKey(k, a, b) {
  const o = {};
  new Set([].concat(Object.keys(a), Object.keys(b))).forEach((id) => {
    const x = a[id], y = b[id];
    if (x === undefined) { o[id] = y; return; }
    if (y === undefined) { o[id] = x; return; }
    if (Array.isArray(x) || Array.isArray(y)) { o[id] = mergeListByKey(k, Array.isArray(x) ? x : [], Array.isArray(y) ? y : []); return; }
    o[id] = ((y && y._ts) || 0) > ((x && x._ts) || 0) ? y : x;
  });
  return o;
}
function mergeState(a, b) {
  const out = {};
  const keys = new Set([].concat(Object.keys(a || {}), Object.keys(b || {})));
  keys.forEach((k) => {
    if (k === 'ou_session') return;
    const av = a ? a[k] : undefined;
    const bv = b ? b[k] : undefined;
    if (av === undefined) { out[k] = bv; return; }
    if (bv === undefined) { out[k] = av; return; }
    if (Array.isArray(av) || Array.isArray(bv)) { out[k] = mergeListByKey(k, Array.isArray(av) ? av : [], Array.isArray(bv) ? bv : []); return; }
    if (typeof av === 'object' && av && typeof bv === 'object' && bv) {
      if (k.indexOf('ou_profile_') === 0) {
        const newer = ((bv && bv._ts) || 0) > ((av && av._ts) || 0) ? bv : av;
        const older = newer === bv ? av : bv;
        out[k] = Object.assign({}, older, newer);
      } else {
        out[k] = mergeObjByKey(k, av, bv);
      }
      return;
    }
    out[k] = av;
  });
  return out;
}
/* удалённые пользователи не воскрешаются синхронизацией */
function applyUserDeletes(state) {
  const del = state.ou_users_deleted || [];
  if (!del.length || !Array.isArray(state.ou_users)) return state;
  state.ou_users = state.ou_users.filter((u) => !del.some((d) => d.id === u.id || d.email === u.email));
  return state;
}

/* удалённые сообщения не воскрешаются синхронизацией */
function applyMessageDeletes(state) {
  const del = state.ou_messages_deleted || [];
  if (!del.length || !Array.isArray(state.ou_messages)) return state;
  state.ou_messages = state.ou_messages.filter((m) => !del.includes(m.id));
  return state;
}

/* ---------- ОБЛАКО ---------- */
const CloudSync = {
  url: '/.netlify/functions/sync',
  get ok() { return this.url.length > 3; },
  silent: false,
  timer: null,
  readLocal() {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf('ou_') !== 0 || k === 'ou_session') continue;
      try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
    }
    return o;
  },
  strip(state) {
    const clean = JSON.parse(JSON.stringify(state));
    ['ou_local_pubs', 'ou_local_translations'].forEach((k) => {
      (clean[k] || []).forEach((x) => { if (x && x.fileData) delete x.fileData; });
    });
    return clean;
  },
  writeAll(state) {
    this.silent = true;
    Object.keys(state).forEach((k) => {
      try { localStorage.setItem(k, JSON.stringify(state[k])); } catch (e) {}
    });
    this.silent = false;
  },
  async load() {
    if (!this.ok) return;
    try {
      const r = await fetch(this.url, { cache: 'no-cache' });
      if (!r.ok) return;
      const cloud = await r.json();
      if (!cloud || typeof cloud !== 'object' || Array.isArray(cloud)) return;
      this.writeAll(applyMessageDeletes(applyUserDeletes(mergeState(this.readLocal(), cloud))));
      this.schedulePush();
    } catch (e) { /* офлайн */ }
  },
  schedulePush() {
    if (!this.ok || this.silent) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 700);
  },
  async push() {
    if (!this.ok || this.silent) return;
    try {
      let merged = this.readLocal();
      try {
        const r = await fetch(this.url, { cache: 'no-cache' });
        if (r.ok) merged = mergeState(merged, (await r.json()) || {});
      } catch (e) {}
      merged = this.strip(applyMessageDeletes(applyUserDeletes(merged)));
      await fetch(this.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      });
      this.writeAll(merged);
    } catch (e) {}
  },
  pushNow() {
    if (!this.ok || this.silent) return;
    try {
      fetch(this.url, {
        method: 'PUT',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.strip(applyMessageDeletes(applyUserDeletes(this.readLocal()))))
      });
    } catch (e) {}
  }
};

(function () {
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (typeof k === 'string' && k.indexOf('ou_') === 0 && k !== 'ou_session') CloudSync.schedulePush();
  };
  window.addEventListener('pagehide', () => CloudSync.pushNow());
  window.addEventListener('beforeunload', () => CloudSync.pushNow());
})();

/* ---------- АККАУНТЫ (с «могилой» удалённых) ---------- */
const LocalUsers = {
  KEY: 'ou_users',
  DEL: 'ou_users_deleted',
  list() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
  deleted() { try { return JSON.parse(localStorage.getItem(this.DEL)) || []; } catch (e) { return []; } },
  add(u) { u._ts = _ts(); const l = this.list(); l.push(u); localStorage.setItem(this.KEY, JSON.stringify(l)); },
  findByEmail(email) { return this.list().find((u) => u.email === email); },
  byId(id) { return this.list().find((u) => u.id === id); },
  update(id, patch) {
    patch._ts = _ts();
    const l = this.list();
    const i = l.findIndex((u) => u.id === id);
    if (i > -1) { l[i] = Object.assign(l[i], patch); localStorage.setItem(this.KEY, JSON.stringify(l)); }
  },
  remove(id) {
    const l = this.list();
    const i = l.findIndex((u) => u.id === id);
    if (i > -1) {
      const u = l[i];
      l.splice(i, 1);
      const d = this.deleted();
      d.push({ id: u.id, email: u.email });
      localStorage.setItem(this.KEY, JSON.stringify(l));
      localStorage.setItem(this.DEL, JSON.stringify(d));
    }
  },
  nextId(existingMax) {
    return Math.max(existingMax, ...this.list().map((u) => u.id)) + 1;
  }
};

const Session = {
  KEY: 'ou_session',
  get() { const v = +(localStorage.getItem(this.KEY) || -1); return isNaN(v) ? -1 : v; },
  set(id) { localStorage.setItem(this.KEY, id); },
  clear() { localStorage.removeItem(this.KEY); }
};

/* ---------- КАФЕДРЫ ---------- */
const LocalDepts = {
  KEY: 'ou_local_depts', DEL: 'ou_depts_deleted', OVR: 'ou_dept_overrides',
  _get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch (e) { return fb; } },
  list() { return this._get(this.KEY, []); },
  overrides() { return this._get(this.OVR, {}); },
  add(rec) { rec._ts = _ts(); const l = this.list(); l.push(rec); localStorage.setItem(this.KEY, JSON.stringify(l)); },
  update(n, patch) {
    patch._ts = _ts();
    const l = this.list();
    const i = l.findIndex((d) => d.n === n);
    if (i > -1) { l[i] = Object.assign(l[i], patch); localStorage.setItem(this.KEY, JSON.stringify(l)); }
    else { const o = this.overrides(); o[n] = Object.assign(o[n] || {}, patch); localStorage.setItem(this.OVR, JSON.stringify(o)); }
  },
  deleted() { return this._get(this.DEL, []); },
  remove(n) {
    const l = this.list();
    const i = l.findIndex((d) => d.n === n);
    if (i > -1) { l.splice(i, 1); localStorage.setItem(this.KEY, JSON.stringify(l)); }
    else {
      const d = this.deleted();
      if (!d.includes(n)) { d.push(n); localStorage.setItem(this.DEL, JSON.stringify(d)); }
    }
  },
  nextN(baseMax) {
    return Math.max(baseMax || 0, ...this.list().map((d) => d.n), 99) + 1;
  }
};

/* ---------- ПРАВКИ ЛЮДЕЙ ---------- */
const LocalPeopleOvr = {
  KEY: 'ou_people_overrides',
  _get() { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { return {}; } },
  get(id) { return this._get()[id] || {}; },
  update(id, patch) {
    patch._ts = _ts();
    const o = this._get();
    o[id] = Object.assign(o[id] || {}, patch);
    localStorage.setItem(this.KEY, JSON.stringify(o));
  }
};

/* ---------- ЗНАКОМЫЕ ---------- */
const LocalFriends = {
  key: () => 'ou_friends_' + USER.id,
  list() { try { return JSON.parse(localStorage.getItem(this.key())) || []; } catch (e) { return []; } },
  has(id) { return this.list().includes(id); },
  add(id) {
    const l = this.list();
    if (!l.includes(id)) { l.push(id); localStorage.setItem(this.key(), JSON.stringify(l)); }
  },
  remove(id) {
    localStorage.setItem(this.key(), JSON.stringify(this.list().filter((x) => x !== id)));
  }
};

/* ---------- СООБЩЕНИЯ (с «могилой» удалённых) ---------- */
const LocalMessages = {
  KEY: 'ou_messages',
  DEL: 'ou_messages_deleted',
  list() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
  deleted() { try { return JSON.parse(localStorage.getItem(this.DEL)) || []; } catch (e) { return []; } },
  add(m) { m._ts = _ts(); const l = this.list(); l.push(m); localStorage.setItem(this.KEY, JSON.stringify(l)); },
  update(id, patch) {
    const l = this.list();
    const i = l.findIndex((m) => m.id === id);
    if (i > -1) { Object.assign(l[i], patch, { _edited: _ts() }); localStorage.setItem(this.KEY, JSON.stringify(l)); }
  },
  remove(id) {
    localStorage.setItem(this.KEY, JSON.stringify(this.list().filter((m) => m.id !== id)));
    const d = this.deleted();
    if (!d.includes(id)) { d.push(id); localStorage.setItem(this.DEL, JSON.stringify(d)); }
  },
  between(a, b) {
    return this.list()
      .filter((m) => (m.from === a && m.to === b) || (m.from === b && m.to === a))
      .sort((x, y) => (x._ts || 0) - (y._ts || 0));
  }
};

/* демо-аккаунт: ТОЛЬКО админ. Андреев больше не создаётся. */
(function seedUsers() {
  const list = LocalUsers.list();
  const del = LocalUsers.deleted();
  const gone = (email) => del.some((x) => x.email === email);
  if (!list.find((u) => u.email === 'admin@ou.ru') && !gone('admin@ou.ru')) {
    LocalUsers.add({
      id: 99999, name: "Администратор системы", short: "Админ",
      email: "admin@ou.ru", pass: hashPass("admin"),
      dept: null, deg: null, roles: ["adm"],
      note: "Администратор Open University", years: 0, balance: 0,
      interests: [], experience: "Полный доступ ко всем данным: пользователи, кафедры, публикации."
    });
  }
})();

/* принудительно вычищаем Андреева: из localStorage и из «могилы» не достаём */
(function purgeAndreev() {
  const ex = LocalUsers.list().find((u) => u.id === 0 || u.email === 'andreev@ou.ru');
  if (ex) { LocalUsers.remove(ex.id); return; }
  const d = LocalUsers.deleted();
  if (!d.some((x) => x.id === 0 || x.email === 'andreev@ou.ru')) {
    d.push({ id: 0, email: 'andreev@ou.ru' });
    localStorage.setItem(LocalUsers.DEL, JSON.stringify(d));
  }
})();

/* текущий пользователь */
function refreshCurrentUser() {
  const u = LocalUsers.byId(Session.get());
  if (u) {
    const clean = Object.assign({}, u);
    delete clean.pass;
    clean.guest = false;
    USER = clean;
  }
}
(function resolveUser() {
  let u = LocalUsers.byId(Session.get());
  if (u) {
    if (u.balance == null) { LocalUsers.update(u.id, { balance: 10 }); }
    refreshCurrentUser();
  }
})();

/* ---------- ПУБЛИКАЦИИ ---------- */
const LocalPubs = {
  KEY: 'ou_local_pubs', OVR: 'ou_pub_overrides', DEL: 'ou_pub_deleted',
  _get(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch (e) { return fb; } },
  list() { return this._get(this.KEY, []); },
  add(rec) { rec._ts = _ts(); const l = this.list(); l.push(rec); localStorage.setItem(this.KEY, JSON.stringify(l)); },
  overrides() { return this._get(this.OVR, {}); },
  update(id, patch) {
    patch._ts = _ts();
    const l = this.list();
    const i = l.findIndex((p) => p.id === id);
    if (i > -1) { l[i] = Object.assign(l[i], patch); localStorage.setItem(this.KEY, JSON.stringify(l)); }
    else { const o = this.overrides(); o[id] = Object.assign(o[id] || {}, patch); localStorage.setItem(this.OVR, JSON.stringify(o)); }
  },
  deleted() { return this._get(this.DEL, []); },
  remove(id) {
    const l = this.list(); const i = l.findIndex((p) => p.id === id);
    if (i > -1) { l.splice(i, 1); localStorage.setItem(this.KEY, JSON.stringify(l)); }
    else { const d = this.deleted(); if (!d.includes(id)) { d.push(id); localStorage.setItem(this.DEL, JSON.stringify(d)); } }
  }
};

const LocalProfile = {
  key: () => 'ou_profile_' + USER.id,
  get() { try { return JSON.parse(localStorage.getItem(this.key())) || {}; } catch (e) { return {}; } },
  save(patch) { patch._ts = _ts(); localStorage.setItem(this.key(), JSON.stringify(Object.assign(this.get(), patch))); },
  reset() { localStorage.removeItem(this.key()); }
};

const LocalComments = {
  KEY: 'ou_comments',
  list() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
  add(rec) { rec._ts = _ts(); const l = this.list(); l.push(rec); localStorage.setItem(this.KEY, JSON.stringify(l)); }
};

const LocalTranslations = {
  KEY: 'ou_local_translations',
  list() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
  add(rec) { rec._ts = _ts(); const l = this.list(); l.push(rec); localStorage.setItem(this.KEY, JSON.stringify(l)); }
};

const LocalRequests = {
  KEY: 'ou_local_requests',
  list() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
  add(rec) { rec._ts = _ts(); const l = this.list(); l.push(rec); localStorage.setItem(this.KEY, JSON.stringify(l)); }
};

const LocalCheckReviews = {
  KEY: 'ou_check_reviews',
  _get() { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { return {}; } },
  list(reqId) { return this._get()[reqId] || []; },
  add(reqId, rev) {
    rev._ts = _ts();
    const o = this._get();
    o[reqId] = (o[reqId] || []).concat(rev);
    localStorage.setItem(this.KEY, JSON.stringify(o));
  }
};

/* ---------- ФАЙЛЫ В ОБЛАКЕ ---------- */
const CloudFiles = {
  base: '/.netlify/functions/sync',
  upload(key, data) {
    try {
      fetch(this.base + '?file=' + encodeURIComponent(key), {
        method: 'PUT',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: data.fileData, fileName: data.fileName, _ts: Date.now() })
      });
    } catch (e) {}
  },
  async download(key) {
    try {
      const r = await fetch(this.base + '?file=' + encodeURIComponent(key), { cache: 'no-cache' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }
};

/* ---------- ЗАГРУЗКА БАЗЫ ---------- */
const Store = {
  depts: null, people: null, pubs: null, reviews: null, translations: null, requests: null,
  _cache: {},
  _load(name, file) {
    if (!this._cache[name]) {
      this._cache[name] = fetch('data/' + file, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + file); return r.json(); });
    }
    return this._cache[name];
  },
  loadAll() {
    return CloudSync.load().catch(() => {}).then(() => Promise.all([
      this._load('depts', 'departments.json'),
      this._load('people', 'people.json'),
      this._load('pubs', 'publications.json'),
      this._load('reviews', 'reviews.json'),
      this._load('translations', 'translations.json'),
      this._load('requests', 'requests.json')
    ]).then(([depts, people, pubs, reviews, translations, requests]) => {
      refreshCurrentUser();
      const delP = LocalPubs.deleted();
      const ovrP = LocalPubs.overrides();
      const delD = LocalDepts.deleted();
      const ovrD = LocalDepts.overrides();
      const ovrPeople = LocalPeopleOvr._get();
      const delU = LocalUsers.deleted();
      const userGone = (u) => delU.some((d) => d.id === u.id || d.email === u.email);
      /* кафедры: база БЕЗ шаблона (tpl) и без удалённых + созданные */
      this.depts = depts
        .filter((d) => !d.tpl && !delD.includes(d.n))
        .concat(LocalDepts.list().filter((d) => !delD.includes(d.n)))
        .map((d) => (ovrD[d.n] ? Object.assign({}, d, ovrD[d.n]) : d));
      this.people = people.concat(LocalUsers.list().map((u) => {
        const c = Object.assign({}, u);
        delete c.pass;
        return c;
      })).filter((p) => !userGone(p))
        .map((p) => (ovrPeople[p.id] ? Object.assign({}, p, ovrPeople[p.id]) : p));
      this.pubs = pubs
        .filter((p) => !delP.includes(p.id))
        .map((p) => (ovrP[p.id] ? Object.assign({}, p, ovrP[p.id]) : p))
        .concat(LocalPubs.list().filter((p) => !delP.includes(p.id)));
      this.reviews = reviews;
      this.translations = translations.concat(LocalTranslations.list());
      this.requests = requests.concat(LocalRequests.list());
      this.requests.filter((r) => r.type === 'check').forEach((r) => {
        const all = (r.reviews || []).concat(LocalCheckReviews.list(r.id));
        const byReviewer = new Map();
        all.forEach((v) => {
          const ex = byReviewer.get(v.reviewer);
          if (!ex || ((v._ts || 0) >= (ex._ts || 0))) byReviewer.set(v.reviewer, v);
        });
        r._revs = Array.from(byReviewer.values());
        r._done = r._revs.length >= r.need;
        if (r._done) {
          const pos = r._revs.filter((v) => v.verdict === 'pos').length;
          const neg = r._revs.filter((v) => v.verdict === 'neg').length;
          const fix = r._revs.filter((v) => v.verdict === 'fix').length;
          r._result = (pos > neg && pos > fix) ? 'ok' : (neg > pos && neg >= fix) ? 'no' : 'fix';
          const pub = this.pubs.find((p) => p.id === r.pubId);
          if (pub) pub.status = r._result;
        }
      });
      return this;
    }));
  }
};