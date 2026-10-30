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

const CUSTOM_VARS = ['--bg','--bg-2','--ink','--muted','--line','--line-2','--dark','--paper','--accent','--bd','--bk','--ba','--bch','--st-fg'];

/* ---------- ЧИТАЕМОСТЬ ТЕКСТА НА ЦВЕТНЫХ ПЛАШКАХ (темы) ----------
   Белые надписи статусов/лицензий на светлых плашках темы становятся
   нечитаемыми. Подбираем цвет текста (#FFF или --ink) по контрасту
   WCAG и кладём его в переменную --st-fg; CSS использует её с запасом
   #FFF, поэтому на дефолтной теме ничего не меняется. */
function wcagLum(r, g, b) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(rgb1, rgb2) {
    const L1 = wcagLum(rgb1[0], rgb1[1], rgb1[2]);
    const L2 = wcagLum(rgb2[0], rgb2[1], rgb2[2]);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
function applyStatusFg(pal) {
    /* читаем уже применённые значения: для custom-палитры они инлайновые,
       для встроенных тем — из THEME_PALETTES (pal), для default — из CSS */
    const cs = getComputedStyle(document.documentElement);
    const ink = hexToRgb(pal && pal['--ink'] || cs.getPropertyValue('--ink').trim() || '#211F1A');
    const keys = ['--bd', '--bk', '--ba', '--bch', '--adm'];
    let worst = Infinity;
    keys.forEach((k) => {
        const raw = (pal && pal[k]) || cs.getPropertyValue(k).trim();
        if (!/^#[0-9a-f]{6}$/i.test(raw)) return;
        const c = hexToRgb(raw);
        worst = Math.min(worst, contrastRatio([255, 255, 255], c), contrastRatio(ink, c));
    });
    if (worst !== Infinity) document.documentElement.style.setProperty('--st-fg', worst >= 4.5 ? '#FFF' : rgbToHex(ink[0], ink[1], ink[2]));
}
/* Палитры встроенных тем. Каждой теме соответствует полный набор переменных,
   поэтому переключение любой темы работает даже без загруженного CSS-правила. */
const THEME_PALETTES = {
    dark:      { '--bg':'#111111','--bg-2':'#1A1A1A','--ink':'#E8E6E1','--muted':'#888888','--line':'#333333','--line-2':'#444444','--dark':'#E8E6E1','--paper':'#111111','--accent':'#E63946','--bd':'#E63946','--bk':'#52B788','--ba':'#457B9D','--bch':'#E9C46A','--adm':'#9B5DE5' },
    night:     { '--bg':'#141210','--bg-2':'#1E1B17','--ink':'#EAE3D6','--muted':'#948B7C','--line':'#3A342C','--line-2':'#57503F','--dark':'#EAE3D6','--paper':'#181512','--accent':'#D9A441','--bd':'#D9A441','--bk':'#7FA88B','--ba':'#8CA3C6','--bch':'#C0895A','--adm':'#B08BC6' },
    tiffany:   { '--bg':'#E4F4F3','--bg-2':'#F1FAF9','--ink':'#123B3C','--muted':'#5E8A89','--line':'#BCE0DE','--line-2':'#8CC5C3','--dark':'#0F5657','--paper':'#F5FCFB','--accent':'#2E8F90','--bd':'#2E8F90','--bk':'#4AA87C','--ba':'#4A7FA8','--bch':'#A8894A','--adm':'#8A4AA8' },
    greenery:  { '--bg':'#EEF3E1','--bg-2':'#F6F9EE','--ink':'#25301A','--muted':'#6C7A58','--line':'#CBD8B2','--line-2':'#9FB37B','--dark':'#3E5327','--paper':'#F7FAEF','--accent':'#5C7A2E','--bd':'#5C7A2E','--bk':'#2E7A6B','--ba':'#7A6B2E','--bch':'#A05A2C','--adm':'#6B2D5C' },
    tangerine: { '--bg':'#FBEADC','--bg-2':'#FDF4EC','--ink':'#3E2113','--muted':'#94674A','--line':'#F0CDAF','--line-2':'#DDA378','--dark':'#8C3E14','--paper':'#FEF6EF','--accent':'#C65A20','--bd':'#C65A20','--bk':'#9A7A20','--ba':'#3E7A8C','--bch':'#8C4A6B','--adm':'#5C3E8C' },
    estate:    { '--bg':'#E3E9F3','--bg-2':'#EFF3F9','--ink':'#182236','--muted':'#5F6E88','--line':'#C0CCE0','--line-2':'#8EA0BF','--dark':'#27395C','--paper':'#F2F5FA','--accent':'#2F4C7C','--bd':'#2F4C7C','--bk':'#2F7C5C','--ba':'#7C5C2F','--bch':'#7C2F4C','--adm':'#5C2F7C' },
    cashmere:  { '--bg':'#E9EDF5','--bg-2':'#F3F6FB','--ink':'#232B3B','--muted':'#6D7891','--line':'#C8D2E4','--line-2':'#9FAFD1','--dark':'#4A5C7A','--paper':'#F5F8FC','--accent':'#5A76A8','--bd':'#5A76A8','--bk':'#4A8C74','--ba':'#8C744A','--bch':'#A85A6E','--adm':'#7A5AA8' },
    oxford:    { '--bg':'#101A30','--bg-2':'#16233F','--ink':'#DDE6F5','--muted':'#8A9AC0','--line':'#2A3A5C','--line-2':'#405480','--dark':'#DDE6F5','--paper':'#13203A','--accent':'#7FA3E0','--bd':'#7FA3E0','--bk':'#6FCFA0','--ba':'#E0C47F','--bch':'#E08FA3','--adm':'#B79AE6' },
    burgundy:  { '--bg':'#1F0F13','--bg-2':'#2A151B','--ink':'#F0DDE0','--muted':'#A8848A','--line':'#45252C','--line-2':'#683A44','--dark':'#F0DDE0','--paper':'#241216','--accent':'#C97B8A','--bd':'#C97B8A','--bk':'#8FC9A6','--ba':'#C9B78F','--bch':'#E0A08F','--adm':'#C08FD9' },
    emerald:   { '--bg':'#0D1F18','--bg-2':'#122A20','--ink':'#D9EFE4','--muted':'#7FA894','--line':'#244537','--line-2':'#386150','--dark':'#D9EFE4','--paper':'#0F241B','--accent':'#5FBF94','--bd':'#5FBF94','--bk':'#BFE07F','--ba':'#7FB8E0','--bch':'#E0B97F','--adm':'#B08BD9' }
};
const DARK_THEMES = ['dark', 'night', 'oxford', 'burgundy', 'emerald'];
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
    /* очищаем ВСЕ ранее применённые инлайновые переменные (в т.ч. --adm),
       иначе остатки прошлой темы накладываются на новую */
    Object.keys(THEME_PALETTES).forEach((t) => {
        Object.keys(THEME_PALETTES[t]).forEach((v) => root.style.removeProperty(v));
    });
    CUSTOM_VARS.forEach((v) => root.style.removeProperty(v));
    root.removeAttribute('data-dark');
    if (id === 'custom' && color) {
        const pal = buildPalette(color);
        /* для произвольной темы оттенок админ-бейджа выводим из базового цвета */
        pal['--adm'] = hslToHex((rgbToHsl.apply(null, hexToRgb(color)).h + 0.85) % 1, 0.55, 0.42);
        CUSTOM_VARS.concat(['--adm']).forEach((v) => { if (pal[v]) root.style.setProperty(v, pal[v]); });
        root.setAttribute('data-theme', 'custom');
        applyStatusFg(pal);
    } else if (THEME_PALETTES[id]) {
        /* применяем палитру темы напрямую через inline-переменные —
           так тема гарантированно работает независимо от загрузки CSS */
        const pal = THEME_PALETTES[id];
        Object.keys(pal).forEach((v) => root.style.setProperty(v, pal[v]));
        root.setAttribute('data-theme', id);
        if (DARK_THEMES.indexOf(id) !== -1) root.setAttribute('data-dark', '');
        applyStatusFg(pal);
    } else {
        root.removeAttribute('data-theme');
        applyStatusFg(null);
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
/* «бумажный» цвет темы (--bg-2) как триплет «r, g, b» в :root:
   нужен CSS, чтобы строить полупрозрачные подложки через rgba()
   (карточки кафедр). Обновляется при старте и при смене темы. */
function veilRgbTriplet() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--bg-2').trim();
    return hexToRgb(c).join(', ');
}
function applyVeilRgb() {
    document.documentElement.style.setProperty('--veil-rgb', veilRgbTriplet());
}
applyVeilRgb();
window.OU_theme = {
    apply: function () {
        const r = applyTheme.apply(this, arguments);
        applyVeilRgb();
        return r;
    },
    refresh: () => { const p = themePref(); OU_theme.apply(p.id, p.color); return p; }
};

/* ---------- ШАПКА ---------- */
/* Пункт «Главная» убран из шапки — в бренд-логотип уже ведёт на index.html.
   «Моя страница» остаётся первой; «Моя кафедра» и «Мои знакомые» перенесены
   внутрь «Кабинета». */
const links = [];
if (!USER.guest) {
    links.push({ href: 'profile.html?id=' + USER.id, label: 'Моя страница', id: 'me', extra: 'me-page' });
    /* «Моя кафедра» — рядом с «Моей страницей» (также дублируется в «Кабинете») */
    if (USER.dept != null) links.push({ href: 'moya-kafedra.html', label: 'Моя кафедра', id: 'dept' });
}
const cabinetOn = ['pubs', 'req', 'chats', 'complaint', 'dept', 'people'].includes(active);
const unreadComplaints = (() => {
  if (!isAdmin(USER)) return 0;
  try {
    return LocalComplaints.list()
      .filter((c) => !c.read && c.status !== 'closed').length;
  } catch (e) { return 0; }
})();

/* Пункты шапки: «Моя страница», «Кабинет», «Админ-панель» (+«Выйти») —
   в один уровень; подменю («Кафедры», «Публикации», «Коллеги», «Запросы») —
   во второй. «Главная» убрана (логотип ведёт на index.html), «Моя кафедра»
   и «Мои знакомые» перенесены в «Кабинет». */
const navMain = links.map((n) => {
    const cls = [n.extra || '', n.id === active ? 'on' : ''].filter(Boolean).join(' ');
    return `<a href="${n.href}"${cls ? ` class="${cls}"` : ''}${n.id === active ? ' aria-current="page"' : ''}>${n.label}</a>`;
}).join('');
const cabItems = [];
if (!USER.guest && USER.dept != null) cabItems.push('<li><a href="moya-kafedra.html"><span class="dd-label">Моя кафедра</span></a></li>');
cabItems.push('<li><a href="' + (USER.guest ? 'znakomye.html' : 'znakomye.html?mode=friends') + '"><span class="dd-label">Мои знакомые</span></a></li>');
cabItems.push('<li><a href="moi-publikacii.html"><span class="dd-label">Мои публикации</span><span class="dd-badge" data-bd="pubs" hidden></span></a></li>');
cabItems.push('<li><a href="new-request.html"><span class="dd-label">Мои запросы</span><span class="dd-badge" data-bd="reqs" hidden></span></a></li>');
cabItems.push('<li><a href="chats.html"><span class="dd-label">Мои чаты</span><span class="dd-badge" data-bd="chats" hidden></span></a></li>');
cabItems.push('<li><a href="complaint.html"><span class="dd-label">Написать администрации</span><span class="dd-badge" data-bd="cmp" hidden></span></a></li>');
const navCab = !USER.guest ? `
<div class="hd-dd">
<button class="hd-dd-btn${cabinetOn ? ' on' : ''}" type="button" aria-haspopup="true" aria-expanded="false" id="cabBtn">Кабинет <span class="hd-badge" id="cabBadge" hidden></span></button>
<ul class="hd-dd-menu">
${cabItems.join('\n')}
</ul>
</div>` : '';
const navAdmin = isAdmin(USER) ? `<a href="admin.html"${active === 'admin' ? ' class="on" aria-current="page"' : ''}>Админ-панель<span class="hd-badge" data-bd="admCmp" hidden></span></a>` : '';
/* «Выйти» на телефоне показываем внизу страницы профиля (см. app.js),
   в шапке оставляем только «Войти» для гостей */
const isMobileNav = matchMedia('(hover: none)').matches || innerWidth <= 640;
const navAuth = USER.guest
    ? '<a href="login.html" class="me-link">Войти</a>'
    : (isMobileNav && document.body.dataset.page === 'person' ? '' : '<a href="#" class="me-link" id="logoutBtn">Выйти</a>');

document.getElementById('hd').innerHTML = `
<a class="brand" href="index.html"><span class="brand-line1">Open</span><span class="brand-line2">University</span></a>
<nav class="hd-nav" aria-label="Основная навигация">
${navMain}
${navCab}
${navAdmin}
${navAuth}
</nav>
<input class="hd-search" id="siteSearch" type="search" placeholder="поиск по сайту…" aria-label="Поиск по сайту">
<div class="hd-theme-wrap">
<button class="hd-theme" id="themeBtn" type="button" title="Сменить тему" aria-haspopup="true" aria-expanded="false">🎨</button>
<div class="theme-menu" id="themeMenu" hidden>
${THEMES.map((t) => '<button type="button" data-theme-id="' + t.id + '"><i style="background:' + t.color + '"></i>' + t.name + '</button>').join('')}
<label class="theme-custom">
<input type="color" id="themeColor" value="${pref.color}" aria-label="Выбрать свой цвет">
<span>Своя…</span>
</label>
</div>
</div>
`;

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); Session.clear(); location.href = 'index.html'; });

