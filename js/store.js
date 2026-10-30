/* ============================================================
ХРАНИЛИЩЕ + СИНХРОНИЗАЦИЯ ЧЕРЕЗ FIREBASE НАПРЯМУЮ
Без серверных функций — работает на любом статическом хостинге.
============================================================ */
const FB = 'https://openuniversity-df24f-default-rtdb.firebaseio.com';
const hashPass = (p) => btoa(unescape(encodeURIComponent(p)));
const _ts = () => Date.now();

/* ---------- ПРЯМОЙ FIREBASE REST API ---------- */
const FBApi = {
  async get(path) {
    const r = await fetch(FB + path + '.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('FB GET ' + r.status);
    return await r.json();
  },
  async put(path, data) {
    const r = await fetch(FB + path + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error('FB PUT ' + r.status);
    return await r.json();
  }
};

/* ---------- СИНХРОНИЗИРУЕМЫЕ КЛЮЧИ ----------
   Всё, что хранится в localStorage с префиксом ou_ и имеет смысл в облаке.
   ou_session (текущий вход) и ou_cloud_prev (локальный снимок облака) —
   НЕ синхронизируются никогда: второй раньше попадал в облако вместе со
   всем состоянием и наращивал бесконечную вложенность (5 МБ за 9 циклов),
   из-за чего база переставала успевать отдаваться и аккаунты «не грузились». */
const SYNC_PREFIX = 'ou_';
const NON_SYNC_KEYS = ['ou_session', 'ou_cloud_prev'];
function isSyncKey(k) {
  return typeof k === 'string' && k.indexOf(SYNC_PREFIX) === 0 && NON_SYNC_KEYS.indexOf(k) < 0;
}

/* ---------- СЛИЯНИЕ СОСТОЯНИЙ ---------- */
function mergeKeyOf(item) {
  if (item == null) return 'null';
  if (typeof item !== 'object') return 'v:' + String(item);
  if (item.id != null) return 'i:' + item.id;
  if (item.n != null) return 'n:' + item.n;
  return 'j:' + JSON.stringify(item);
}

function mergeListByKey(a, b) {
  const m = new Map();
  (a || []).forEach((x) => m.set(mergeKeyOf(x), x));
  (b || []).forEach((x) => {
    const key = mergeKeyOf(x);
    const ex = m.get(key);
    if (!ex || ((x && x._ts) || 0) > ((ex && ex._ts) || 0)) m.set(key, x);
  });
  return Array.from(m.values());
}

/* список-в-объекте: после объезда Firebase REST вместо массива может
   прийти объект {"0":{...},"1":{...}} или дырявый массив [null,{...}] —
   приводим к плоскому списку валидных записей. Именно из-за этого шага
   раньше «пропадали» пользователи: код ждал массив, а получал объект. */
function asList(v) {
  if (Array.isArray(v)) return v.filter((x) => x != null);
  if (v && typeof v === 'object') return Object.keys(v).map((k) => v[k]).filter((x) => x != null);
  return [];
}

/* словарь-в-списке: Firebase REST превращает объект {"5":{...}} в массив
   с дырками и нулями. Возвращаем всегда плоский объект по ключам. */
function asListOrObj(v) {
  const o = {};
  if (Array.isArray(v)) { v.forEach((x, i) => { if (x != null && typeof x === 'object') o[i] = x; }); return o; }
  if (v && typeof v === 'object') return v;
  return o;
}

function mergeObjByKey(a, b) {
  const o = {};
  new Set([].concat(Object.keys(a), Object.keys(b))).forEach((id) => {
    const x = a[id], y = b[id];
    if (x === undefined) { o[id] = y; return; }
    if (y === undefined) { o[id] = x; return; }
    if (Array.isArray(x) || Array.isArray(y)) { o[id] = mergeListByKey(asList(x), asList(y)); return; }
    o[id] = ((y && y._ts) || 0) > ((x && x._ts) || 0) ? y : x;
  });
  return o;
}

function mergeState(a, b) {
  const out = {};
  const keys = new Set([].concat(Object.keys(a || {}), Object.keys(b || {})));
  keys.forEach((k) => {
    if (!isSyncKey(k)) return;
    const av = a ? a[k] : undefined;
    const bv = b ? b[k] : undefined;
    if (av === undefined) { out[k] = bv; return; }
    if (bv === undefined) { out[k] = av; return; }
    if (Array.isArray(av) || Array.isArray(bv)) { out[k] = mergeListByKey(asList(av), asList(bv)); return; }
    if (typeof av === 'object' && av && typeof bv === 'object' && bv) {
      if (k.indexOf('ou_profile_') === 0) {
        const newer = ((bv && bv._ts) || 0) > ((av && av._ts) || 0) ? bv : av;
        const older = newer === bv ? av : bv;
        out[k] = Object.assign({}, older, newer);
      } else {
        out[k] = mergeObjByKey(av, bv);
      }
      return;
    }
    out[k] = av;
  });
  return out;
}

function applyUserDeletes(state) {
  const del = asList(state.ou_users_deleted);
  state.ou_users_deleted = del;
  const users = asList(state.ou_users);
  /* нормализация аккаунтов: id всегда число, email всегда строчными буквами —
     иначе один и тот же человек «теряется» при сравнениях и дублируется */
  state.ou_users = users
    .filter((u) => u && typeof u === 'object' && u.id != null && u.email)
    .map((u) => Object.assign({}, u, { id: +u.id, email: String(u.email).trim().toLowerCase() }))
    .filter((u) => !isNaN(u.id))
    .filter((u) => !del.some((d) => d && (d.id === u.id || (d.email && d.email === u.email))));
  return state;
}

function applyMessageDeletes(state) {
  const del = asList(state.ou_messages_deleted);
  state.ou_messages_deleted = del;
  if (state.ou_messages !== undefined) {
    state.ou_messages = asList(state.ou_messages).filter((m) => m && !del.includes(m.id));
  }
  return state;
}

/* ---------- ОБЛАКО (Firebase напрямую) ---------- */
const CLOUD_PATH = '/state';
const CloudSync = {
  silent: false,
  timer: null,
  pushing: false,
  dirty: false,
  readLocal() {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!isSyncKey(k)) continue;
      try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
    }
    return o;
  },
  /* всё, что уходит в облако: без локальных снимков и без больших base64-приложений */
  strip(state) {
    const clean = {};
    Object.keys(state).forEach((k) => { if (isSyncKey(k)) clean[k] = state[k]; });
    ['ou_local_pubs', 'ou_local_translations'].forEach((k) => {
      asList(clean[k]).forEach((x) => { if (x && x.fileData) delete x.fileData; });
    });
    return clean;
  },
  writeAll(state) {
    this.silent = true;
    Object.keys(state).forEach((k) => {
      if (!isSyncKey(k)) return;
      try { localStorage.setItem(k, JSON.stringify(state[k])); } catch (e) {}
    });
    /* снимок последнего облачного состояния — нужен pushNow(), который не может
       ждать сеть при закрытии страницы (без него last-writer-wins тёр чужие фото) */
    try { localStorage.setItem('ou_cloud_prev', JSON.stringify(this.strip(state))); } catch (e) {}
    this.silent = false;
  },
  prevCloud() {
    try {
      const p = JSON.parse(localStorage.getItem('ou_cloud_prev') || 'null');
      return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
    } catch (e) { return {}; }
  },
  normalize(state) {
    return applyMessageDeletes(applyUserDeletes(state));
  },
  reconcile(local, cloud) {
    let merged = mergeState(local, cloud);
    /* ПРАВКИ ЛЮДЕЙ — сливаем по id, а не целиком */
    {
      const ov = mergeObjByKey(asListOrObj(merged.ou_people_overrides), asListOrObj(cloud.ou_people_overrides));
      [merged, cloud].forEach((src) => {
        Object.keys(ov).forEach((pid) => {
          const layers = [];
          const pr = src['ou_profile_' + pid];
          if (pr && typeof pr === 'object') layers.push(pr);
          const acc = asList(src.ou_users).find((u) => u && String(u.id) === String(pid));
          if (acc && acc.photo) layers.push({ photo: acc.photo, _ts: acc._ts });
          layers.forEach((layer) => {
            Object.keys(layer).forEach((f) => {
              if (f === '_ts' || f === 'id') return;
              if (layer[f] == null || layer[f] === '') return;
              if (ov[pid][f] == null || ov[pid][f] === '' || (layer._ts || 0) >= (ov[pid]._ts || 0)) {
                ov[pid][f] = layer[f];
              }
            });
            if ((layer._ts || 0) > (ov[pid]._ts || 0)) ov[pid]._ts = layer._ts;
          });
        });
      });
      merged.ou_people_overrides = ov;
    }
    /* ФОТО ПРОФИЛЕЙ — общий слой: собираем фото каждого человека из всех
       мест (ou_people_photos, ou_people_overrides, ou_profile_<id>, ou_users)
       и берём самое свежее по _ts. Так аватарку гарантированно видят все. */
    {
      const collectPhotos = (src) => {
        const best = {};
        const put = (id, url, ts) => {
          if (id == null || !url || typeof url !== 'string') return;
          const k = String(id);
          const t = ts || 0;
          if (!best[k] || t >= best[k]._ts) best[k] = { photo: url, _ts: t };
        };
        asList(src.ou_people_photos).forEach((x) => x && put(x.id, x.photo, x._ts));
        Object.keys(asListOrObj(src.ou_people_overrides)).forEach((pid) => {
          const o = src.ou_people_overrides[pid];
          if (o && o.photo) put(pid, o.photo, o._ts);
        });
        Object.keys(src).forEach((k) => {
          if (k.indexOf('ou_profile_') === 0) {
            const p = src[k];
            if (p && p.photo) put(k.slice('ou_profile_'.length), p.photo, p._ts);
          }
        });
        asList(src.ou_users).forEach((u) => u && u.photo && put(u.id, u.photo, u._ts));
        return best;
      };
      const localPhotos = collectPhotos(local);
      const cloudPhotos = collectPhotos(cloud);
      const photoMerged = [];
      new Set([].concat(Object.keys(localPhotos), Object.keys(cloudPhotos))).forEach((id) => {
        const a = localPhotos[id], b = cloudPhotos[id];
        let pick = a && b ? ((b._ts >= a._ts) ? b : a) : (a || b);
        /* фото из override'а человека — authoritative, если оно не старее слоя */
        const o = merged.ou_people_overrides[id];
        if (o && o.photo && (o._ts || 0) >= (pick ? pick._ts : -1)) {
          pick = { photo: o.photo, _ts: (o._ts || 0) };
        }
        if (pick && pick.photo) {
          photoMerged.push({ id: /^\d+$/.test(id) ? Number(id) : id, photo: pick.photo, _ts: pick._ts || _ts() });
        }
      });
      merged.ou_people_photos = photoMerged;
    }
    return this.normalize(merged);
  },
  async load() {
    try {
      const cloud = await FBApi.get(CLOUD_PATH);
      if (!cloud || typeof cloud !== 'object' || Array.isArray(cloud)) return;
      this.writeAll(this.reconcile(this.readLocal(), cloud));
    } catch (e) { /* офлайн — работаем с локальной копией */ }
  },
  schedulePush() {
    if (this.silent) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), 700);
  },
  async push() {
    if (this.silent) return;
    clearTimeout(this.timer);
    if (this.pushing) { this.dirty = true; return; }
    this.pushing = true;
    this.dirty = false;
    try {
      const local = this.readLocal();
      let merged;
      try {
        const cloud = await FBApi.get(CLOUD_PATH);
        merged = (cloud && typeof cloud === 'object' && !Array.isArray(cloud))
          ? this.reconcile(local, cloud)
          : this.reconcile(local, this.prevCloud());
      } catch (e) {
        /* сети нет: сливаем локальное изменение со последним известным снимком облака */
        merged = this.reconcile(local, this.prevCloud());
      }
      const payload = this.strip(merged);
      try {
        await FBApi.put(CLOUD_PATH, payload);
        this.writeAll(payload);
      } catch (e) {
        /* запись не прошла (офлайн/квота) — оставляем изменения в localStorage,
           они уйдут в облако при следующем сохранении или закрытии страницы */
        this.writeAll(merged);
      }
    } finally {
      this.pushing = false;
      if (this.dirty) this.schedulePush();
    }
  },
  pushNow() {
    if (this.silent) return;
    try {
      /* при закрытии страницы тоже сливаем по-человечески (без ожидания сети):
         иначе last-writer-wins затрёт чужие аватарки */
      const merged = this.reconcile(this.readLocal(), this.prevCloud());
      FBApi.put(CLOUD_PATH, this.strip(merged)).catch(() => {});
    } catch (e) {}
  }
};

