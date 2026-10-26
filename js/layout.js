/* ============================================================
ОБЩИЙ КАРКАС: шапка, «Кабинет», подменю, темы.
============================================================ */
(function () {
'use strict';
const page = document.body.dataset.page || 'home';
const viewedId = +new URLSearchParams(location.search).get('id');
let active = page;
if (page === 'person') active = (!USER.guest && viewedId === USER.id) ? 'me' : 'people';
if (page === 'requests' || page === 'newreq') active = 'req';
if (page === 'deptpage') active = 'home';
if (page === 'admin') active = 'admin';

/* ---------- ЦВЕТОВЫЕ УТИЛИТЫ ---------- */
function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [74, 168, 169];
}
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('');
}
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }
    return { h: h, s: s, l: l };
}
function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}
function hslToHex(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return rgbToHex(r * 255, g * 255, b * 255);
}
function buildPalette(hex) {
    const c = rgbToHsl.apply(null, hexToRgb(hex));
    const S = Math.min(Math.max(c.s, 0.3), 0.85);
    const h = c.h;
    return {
        '--bg': hslToHex(h, S * 0.35, 0.93),
        '--bg-2': hslToHex(h, S * 0.30, 0.97),
        '--ink': hslToHex(h, S * 0.60, 0.15),
        '--muted': hslToHex(h, S * 0.40, 0.45),
        '--line': hslToHex(h, S * 0.40, 0.80),
        '--line-2': hslToHex(h, S * 0.50, 0.62),
        '--dark': hslToHex(h, S, 0.32),
        '--paper': hslToHex(h, S * 0.30, 0.97),
        '--accent': hslToHex(h, S, 0.35),
        '--bd': hslToHex((h + 0.07) % 1, S, 0.45),
        '--bk': hslToHex((h + 0.28) % 1, S * 0.8, 0.42),
        '--ba': hslToHex((h + 0.50) % 1, S * 0.7, 0.45),
        '--bch': hslToHex((h + 0.14) % 1, S * 0.7, 0.50)
    };
}

const CUSTOM_VARS = ['--bg','--bg-2','--ink','--muted','--line','--line-2','--dark','--paper','--accent','--bd','--bk','--ba','--bch'];
const THEMES = [
    { id: 'default',   name: 'Классика',          color: '#EFE9DC' },
    { id: 'dark',      name: 'Тёмная',             color: '#17181A' },
    { id: 'tiffany',   name: 'Тиффани',            color: '#4AA8A9' },
    { id: 'greenery',  name: 'Гринери',            color: '#7EA244' },
    { id: 'tangerine', name: 'Танжерин',           color: '#ED8B4F' },
    { id: 'estate',    name: 'Эстейт-блю',         color: '#27395C' },
    { id: 'cashmere',  name: 'Кашемир-блю',        color: '#9FAFD1' },
    { id: 'oxford',    name: 'Оксфорд',             color: '#1F3A7A' },
    { id: 'burgundy',  name: 'Бургунди',           color: '#7A2E3B' },
    { id: 'emerald',   name: 'Изумруд',             color: '#1F7A5C' },
    { id: 'night',     name: 'Ночная библиотека',  color: '#141210' }
];

function applyTheme(id, color) {
    const root = document.documentElement;
    CUSTOM_VARS.forEach((v) => root.style.removeProperty(v));
    if (id === 'custom' && color) {
        const pal = buildPalette(color);
        CUSTOM_VARS.forEach((v) => { if (pal[v]) root.style.setProperty(v, pal[v]); });
        root.setAttribute('data-theme', 'custom');
    } else if (id && id !== 'default') {
        root.setAttribute('data-theme', id);
    } else {
        root.removeAttribute('data-theme');
    }
}
function themePref() {
    if (!USER.guest) {
        const prof = LocalProfile.get();
        if (prof && prof.theme) return { id: prof.theme, color: prof.themeColor || localStorage.getItem('ou_theme_color') || '#4AA8A9' };
    }
    return { id: localStorage.getItem('ou_theme') || 'default', color: localStorage.getItem('ou_theme_color') || '#4AA8A9' };
}
function saveTheme(id, color) {
    localStorage.setItem('ou_theme', id);
    if (color) localStorage.setItem('ou_theme_color', color);
    if (!USER.guest) LocalProfile.save({ theme: id, themeColor: color || null });
}