const themeBtn = document.getElementById('themeBtn');
const themeMenu = document.getElementById('themeMenu');
const colorInput = document.getElementById('themeColor');
if (themeBtn && themeMenu) {
    /* единственный обработчик: тап по кнопке тем только открывает/закрывает меню */
    themeBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        themeMenu.hidden = !themeMenu.hidden;
        themeBtn.setAttribute('aria-expanded', String(!themeMenu.hidden));
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.hd-theme-wrap')) { themeMenu.hidden = true; themeBtn.setAttribute('aria-expanded', 'false'); }
    });
}
if (themeMenu) {
    themeMenu.querySelectorAll('button[data-theme-id]').forEach((b) => {
        b.addEventListener('click', () => { saveTheme(b.dataset.themeId); OU_theme.apply(b.dataset.themeId); themeMenu.hidden = true; });
    });
}
if (colorInput) {
    colorInput.addEventListener('input', () => { saveTheme('custom', colorInput.value); OU_theme.apply('custom', colorInput.value); });
}

/* ---------- ПОДМЕНЮ ---------- */
const facItems = FAC.map((f) => `<li><a href="kafedry.html?fac=${encodeURIComponent(f)}">${f.replace(' науки', '')}</a></li>`).join('');
const pubItems = Object.entries(STATUS).map(([key, s]) => `<li><a href="publications.html?status=${key}">${s.label}</a></li>`).join('');
const roleItems = Object.entries(ROLES).map(([key, r]) => `<li><a href="znakomye.html?mode=all&amp;role=${key}">${r.label}</a></li>`).join('');
const reqItems = Object.entries(REQ_TYPES).map(([key, t]) => `<li><a href="requests.html?type=${key}">${t.label}</a></li>`).join('');
document.getElementById('subnav').innerHTML = `
<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">Кафедры <span class="dd-badge" data-bd="depts" hidden></span></button><ul class="dd-menu">${facItems}</ul></div>
<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">Публикации <span class="dd-badge" data-bd="pubs" hidden></span></button><ul class="dd-menu">${pubItems}</ul></div>
<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">Коллеги <span class="dd-badge" data-bd="ppl" hidden></span></button><ul class="dd-menu">${roleItems}</ul></div>
<div class="dd"><button class="dd-btn" type="button" aria-haspopup="true" aria-expanded="false">Запросы <span class="dd-badge" data-bd="reqs" hidden></span></button><ul class="dd-menu">${reqItems}</ul></div>
`;