(function () {
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (isSyncKey(k)) CloudSync.schedulePush();
  };
  window.addEventListener('pagehide', () => CloudSync.pushNow());
  window.addEventListener('beforeunload', () => CloudSync.pushNow());
})();

/* ---------- АККАУНТЫ ---------- */
const LocalUsers = {
  KEY: 'ou_users',
  DEL: 'ou_users_deleted',
  /* все списки читаем через asList: после облачной синхронизации вместо
     массива в localStorage может лежать объект или дырявый массив */
  list() { return asList(this._raw()); },
  _raw() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { return []; } },
  deleted() { return asList(this._rawDel()); },
  _rawDel() { try { return JSON.parse(localStorage.getItem(this.DEL)); } catch (e) { return []; } },
  add(u) { u._ts = _ts(); const l = this.list(); l.push(u); localStorage.setItem(this.KEY, JSON.stringify(l)); },
  /* поиск по email — БЕЗ УЧЁТА РЕГИСТРА: «Иванов@mail.ru» и «ivanov@mail.ru» —
     один и тот же адрес. Сравнение идёт по всей базе (локальной + облачной),
     поэтому зарегистрировать второй аккаунт на занятую почту нельзя. */
  normEmail(email) { return String(email || '').trim().toLowerCase(); },
  findByEmail(email) {
    const e = this.normEmail(email);
    return this.list().find((u) => this.normEmail(u.email) === e);
  },
  /* id сравнение через String(): после облачной синхронизации id может лежать
     как строка, иначе текущий пользователь «не находится» и пропадает из сайта */
  byId(id) { return this.list().find((u) => String(u.id) === String(id)); },
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