const pref = themePref();
applyTheme(pref.id, pref.color);
window.OU_theme = { apply: applyTheme, refresh: () => { const p = themePref(); applyTheme(p.id, p.color); return p; } };

/* ---------- ШАПКА ---------- */
const links = [];
if (!USER.guest) links.push({ href: 'profile.html?id=' + USER.id, label: 'Моя страница', id: 'me', extra: 'me-page' });
links.push({ href: 'index.html', label: 'Главная', id: 'home' });
/* «Знакомые» ведёт на личный список знакомых (mode=friends), а не на всех коллег */
links.push({ href: USER.guest ? 'znakomye.html' : 'znakomye.html?mode=friends', label: 'Знакомые', id: 'people' });
links.push({ href: 'moya-kafedra.html', label: 'Моя кафедра', id: 'dept' });
const cabinetOn = ['pubs', 'req', 'chats', 'complaint'].includes(active);
const unreadComplaints = (() => {
  if (!isAdmin(USER)) return 0;
  try {
    return LocalComplaints.list()
      .filter((c) => !c.read && c.status !== 'closed').length;
  } catch (e) { return 0; }
})();

document.getElementById('hd').innerHTML = `
<a class="brand" href="index.html"><span class="brand-line1">Open</span><span class="brand-line2">University</span></a>
<nav class="hd-nav" aria-label="Основная навигация">
${links.map((n) => {
    const cls = [n.extra || '', n.id === active ? 'on' : ''].filter(Boolean).join(' ');
    return `<a href="${n.href}"${cls ? ` class="${cls}"` : ''}${n.id === active ? ' aria-current="page"' : ''}>${n.label}</a>`;
}).join('')}
${!USER.guest ? `
<div class="hd-dd">
<button class="hd-dd-btn${cabinetOn ? ' on' : ''}" type="button" aria-haspopup="true" aria-expanded="false" id="cabBtn">Кабинет <span class="caret">▾</span><span class="hd-badge" id="cabBadge" hidden></span></button>
<ul class="hd-dd-menu">
<li><a href="moi-publikacii.html"><span class="dd-label">Мои публикации</span><span class="dd-badge" data-bd="pubs" hidden></span></a></li>
<li><a href="new-request.html"><span class="dd-label">Мои запросы</span><span class="dd-badge" data-bd="reqs" hidden></span></a></li>
<li><a href="chats.html"><span class="dd-label">Мои чаты</span><span class="dd-badge" data-bd="chats" hidden></span></a></li>
<li><a href="complaint.html"><span class="dd-label">Написать администрации</span><span class="dd-badge" data-bd="cmp" hidden></span></a></li>
</ul>
</div>` : ''}
${isAdmin(USER) ? `<a href="admin.html"${active === 'admin' ? ' class="on" aria-current="page"' : ''}>Админ-панель<span class="hd-badge" data-bd="admCmp" hidden></span></a>` : ''}
${USER.guest
    ? '<a href="login.html" class="me-link">Войти</a>'
    : '<a href="#" class="me-link" id="logoutBtn">Выйти</a>'}
</nav>
<input class="hd-search" id="siteSearch" type="search" placeholder="поиск по сайту…" aria-label="Поиск по сайту">
<button class="hd-theme" id="themeBtn" type="button" title="Сменить тему">🎨</button>
<div class="theme-menu" id="themeMenu" hidden>
${THEMES.map((t) => '<button type="button" data-theme-id="' + t.id + '"><i style="background:' + t.color + '"></i>' + t.name + '</button>').join('')}
<label class="theme-custom">
<input type="color" id="themeColor" value="${pref.color}" aria-label="Выбрать свой цвет">
<span>Своя…</span>
</label>
</div>
`;

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); Session.clear(); location.href = 'index.html'; });