/* ---------- АККОРДЕОНЫ (шапка + подменю) ----------
   Десктоп: наведение раскрывает список (CSS), клик по названию раздела
   ведёт на страницу раздела. Телефон: первый тап раскрывает список,
   повторный тап по той же кнопке ведёт на страницу раздела.
   Определяем тач-режим в момент инициализации обработчиков (не при загрузке). */
function isTouchNav() { return matchMedia('(hover: none)').matches || innerWidth <= 640; }
const SECTION_PAGES = { 'Кафедры': 'kafedry.html', 'Публикации': 'publications.html', 'Коллеги': 'znakomye.html?mode=all', 'Запросы': 'requests.html' };
function initDropdown(rootSel, wrapCls, btnCls, hrefs) {
    const wraps = Array.prototype.slice.call(document.querySelectorAll(rootSel + ' .' + wrapCls));
    function closeAll(except) {
        wraps.forEach((w) => {
            if (w === except) return;
            w.classList.remove('open');
            const b = w.querySelector('.' + btnCls);
            if (b) b.setAttribute('aria-expanded', 'false');
        });
    }
    wraps.forEach((wrap, i) => {
        const btn = wrap.querySelector('.' + btnCls);
        if (!btn) return;
        const href = hrefs && hrefs[i];
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            /* desktop: клик по названию раздела всегда ведёт на страницу,
               список раскрывается наведением (CSS) */
            if (href && !isTouchNav()) { location.href = href; return; }
            /* телефон: первый тап — раскрыть список, повторный тап по
               уже раскрытой кнопке — перейти на страницу раздела */
            const wasOpen = wrap.classList.contains('open');
            closeAll(wrap);
            if (!wasOpen) {
                wrap.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
            } else if (href) {
                location.href = href;
            } else {
                btn.setAttribute('aria-expanded', 'false');
            }
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
const subHrefs = ['kafedry.html', 'publications.html', 'znakomye.html?mode=all', 'requests.html'];
initDropdown('#subnav', 'dd', 'dd-btn', subHrefs);
initDropdown('.hd-nav', 'hd-dd', 'hd-dd-btn', null);
    /* раскрываемые списки подменю: «Кафедры», «Публикации», «Коллеги», «Запросы» —
       бейджи счётчиков кладём на сами кнопки (стрелок ▾ больше нет) */
    document.querySelectorAll('#subnav .dd').forEach((w) => {
        const ul = w.querySelector('.dd-menu');
        if (!ul) return;
        ul.querySelectorAll('li > a').forEach((a) => {
            if (a.querySelector('.dd-badge')) return;
            const badge = document.createElement('span');
            badge.className = 'dd-badge';
            badge.hidden = true;
            a.appendChild(badge);
        });
    });

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