/* ---------- ФОТО ПРОФИЛЕЙ (ОБЩИЕ ДАННЫЕ) ----------
   Ключевое отличие от ou_people_overrides: это отдельный синхронизируемый слой,
   где хранятся фото ВСЕХ людей (и демо-коллег из data/people.json, и зарегистрированных).
   В ou_users фото сохранить нельзя — туда попадают только зарегистрированные аккаунты,
   поэтому раньше аватарки «не доезжали» до других пользователей. */
const LocalPeoplePhotos = {
  KEY: 'ou_people_photos',
  list() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
  byId(id) { return this.list().find((x) => x && String(x.id) === String(id)); },
  set(id, photo) {
    const l = this.list();
    const i = l.findIndex((x) => x && String(x.id) === String(id));
    if (i > -1) { l[i].photo = photo; l[i]._ts = _ts(); }
    else { l.push({ id: Number(id) || id, photo: photo, _ts: _ts() }); }
    try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) {}
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
    /* фото профиля — общие данные: держим его в трёх местах, чтобы аватарку
       гарантированно видели другие пользователи:
       1) ou_people_photos — отдельный общий слой (работает и для демо-коллег);
       2) записью пользователя в ou_users (для зарегистрированных аккаунтов);
       3) самим override'ом. */
    if ('photo' in patch) {
      LocalPeoplePhotos.set(id, patch.photo);
      try {
        const ul = LocalUsers.list();
        const ui = ul.findIndex((u) => String(u.id) === String(id));
        if (ui > -1) {
          ul[ui].photo = patch.photo;
          ul[ui]._ts = _ts();
          localStorage.setItem(LocalUsers.KEY, JSON.stringify(ul));
        }
      } catch (e) {}
    }
    localStorage.setItem(this.KEY, JSON.stringify(o));
  }
};
window.LocalPeoplePhotos = LocalPeoplePhotos;

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