const themeBtn = document.getElementById('themeBtn');
const themeMenu = document.getElementById('themeMenu');
const colorInput = document.getElementById('themeColor');
if (themeBtn && themeMenu) {
    themeBtn.addEventListener('click', (e) => { e.stopPropagation(); themeMenu.hidden = !themeMenu.hidden; });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.theme-menu') && !e.target.closest('.hd-theme')) themeMenu.hidden = true;
    });
}
if (themeMenu) {
    themeMenu.querySelectorAll('button[data-theme-id]').forEach((b) => {
        b.addEventListener('click', () => { saveTheme(b.dataset.themeId); applyTheme(b.dataset.themeId); themeMenu.hidden = true; });
    });
}
if (colorInput) {
    colorInput.addEventListener('input', () => { saveTheme('custom', colorInput.value); applyTheme('custom', colorInput.value); });
}

/* ---------- ПОДМЕНЮ ---------- */
const facItems = FAC.map((f) => `<li><a href="kafedry.html?fac=${encodeURIComponent(f)}">${f.replace(' науки', '')}</a></li>`).join('');
const pubItems = Object.entries(STATUS).map(([key, s]) => `<li><a href="publications.html?status=${key}">${s.label}</a></li>`).join('');
const roleItems = Object.entries(ROLES).map(([key, r]) => `<li><a href="znakomye.html?role=${key}">${r.label}</a></li>`).join('');
const reqItems = Object.entries(REQ_TYPES).map(([key, t]) => `<li><a href="requests.html?type=${key}">${t.label}</a></li>`).join('');
document.getElementById('subnav').innerHTML = `
<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">Кафедры <span class="caret">▾</span></button><ul class="dd-menu">${facItems}</ul></div>
<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">Публикации <span class="caret">▾</span></button><ul class="dd-menu">${pubItems}</ul></div>
<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">Коллеги <span class="caret">▾</span></button><ul class="dd-menu">${roleItems}</ul></div>
<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">Запросы <span class="caret">▾</span></button><ul class="dd-menu">${reqItems}</ul></div>
`;


/* ---------- ТАЧ-АККОРДЕОНЫ (шапка + подменю) ----------
   На десктопе меню раскрываются по наведению (CSS), на телефоне — тапом.
   Тап по названию раздела («Кафедры», «Публикации», «Коллеги», «Запросы»)
   ВСЕГДА ведёт на страницу раздела; для раскрытия списка служит шеврон ▾. */
const TOUCH = matchMedia('(hover: none)').matches || innerWidth <= 640;
function initDropdown(rootSel, wrapCls, btnCls) {
    const wraps = Array.prototype.slice.call(document.querySelectorAll(rootSel + ' .' + wrapCls));
    function closeAll(except) {
        wraps.forEach((w) => {
            if (w === except) return;
            w.classList.remove('open');
            const b = w.querySelector('.' + btnCls);
            if (b) b.setAttribute('aria-expanded', 'false');
        });
    }
    wraps.forEach((wrap) => {
        const btn = wrap.querySelector('.' + btnCls);
        if (!btn) return;
        /* мобильные: клик по кнопке — переход на страницу раздела;
           тап по шеврону ▾ — раскрыть/свернуть список */
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const onCaret = !!(e.target && e.target.closest('.caret'));
            if (onCaret || TOUCH) {
                if (onCaret || !btn.dataset.href) {
                    const wasOpen = wrap.classList.contains('open');
                    closeAll(wrap);
                    if (!wasOpen) {
                        wrap.classList.add('open');
                        btn.setAttribute('aria-expanded', 'true');
                    } else {
                        btn.setAttribute('aria-expanded', 'false');
                    }
                    return;
                }
                closeAll(wrap);
            }
            if (btn.dataset.href) location.href = btn.dataset.href;
        });
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.' + wrapCls)) closeAll(null);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeAll(null);
        wraps.forEach((w) => {
            const b = w.querySelector('.' + btnCls);
            if (b) b.blur();
        });
    });
}
initDropdown('#subnav', 'dd', 'dd-btn');
initDropdown('.hd-nav', 'hd-dd', 'hd-dd-btn');
    /* раскрываемые списки подменю: «Кафедры», «Публикации», «Коллеги», «Запросы» */
    const DD_HREFS = ['kafedry.html', 'publications.html', 'znakomye.html', 'requests.html'];
    document.querySelectorAll('#subnav .dd').forEach((w, idx) => {
        const b = w.querySelector('.dd-btn');
        if (b) b.dataset.href = DD_HREFS[idx] || '';
        const ul = w.querySelector('.dd-menu');
        if (!ul) return;
        const bdKey = { kafedry: 'depts', publications: 'pubs', znakomye: 'ppl', requests: 'reqs' }[DD_HREFS[idx].split('.')[0]];
        ul.querySelectorAll('li > a').forEach((a) => {
            if (a.querySelector('.dd-badge')) return;
            const badge = document.createElement('span');
            badge.className = 'dd-badge';
            badge.hidden = true;
            if (bdKey) badge.setAttribute('data-bd', bdKey);
            a.appendChild(badge);
        });
    });
    const cabBtn = document.querySelector('.hd-dd-btn');
    if (cabBtn) cabBtn.dataset.href = 'moi-publikacii.html';

