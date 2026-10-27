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

/* square=true — квадратная аватарка (прямоугольник, без скругления), для
   карточек коллег: занимает всю секцию картинки. Без square — круглая
   (профили, мелкие места). */
function avatarSVG(name, role, size, square) {
  var px = size || 24;
  var bg = ROLE_BG[role] || '#2D6A4F';
  var shape = square
    ? '<rect x="0" y="0" width="64" height="64" fill="' + bg + '"/>'
    : '<circle cx="32" cy="32" r="32" fill="' + bg + '"/>';
  return '<svg class="avatar-svg' + (square ? ' avatar-square' : '') + '" viewBox="0 0 64 64" width="' + px + '" height="' + px + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    shape +
    '<text x="32" y="32" text-anchor="middle" dominant-baseline="central" fill="#fff" ' +
    'font-family="Inter,Arial,sans-serif" font-weight="700" font-size="26">' + esc(initialsOf(name)) + '</text></svg>';
}

/* ---------- ФОТО (сжатие перед записью в хранилище) ----------
   Кадрирование по центру + последовательное уменьшение (step-down resampling)
   вместо одного drawImage — так изображение не «мылится» при сильном уменьшении.
*/
function coverCrop(img, W, H) {
  var sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  var s = Math.max(W / sw, H / sh);           // side cover: заполняем весь холст
  var cw = Math.round(sw * s), ch = Math.round(sh * s);
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  var ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  /* уменьшаем поэтапно (каждый шаг <=50%), чтобы сохранить резкость */
  var tw = cw, th = ch;
  if (cw > W * 2 || ch > H * 2) {
    var t = document.createElement('canvas');
    t.width = cw; t.height = ch;
    var tc = t.getContext('2d');
    tc.drawImage(img, 0, 0, cw, ch);
    while (tw > W * 2 && th > H * 2) {
      var nw = Math.max(W, Math.round(tw / 2)), nh = Math.max(H, Math.round(th / 2));
      var n = document.createElement('canvas');
      n.width = nw; n.height = nh;
      var nc = n.getContext('2d');
      nc.imageSmoothingEnabled = true;
      nc.imageSmoothingQuality = 'high';
      nc.drawImage(t, 0, 0, tw, th, 0, 0, nw, nh);
      t = n; tw = nw; th = nh;
    }
    ctx.drawImage(t, Math.round((cw - tw) / 2), Math.round((ch - th) / 2), tw, th,
      Math.round((W - cw) / 2), Math.round((H - ch) / 2), cw, ch);
  } else {
    ctx.drawImage(img, (W - cw) / 2, (H - ch) / 2, cw, ch);
  }
  return cv;
}

function readImage(file, maxSide, cb, aspect) {
  if (!file || !/^image\//.test(file.type)) { cb(new Error('not an image')); return; }
  var reader = new FileReader();
  reader.onerror = function () { cb(reader.error || new Error('read error')); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { cb(new Error('bad image')); };
    img.onload = function () {
      try {
        var side = Math.min(maxSide || 1200, Math.max(img.width, img.height));
        var out, url;
        if (aspect) {
          /* обложка: кадрируем по центру под нужное соотношение сторон */
          var W = side, H = Math.max(1, Math.round(side / aspect));
          if (W < 480) W = Math.min(480, img.width);
          if (H < Math.round(W / aspect)) H = Math.round(W / aspect);
          out = coverCrop(img, W, H);
        } else {
          var k = side / Math.max(img.width, img.height);
          var w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
          out = document.createElement('canvas');
          out.width = w; out.height = h;
          var octx = out.getContext('2d');
          octx.imageSmoothingEnabled = true;
          octx.imageSmoothingQuality = 'high';
          octx.drawImage(img, 0, 0, w, h);
        }
        url = out.toDataURL('image/jpeg', 0.9);
        /* если JPEG с прозрачностью дал чёрный фон на PNG — пробуем PNG */
        if (/^image\/png/.test(file.type) && file.size < 700 * 1024) {
          var png = out.toDataURL('image/png');
          if (png.length < url.length * 1.6) url = png;
        }
        cb(null, url);
      } catch (e) { cb(e); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- ФОТО ПРОФИЛЯ: ОЧИСТКА СТРОКИ ОТ НЕВИДИМЫХ СИМВОЛОВ ----------
   dataURL с фото вставляется в HTML через esc(), который кавычки превращает в &quot;.
   Если base64-строка повреждена (лишние пробелы/переносы) или содержит символы,
   ломающие разметку, браузер не может загрузить картинку — аватарка «исчезает»
   у других пользователей. Функция вычищает всё лишнее и отбрасывает явный мусор. */
function cleanPhotoURL(u) {
  if (!u || typeof u !== 'string') return '';
  var s = u.trim().replace(/[\s\r\n\t]+/g, '');
  if (s.indexOf('data:image/') === 0) {
    var m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=_-]+)$/.exec(s);
    return m ? ('data:image/' + m[1].replace('jpeg', 'jpg') + ';base64,' + m[2]) : '';
  }
  if (/^(https?:)?\/\//i.test(s)) return s;
  return '';
}

/* Аватар человека: фото (если есть и оно валидное), иначе SVG-инициалы.
   onError подставляет SVG-инициалы, если картинка по какой-то причине не загрузилась.
   square=true — аватарка без круга, на всю область секции (карточки коллег). */
function personAvatarHTML(p, size, cls, square) {
  var url = cleanPhotoURL(p && p.photo);
  var px = size || 96;
  var role = (p && p.roles && p.roles[0]) || 'res';
  var name = (p && p.name) || '';
  var klass = 'avatar-photo' + (square ? ' avatar-square' : '') + (cls ? ' ' + cls : '');
  if (!url) return avatarSVG(name, role, px, square);
  var fb = avatarSVG(name, role, px, square).replace(/"/g, '&quot;');
  return '<img class="' + klass + '" src="' + esc(url) + '" alt="Фото: ' + esc(name) + '"' +
    ' width="' + px + '" height="' + px + '"' +
    ' onerror="this.onerror=null;this.outerHTML=this.getAttribute(\'data-fb\')"' +
    ' data-fb="' + fb + '">';
}

window.OU_icons = {
  icon: icon,
  deptIconHTML: deptIconHTML,
  iconSelectHTML: iconSelectHTML,
  normalizeDept: normalizeDept,
  avatarSVG: avatarSVG,
  personAvatarHTML: personAvatarHTML,
  cleanPhotoURL: cleanPhotoURL,
  readImage: readImage,
  initialsOf: initialsOf,
  names: Object.keys(P),
  opts: DEPT_ICON_OPTS,
  facIcon: FAC_ICON
};
})();