/* ---------- СООБЩЕНИЯ ---------- */
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

/* ---------- ВРЕМЕННАЯ МЕТКА УСТАНОВКИ АККАУНТА ----------
   Нужна для корректных уведомлений: сообщения и запросы из общей облачной
   базы, созданные ДО появления аккаунта, не должны считаться непрочитанными.
   Ставится один раз при регистрации (в момент создания аккаунта), хранится
   как обычный синхронизируемый ключ ou_ (переживает чистку кэша браузера). */
const UserInstalled = {
  key: () => 'ou_installed_' + USER.id,
  get() { return +(localStorage.getItem(this.key()) || 0); },
  set(ts) { localStorage.setItem(this.key(), String(ts)); }
};
window.UserInstalled = UserInstalled;

/* демо-аккаунт */
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

(function purgeAndreev() {
  const ex = LocalUsers.list().find((u) => u.id === 0 || u.email === 'andreev@ou.ru');
  if (ex) { LocalUsers.remove(ex.id); return; }
  const d = LocalUsers.deleted();
  if (!d.some((x) => x.id === 0 || x.email === 'andreev@ou.ru')) {
    d.push({ id: 0, email: 'andreev@ou.ru' });
    localStorage.setItem(LocalUsers.DEL, JSON.stringify(d));
  }
})();

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
  add(rec) { rec._ts = _ts(); const l = this.list(); l.push(rec); localStorage.setItem(this.KEY, JSON.stringify(l)); },
  nextId(existingMax) { return Math.max(existingMax || 0, ...this.list().map((r) => r.id)) + 1; }
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

