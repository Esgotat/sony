/* ============================================================
ИКОНОККИ: векторные SVG вместо эмодзи (кафедры) + генерируемые
аватары-инициалы (люди). Работает без внешних загрузок.
============================================================ */
(function () {
'use strict';

/* ---------- БАЗОВЫЕ ФОРМЫ (stroke-иконки 24x24) ---------- */
var P = {
  cap:      '<path d="M12 4 2 9l10 5 10-5-10-5z"/><path d="M6 11.4V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.6"/><path d="M21 9.5V15"/>',
  ruler:    '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  sigma:    '<path d="M17 6H7l6 6-6 6h10"/>',
  atom:     '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>',
  flask:    '<path d="M10 3h4M10.5 3v6L5 18.2A1.8 1.8 0 0 0 6.6 21h10.8A1.8 1.8 0 0 0 19 18.2L13.5 9V3"/><path d="M8 14h8"/>',
  laptop:   '<rect x="4" y="5" width="16" height="10" rx="1"/><path d="M2 19h20"/>',
  robot:    '<rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/><path d="M12 8V4M12 4a1.5 1.5 0 1 0 .01 0M9 18v2M15 18v2"/>',
  shield:   '<path d="M12 3 5 6v5c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6l-7-3z"/><path d="m9 11.5 2 2 4-4.5"/>',
  chart:    '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12.5 16V8M17 16v-3"/>',
  graph:    '<circle cx="6" cy="7" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="17" r="2"/><path d="m7.5 8.5 3 6.5M16.5 8.5l-3 6.5M8 7h8"/>',
  brain:    '<path d="M12 4.5a3 3 0 0 0-5.6 1.7A2.8 2.8 0 0 0 5 11.5a3 3 0 0 0 1.8 4.6A2.8 2.8 0 0 0 12 19.5a2.8 2.8 0 0 0 5.2-3.4A3 3 0 0 0 19 11.5a2.8 2.8 0 0 0-1.4-5.3A3 3 0 0 0 12 4.5z"/><path d="M12 5v14"/>',
  globe:    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5S14.5 18.2 12 20.5c-2.5-2.3-3.8-5.2-3.8-8.5S9.5 5.8 12 3.5z"/>',
  book:     '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h14"/>',
  scroll:   '<path d="M8 21h9a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H8"/><path d="M8 3a3 3 0 0 0-3 3v15a3 3 0 0 1 3-3"/><path d="M11 8h6M11 12h6"/>',
  briefcase:'<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 14h18"/>',
  compass:  '<circle cx="12" cy="12" r="8.5"/><path d="m14.8 9.2-1.6 4-4 1.6 1.6-4 4-1.6z"/>',
  pen:      '<path d="M4 20l1.2-4L16 5.2 18.8 8 8 18.8 4 20z"/><path d="m14 7 3 3"/>',
  speech:   '<path d="M4 5h16v11H10l-5 4V5z"/><path d="M8 9h8M8 12h5"/>',
  scales:   '<path d="M12 4v16M7 20h10M12 6 5 9M12 6l7 3"/><path d="M2.5 14a2.5 2.5 0 0 0 5 0L5 9l-2.5 5zM16.5 14a2.5 2.5 0 0 0 5 0L19 9l-2.5 5z"/>'
};

/* имена иконок для выпадающих списков в формах кафедр */
var DEPT_ICON_OPTS = [
  ['cap', 'Герб / шапка'], ['ruler', 'Линейка'], ['sigma', 'Сигма'], ['atom', 'Атом'],
  ['flask', 'Колба'], ['laptop', 'Ноутбук'], ['robot', 'Робот'], ['shield', 'Щит'],
  ['chart', 'График'], ['graph', 'Граф'], ['brain', 'Нейрон'], ['globe', 'Глобус'],
  ['book', 'Книга'], ['scroll', 'Свиток'], ['briefcase', 'Портфель'], ['compass', 'Компас'],
  ['pen', 'Перо'], ['speech', 'Речь'], ['scales', 'Весы']
];

/* подбор иконки по названию факультета */
var FAC_ICON = {
  'Математика': 'sigma', 'Информатика': 'laptop', 'Физика': 'atom',
  'Химия': 'flask', 'Гуманитарные науки': 'scroll', 'Экономика': 'briefcase',
  'Психология': 'brain', 'Языки': 'globe'
};

/* соответствие «эмодзи из старых данных -> svg-имя» */
var EMOJI_TO_ICON = {
  '📐': 'ruler', '📏': 'ruler', '∑': 'sigma', '🔬': 'flask', '⚗️': 'flask', '🧪': 'flask',
  '💻': 'laptop', '🖥️': 'laptop', '🤖': 'robot', '🛡️': 'shield', '📊': 'chart',
  '📈': 'chart', '🧠': 'brain', '🌍': 'globe', '🌐': 'globe', '📚': 'book',
  '📜': 'scroll', '💼': 'briefcase', '🧭': 'compass', '✒️': 'pen', '🖋️': 'pen',
  '💬': 'speech', '⚖️': 'scales', '🎓': 'cap', '🏛️': 'cap', '♾️': 'sigma'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* основной рендер: <svg class="ou-ic ou-ic-{name}">…</svg> */
function icon(name, size) {
  var key = P[name] ? name : 'cap';
  var px = size || 24;
  return '<svg class="ou-ic ou-ic-' + key + '" viewBox="0 0 24 24" width="' + px + '" height="' + px + '" ' +
    'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">' + P[key] + '</svg>';
}

/* большая плашка иконки для карточек кафедр (вместо emoji-icon) */
function deptIconHTML(dept, fallbackFac) {
  var name = dept && dept.ic && P[dept.ic] ? dept.ic
    : (dept && dept.e && EMOJI_TO_ICON[dept.e]) ? EMOJI_TO_ICON[dept.e]
    : FAC_ICON[(dept && dept.f) || fallbackFac] || 'cap';
  return '<span class="dept-ic">' + icon(name, 56) + '</span>';
}

/* select с вариантами иконок (единый для всех форм кафедры).
   Эмодзи не поддерживаются: значение — только имя SVG-иконки. */
function iconSelectHTML(id, selected) {
  var cur = P[selected] ? selected : '';
  if (!cur && selected) { /* старое значение-эмодзи -> подобрать svg */
    var parts = String(selected).split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      if (EMOJI_TO_ICON[parts[i]]) { cur = EMOJI_TO_ICON[parts[i]]; break; }
    }
  }
  if (!cur) cur = 'cap';
  return '<select id="' + id + '">' +
    DEPT_ICON_OPTS.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select>';
}

/* нормализация данных кафедры: убираем эмодзи из поля e, ставим ic */
function normalizeDept(d) {
  if (!d) return d;
  if (d.e && !P[d.ic]) {
    var parts = String(d.e).split(/\s+/), found = '';
    for (var i = 0; i < parts.length; i++) {
      if (EMOJI_TO_ICON[parts[i]]) { found = EMOJI_TO_ICON[parts[i]]; break; }
    }
    d.ic = found || FAC_ICON[d.f] || 'cap';
  }
  if (d.e && (!P[d.e] || EMOJI_TO_ICON[d.e])) { delete d.e; } /* эмодзи больше не храним */
  if (!P[d.ic]) d.ic = FAC_ICON[d.f] || 'cap';
  return d;
}

/* ---------- АВТАРЫ ЛЮДЕЙ (svg-инициалы вместо эмодзи) ---------- */
var ROLE_BG = { rev: '#C41E3A', res: '#2D6A4F', sup: '#1D3557', trn: '#3E6C8E', adm: '#6B2D8B' };

function initialsOf(name) {
  var parts = String(name || '').trim().split(/\s+/);
  var ini = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] || '?').slice(0, 2);
  return ini.toUpperCase();
}

function avatarSVG(name, role, size) {
  var px = size || 24;
  var bg = ROLE_BG[role] || '#2D6A4F';
  var fs = Math.round(px * 0.4);
  return '<svg class="avatar-svg" viewBox="0 0 64 64" width="' + px + '" height="' + px + '" aria-hidden="true" focusable="false">' +
    '<circle cx="32" cy="32" r="32" fill="' + bg + '"/>' +
    '<text x="32" y="32" text-anchor="middle" dominant-baseline="central" fill="#fff" ' +
    'font-family="Inter,Arial,sans-serif" font-weight="700" font-size="' + fs + '">' + esc(initialsOf(name)) + '</text></svg>';
}

window.OU_icons = {
  icon: icon,
  deptIconHTML: deptIconHTML,
  iconSelectHTML: iconSelectHTML,
  normalizeDept: normalizeDept,
  avatarSVG: avatarSVG,
  initialsOf: initialsOf,
  names: Object.keys(P),
  opts: DEPT_ICON_OPTS,
  facIcon: FAC_ICON
};
})();