/* ---------- БЕЙДЖИ УВЕДОМЛЕНИЙ (чаты / запросы / публикации) ---------- */
window.OU_badges = (function () {
    function set(el, n) {
        if (!el) return;
        el.textContent = n > 99 ? '99+' : n;
        el.hidden = !(n > 0);
        el.classList.toggle('vis', n > 0);
    }
    /* Счётчики считаются ТОЛЬКО по реальным данным Store/Local* —
       никаких случайных чисел. */
    function unreadComplaintsForUser() {
        if (typeof USER === 'undefined' || USER.guest) return 0;
        try { return Notifications.unreadComplaints(); } catch (e) { return 0; }
    }
    function unreadForAdmin() {
        /* реальные непрочитанные жалобы в адрес администрации */
        let uc = 0;
        try {
            const list = (typeof LocalComplaints !== 'undefined')
                ? LocalComplaints.list()
                : (typeof Store !== 'undefined' && Store.state ? (Store.state.complaints || []) : []);
            uc = list.filter((x) => !x.read && x.status !== 'closed').length;
        } catch (e) {}
        return uc;
    }
    function refresh() {
        if (typeof USER === 'undefined' || USER.guest) return;
        let c = 0, r = 0, p = 0;
        try { c = Notifications.unreadChats(); } catch (e) {}
        try { r = Notifications.unreadRequests(); } catch (e) {}
        try { p = Notifications.unreadPubs(); } catch (e) {}
        const cm = unreadComplaintsForUser();
        /* все элементы с data-bd (в меню «Кабинета», в подменю разделов и у «Админ-панели») */
        document.querySelectorAll('[data-bd]').forEach((el) => {
            const key = el.getAttribute('data-bd');
            const n = key === 'chats' ? c : key === 'reqs' ? r : key === 'pubs' ? p :
                      key === 'cmp' ? cm : key === 'admCmp' ? unreadForAdmin() : 0;
            set(el, n);
        });
        const total = c + r + p + cm;
        const cab = document.getElementById('cabBadge');
        if (cab) { cab.textContent = total > 99 ? '99+' : total; cab.hidden = total === 0; }
    }
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#cabBtn');
        if (btn) setTimeout(refresh, 50);
    }, true);
    window.addEventListener('ou:data', refresh);   // пересчёт после загрузки/синхронизации данных
    refresh();
    setInterval(refresh, 60000);                   // периодическая сверка с реальными данными
    return { refresh };
})();

/* ---------- ПОИСК: Enter ведёт на страницу результатов ---------- */
const searchInput = document.getElementById('siteSearch');
if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
            location.href = 'publications.html?q=' + encodeURIComponent(searchInput.value.trim());
        }
    });
}

})();