/* ---------- ЖАЛОБЫ (письма администрации) ---------- */
const LocalComplaints = {
  KEY: 'ou_complaints',
  list() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
  add(rec) { rec._ts = _ts(); const l = this.list(); l.push(rec); localStorage.setItem(this.KEY, JSON.stringify(l)); return rec; },
  update(id, patch) {
    patch._ts = _ts();
    const l = this.list();
    const i = l.findIndex((c) => c.id === id);
    if (i > -1) { l[i] = Object.assign(l[i], patch); localStorage.setItem(this.KEY, JSON.stringify(l)); }
  },
  remove(id) {
    localStorage.setItem(this.KEY, JSON.stringify(this.list().filter((c) => c.id !== id)));
  }
};

/* ---------- УВЕДОМЛЕНИЯ (непрочитанные: чаты, запросы, публикации) ----------
   Все счётчики считаются ТОЛЬКО по реальным данным и только по тем элементам,
   которые адресованы текущему пользователю ИЛИ созданы после появления его
   аккаунта (_since). Раньше «запросы» считались как «все чужие запросы в базе» —
   из-за этого у нового пользователя с пустыми чатами были уведомления. */
const Notifications = {
  _get(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } },
  _set(k, o) { localStorage.setItem(k, JSON.stringify(o)); },
  /* порог «новизны» для текущего аккаунта: время регистрации; если метки нет
     (аккаунт создан раньше) — берём _ts записи пользователя или время входа */
  _since() {
    if (typeof USER === 'undefined' || USER.guest) return 0;
    let t = 0;
    try { t = UserInstalled.get(); } catch (e) {}
    if (!t) { try { t = +(LocalUsers.byId(USER.id) && LocalUsers.byId(USER.id)._ts) || 0; } catch (e) {} }
    if (!t) { t = Date.now(); try { UserInstalled.set(t); } catch (e) {} }
    return t;
  },
  /* --- чаты: m.seen = отметка времени последнего просмотра диалога --- */
  unreadChats() {
    if (typeof USER === 'undefined' || USER.guest) return 0;
    const seen = this._get('ou_seen_chats_' + USER.id);
    let n = 0;
    LocalMessages.list().forEach((m) => {
      if (m.to !== USER.id) return;                       /* только ЛИЧНО мне */
      if ((m._ts || 0) < this._since()) return;           /* не старое моего аккаунта */
      if ((m._ts || 0) > (seen[m.from] || 0)) n++;
    });
    return n;
  },
  chatUnreadFrom(pid) {
    if (typeof USER === 'undefined' || USER.guest) return 0;
    const since = this._since();
    const seen = this._get('ou_seen_chats_' + USER.id)[pid] || 0;
    return LocalMessages.list().filter((m) => m.to === USER.id && m.from === pid && (m._ts || 0) >= since && (m._ts || 0) > seen).length;
  },
  markChatSeen(pid) {
    if (typeof USER === 'undefined' || USER.guest) return;
    const k = 'ou_seen_chats_' + USER.id;
    const o = this._get(k);
    o[pid] = Date.now();
    this._set(k, o);
    if (window.OU_badges) window.OU_badges.refresh();
  },
  /* --- жалобы: непрочитанные ответы администрации на мои обращения --- */
  unreadComplaints() {
    if (typeof USER === 'undefined' || USER.guest) return 0;
    const seen = this._get('ou_seen_cmp_' + USER.id);
    return LocalComplaints.list().filter((c) => {
      if (c.by !== USER.id && c.uid !== USER.id) return false;
      if (!c.reply) return false;
      return (c.replyAt || 0) > (seen[c.id] || 0);
    }).length;
  },
  markComplaintsSeen() {
    if (typeof USER === 'undefined' || USER.guest) return;
    const k = 'ou_seen_cmp_' + USER.id;
    const o = this._get(k);
    LocalComplaints.list().forEach((c) => {
      if ((c.by === USER.id || c.uid === USER.id) && c.reply) o[c.id] = c.replyAt || Date.now();
    });
    this._set(k, o);
    if (window.OU_badges) window.OU_badges.refresh();
  },
  /* --- запросы: r.seenBy = список id просмотревших.
         Непрочитанным считается ТОЛЬКО запрос, адресованный лично мне
         (assignee/me = мой id или short) либо созданный после регистрации
         моего аккаунта. Публичные запросы других пользователей не должны
         создавать уведомлений новым участникам. --- */
  _requestForMe(r, since) {
    if (r.author === USER.id) return false;                       /* свой запрос — не уведомление */
    const targets = [].concat(r.assignee || [], r.me || [], r.to || []);
    if (targets.some((t) => String(t) === String(USER.id) || (typeof t === 'string' && t === USER.short))) return true;
    return (r._ts || 0) >= since;                                 /* новые запросы — с момента регистрации */
  },
  unreadRequests() {
    if (typeof USER === 'undefined' || USER.guest) return 0;
    const since = this._since();
    let n = 0;
    (Store.requests || []).forEach((r) => {
      if (!this._requestForMe(r, since)) return;
      if (!(r.seenBy || []).includes(USER.id)) n++;
    });
    return n;
  },
  markRequestsSeen() {
    if (typeof USER === 'undefined' || USER.guest || !Store.requests) return;
    const since = this._since();
    Store.requests.forEach((r) => {
      if (!this._requestForMe(r, since)) return;
      if (!(r.seenBy || []).includes(USER.id)) {
        r.seenBy = (r.seenBy || []).concat([USER.id]);
        LocalRequestPatch.update(r.id, { seenBy: r.seenBy });
      }
    });
    if (window.OU_badges) window.OU_badges.refresh();
  },
  /* --- публикации: p.seenBy (для соавторов, не автора) --- */
  unreadPubs() {
    if (typeof USER === 'undefined' || USER.guest) return 0;
    const since = this._since();
    let n = 0;
    (Store.pubs || []).forEach((p) => {
      if (!p.authors || !p.authors.includes(USER.short)) return;
      if (p.by === USER.id) return;
      if ((p._ts || 0) < since) return;                           /* не старое моего аккаунта */
      if (!(p.seenBy || []).includes(USER.id)) n++;
    });
    return n;
  },
  markPubSeen(id) {
    if (typeof USER === 'undefined' || USER.guest) return;
    const p = (Store.pubs || []).find((x) => x.id === id);
    if (!p || p.by === USER.id || (p.seenBy || []).includes(USER.id)) return;
    p.seenBy = (p.seenBy || []).concat([USER.id]);
    LocalPubs.update(id, { seenBy: p.seenBy });
    if (window.OU_badges) window.OU_badges.refresh();
  }
};

/* ---------- ЭКСПОРТ В WINDOW (доступно из layout.js / app.js) ---------- */
window.Notifications = Notifications;
window.LocalMessages = LocalMessages;
window.LocalFriends = LocalFriends;
window.LocalComplaints = LocalComplaints;
window.LocalProfile = LocalProfile;
window.LocalPubs = LocalPubs;
window.LocalDepts = LocalDepts;
window.LocalUsers = LocalUsers;
window.LocalRequests = LocalRequests;
window.CloudSync = CloudSync;

/* патч-хранилище для полей чужих запросов (seenBy) */
const LocalRequestPatch = {
  KEY: 'ou_requests_overrides',
  _get() { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { return {}; } },
  update(id, patch) {
    patch._ts = _ts();
    const o = this._get();
    o[id] = Object.assign(o[id] || {}, patch);
    localStorage.setItem(this.KEY, JSON.stringify(o));
  }
};
window.LocalRequestPatch = LocalRequestPatch;

/* ---------- ФАЙЛЫ В FIREBASE ---------- */
const CloudFiles = {
  upload(key, data) {
    FBApi.put('/files/' + key, { fileData: data.fileData, fileName: data.fileName, _ts: Date.now() }).catch(() => {});
  },
  async download(key) {
    try { return await FBApi.get('/files/' + key); } catch (e) { return null; }
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
      /* фото профилей из общего синхронизируемого слоя (видны всем пользователям) */
      const photoBy = {};
      (JSON.parse(localStorage.getItem(LocalPeoplePhotos.KEY) || '[]') || []).forEach((x) => {
        if (x && x.photo) photoBy[String(x.id)] = x;
      });
      const withPhoto = (p) => {
        const ph = p.id != null ? photoBy[String(p.id)] : null;
        return ph ? Object.assign({}, p, { photo: ph.photo }) : p;
      };
      const delU = LocalUsers.deleted();
      const userGone = (u) => delU.some((d) => d.id === u.id || d.email === u.email);

      this.depts = depts
        .filter((d) => !d.tpl && !delD.includes(d.n))
        .concat(LocalDepts.list().filter((d) => !delD.includes(d.n)))
        .map((d) => (ovrD[d.n] ? Object.assign({}, d, ovrD[d.n]) : d))
        /* эмодзи больше не поддерживается: приводим к SVG-иконке */
        .map((d) => (window.OU_icons && OU_icons.normalizeDept) ? OU_icons.normalizeDept(d) : d);

      this.people = people.concat(LocalUsers.list().map((u) => {
        const c = Object.assign({}, u);
        delete c.pass;
        return c;
      })).filter((p) => !userGone(p))
        .map((p) => (ovrPeople[p.id] ? Object.assign({}, p, ovrPeople[p.id]) : p))
        /* фото из общего слоя — поверх всего: его добавили сами пользователи
           и оно синхронизируется через облако для всех коллег */
        .map(withPhoto);

      this.pubs = pubs
        .filter((p) => !delP.includes(p.id))
        .map((p) => (ovrP[p.id] ? Object.assign({}, p, ovrP[p.id]) : p))
        .concat(LocalPubs.list().filter((p) => !delP.includes(p.id)));

      this.reviews = reviews;
      this.translations = translations.concat(LocalTranslations.list());
      /* патчи seenBy (уведомления) для запросов из base-файла */
      const ovrReq = LocalRequestPatch._get();
      this.requests = requests.concat(LocalRequests.list())
        .map((r) => (ovrReq[r.id] ? Object.assign({}, r, { seenBy: ovrReq[r.id].seenBy }) : r));

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
    }).then((res) => {
      /* событие для пересчёта бейджей уведомлений по РЕАЛЬНЫМ загруженным данным */
      try { window.dispatchEvent(new Event('ou:data')); } catch (e) {}
      return res;
    }));
  }
};