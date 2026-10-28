/* ============================================================
EXTRACT.JS — вычитывание текста и первой страницы из файлов
публикаций (PDF / Word .docx / старый .doc) средствами браузера,
без внешних загрузок и без сервера:
 • PDF  — разбор структуры файла прямо из base64/dataURL:
          потоки zlib inflate + вытаскивание строк Tj/TJ из
          содержимого страниц; первая страница рендерится через
          <embed> (браузерный просмотрщик PDF).
 • DOCX — ZIP-архив: stored-записи читаются напрямую, deflate —
          через DecompressionStream; текст берётся из word/document.xml.
 • DOC  — извлечение читаемых фрагментов из бинарного потока.
Полученный текст сохраняется в публикацию (поле text) и участвует
в поиске по названию, авторам и полному тексту работы.
============================================================ */
(function () {
'use strict';

/* ---------- БАЗОВЫЕ ХЕЛПЕРЫ ---------- */
function b64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}
function latin(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return s;
}
async function inflateBytes(bytes) {
    try {
        var ds = new DecompressionStream('deflate');
        var ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(ab);
    } catch (e) { return null; }
}
async function rawInflate(bytes) {
    try {
        var ds = new DecompressionStream('deflate-raw');
        var ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(ab);
    } catch (e) { return null; }
}

/* нормализация «мусора» после извлечения: склейка букв через пробел,
   сжатие повторяющихся знаков, обрезка длины */
function cleanText(s) {
    s = String(s || '')
        .replace(/\u0000/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/(\b\w)( \1\b ?){2,}/g, '$1')            /* aaa a a a → aaa */
        .replace(/([а-яa-z]) \1/gi, '$1$1')               /* «о о» → «оо» */
        .replace(/ {2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return s.slice(0, 200000);
}

/* ---------- PDF ---------- */
function pdfUnescapeStr(s) {
    return s.replace(/\\(\d{1,3})/g, function (_, o) {
            return String.fromCharCode(parseInt(o, 8));
        })
        .replace(/\\([nrtbf()\\])/g, function (_, c) {
            return { n: '\n', r: '\r', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[c];
        });
}
function decodePdfString(raw) {
    if (/^\(([^()]*)\)$/.test(raw)) raw = RegExp.$1;
    raw = pdfUnescapeStr(raw);
    /* UTF-16BE (BOM FE FF) — частый случай кириллицы в PDF */
    if (raw.charCodeAt(0) === 0xFE && raw.charCodeAt(1) === 0xFF) {
        var out = '';
        for (var i = 2; i + 1 < raw.length; i += 2) out += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
        return out;
    }
    /* WinAnsi / cp1251 для символов > 127: пытаемся прочесть как cp1251 */
    try {
        var bytes = new Uint8Array(raw.length);
        for (var j = 0; j < raw.length; j++) bytes[j] = raw.charCodeAt(j) & 0xFF;
        var u = new TextDecoder('windows-1251').decode(bytes);
        var cyr = (u.match(/[а-яА-ЯёЁ]/g) || []).length;
        var bad = (raw.match(/[\x80-\xFF]/g) || []).length;
        if (bad > 0 && cyr / bad >= 0.4) return u;
    } catch (e) {}
    return raw;
}
function extractOpsText(content) {
    var out = [];
    var re = /\((?:\\.|[^\\()])*\)\s*(?:(?:TJ)|(?:Tj))|(?:<[0-9A-Fa-f\s]+>)\s*Tj/g;
    var m;
    while ((m = re.exec(content))) {
        var tok = m[0];
        if (tok.charAt(0) === '<') {
            var hex = tok.replace(/<|>|Tj/g, '').replace(/\s+/g, '');
            var s = '';
            for (var i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
            out.push(decodePdfString(s));
        } else if (/TJ$/.test(tok)) {
            var parts = tok.match(/\((?:\\.|[^\\()])*\)/g) || [];
            out.push(parts.map(decodePdfString).join(''));
        } else {
            out.push(decodePdfString(tok.replace(/\s*Tj$/, '')));
        }
        out.push(' ');
    }
    return out.join('').replace(/\s+/g, ' ').trim();
}
async function extractPdf(bytes) {
    var head = latin(bytes);
    var res = { kind: 'pdf', text: '', pages: [] };
    /* словари шрифтов: ToUnicode → карта кодов для кириллицы */
    var cmapByFont = {};
    var fre = /\/BaseFont\s*\/([A-Za-z0-9+\-_]+)[\s\S]{0,900}?\/ToUnicode\s+(\d+)\s+0\s+R/g;
    var frm;
    while ((frm = fre.exec(head))) {
        var objRe = new RegExp('\\b' + frm[2] + '\\s+0\\s+obj([\\s\\S]*?)endobj');
        var om = head.match(objRe);
        if (!om) continue;
        var stm = om[1].match(/stream\r?\n?([\s\S]*?)endstream/);
        if (!stm) continue;
        var dictPart = om[1].slice(0, om[1].indexOf('stream'));
        var sm = dictPart.match(/\/Length\s+(\d+)/);
        var start = om[1].indexOf(stm[0]) + 'stream'.length + (stm[0].charAt(6) === '\r' ? 2 : 1);
        var len = sm ? Math.min(+sm[1], bytes.length - start) : (bytes.length - start);
        var data = bytes.subarray(start, start + len);
        if (/\/FlateDecode/.test(dictPart)) {
            var inf = await inflateBytes(data);
            if (inf) data = inf;
        }
        var cu = latin(data);
        var map = {};
        var cm = /beginbfchar([\s\S]*?)endbfchar|beginbfrange([\s\S]*?)endbfrange/g, cmm;
        while ((cmm = cm.exec(cu))) {
            var bodyTxt = cmm[1] != null ? cmm[1] : cmm[2];
            var pairs = bodyTxt.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) || [];
            pairs.forEach(function (pr) {
                var mm = pr.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)/);
                var code = parseInt(mm[1], 16), uni = parseInt(mm[2], 16);
                if (cmm[1] == null) {                       /* bfrange: третий аргумент — необязателен */
                    var rangeM = bodyTxt.slice(bodyTxt.indexOf(pr));
                    var third = rangeM.match(new RegExp('<' + mm[1] + '>\\s*<' + mm[2] + '>\\s*<([0-9A-Fa-f]+)>'));
                    var lo = code, hi = parseInt(mm[1], 16);
                    /* диапазон: <start> <end> <dstStart> */
                    var dm = pr.concat();
                    var full = bodyTxt.match(new RegExp('<([0-9A-Fa-f]+)>\\s*<([0-9A-Fa-f]+)>\\s*<' + mm[2] + '>'));
                    if (full) { lo = parseInt(full[1], 16); hi = parseInt(full[2], 16); }
                    for (var cc = lo; cc <= hi && uni < 0x10FFFF; cc++, uni++) map[cc] = uni;
                    if (third) { /* уже обработано */ }
                } else {
                    map[code] = uni;
                }
            });
        }
        cmapByFont[frm[1]] = map;
    }
    function applyCmap(text, font) {
        if (!font || !cmapByFont[font]) return text;
        var mp = cmapByFont[font];
        var conv = function (ch) { var c = ch.charCodeAt(0); return mp[c] != null ? String.fromCharCode(mp[c]) : ch; };
        return text.replace(/[\u0000-\u00FF]/g, function (ch) {
            var c = ch.charCodeAt(0);
            return mp[c] != null ? String.fromCharCode(mp[c]) : ch;
        });
    }
    /* все потоки с текстовыми операторами */
    var sre = /<<([\s\S]{0,400}?)>>\s*stream\r?\n?/g, psm, chunks = [];
    while ((psm = sre.exec(head))) {
        var dict = psm[1];
        if (!/\/FlateDecode/.test(dict)) continue;
        var lm = dict.match(/\/Length\s+(\d+)/);
        var dataStart = psm.index + psm[0].length;
        var segEnd = lm ? Math.min(dataStart + (+lm[1]), bytes.length) : bytes.length;
        var inf2 = await inflateBytes(bytes.subarray(dataStart, segEnd));
        if (!inf2) {
            inf2 = await inflateBytes(bytes.subarray(dataStart, segEnd - 10));
            if (!inf2) continue;
        }
        var content = latin(inf2);
        if (!/(?:Tj|TJ)\b/.test(content)) continue;
        /* текущий шрифт для cmap-подстановки */
        var text = extractOpsText(content);
        var fm = content.match(/\/(F\d+|[A-Za-z0-9+\-_]+)\s+[\d.]+\s+Tf/);
        if (text && fm) text = applyCmap(text, fm[1]);
        if (text) chunks.push({ pos: psm.index, text: text });
    }
    chunks.sort(function (a, b) { return a.pos - b.pos; });
    res.text = cleanText(chunks.map(function (c) { return c.text; }).join('\n'));
    /* если разбор не дал осмысленного текста — грубая сигнатура байтов */
    if (res.text.replace(/\S/g, '').length > res.text.length * 0.7) {
        var rough = cleanText(head.replace(/[^\x20-\x7E\xD0-\xFFа-яА-ЯёЁ ]/g, ' ').slice(0, 50000));
        if (rough.length > res.text.length) res.text = rough;
    }
    return res;
}

/* ---------- DOCX (ZIP) ---------- */
async function extractDocx(bytes) {
    var targets = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
    function xmlToText(xml) {
        return xml
            .replace(/<w:tab[^>]*\/>/g, '\t')
            .replace(/<\/w:p>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }
    var parts = [];
    for (var t = 0; t < targets.length; t++) {
        var xml = null;
        try { xml = await readZipEntry(bytes, targets[t]); } catch (e) {}
        if (!xml) continue;
        parts.push(xmlToText(xml));
    }
    return { kind: 'docx', text: cleanText(parts.join('\n')) };
}

/* ---------- DOC (старый бинарный Word) ---------- */
function extractDoc(bytes) {
    /* грубое извлечение читаемых кусков: последовательности печатных
       символов (включая кириллицу cp1251) длиной >= 4 */
    var dec = new TextDecoder('windows-1251');
    var s = dec.decode(bytes.subarray(0, Math.min(bytes.length, 2000000)));
    var m = s.match(/[\x20-\x7E\u00C0-\u00FF\u0400-\u04FF\u4510]{4,}/g);
    var text = (m || []).join(' ');
    /* отбрасываем явные служебные артефакты */
    text = text.replace(/\.(wmf|emf|bin|tmp|xml|odttf|rels|png|jpg)/gi, ' ');
    return { kind: 'doc', text: cleanText(text) };
}

/* ---------- УНИВЕРСАЛЬНЫЙ ВХОД ---------- */
/* fileData — dataURL ('data:...;base64,...') или чистый base64 */
async function extractFromFile(fileData, fileName) {
    var name = String(fileName || '').toLowerCase();
    var out = { text: '', preview: '', previewType: '' };
    try {
        var comma = fileData.indexOf(',');
        var b64 = fileData.startsWith('data:') ? fileData.slice(comma + 1) : fileData;
        var bytes = b64ToBytes(b64);
        var kind = /\.docx$/.test(name) ? 'docx' : (/\.doc$/.test(name) ? 'doc' : (/\.pdf$/.test(name) ? 'pdf' : ''));
        if (!kind) {
            var sig = latin(bytes.subarray(0, 8));
            if (sig.indexOf('%PDF') === 0) kind = 'pdf';
            else if (sig.indexOf('PK') === 0) kind = 'docx';
            else if (dv_isOle(bytes)) kind = 'doc';
        }
        if (kind === 'pdf') {
            var r = await extractPdf(bytes);
            out.text = r.text;
            out.previewType = 'pdf';
            out.preview = fileData;
        } else if (kind === 'docx') {
            out.text = (await extractDocx(bytes)).text;
        } else if (kind === 'doc') {
            out.text = extractDoc(bytes).text;
        }
    } catch (e) {
        console.warn('extractFromFile:', e);
    }
    return out;
}
function dv_isOle(bytes) {
    return bytes.length > 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
}

/* ---------- ПЕРВАЯ СТРАНИЦА ФАЙЛА (для карточки и страницы работы) ---------- */
/* Слово «обложка» здесь не используется: на карточке показывается именно
   ПЕРВАЯ СТРАНИЦА файла.
 • DOCX — настоящая первая страница документа: содержимое word/document.xml
          превращается в HTML-вёрстку A4 (размеры шрифта, жирный, поля,
          выравнивание, таблицы), снимается через SVG foreignObject → canvas
          и сохраняется как PNG. Текст при этом нигде не отображается
          «живым» текстом — только как картинка; сам же вычитанный текст
          хранится отдельно (ou_pub_texts) для поиска.
 • PDF  — первая страница показывается встроенным просмотрщиком браузера
          (<iframe>/<embed> по файлу, листать нельзя); если подключён
          pdf.js — дополнительно делается PNG-снимок для хранения.
 • DOC  — бинарный Word без MS Word не отрисовать, поэтому рисуем титул
          из данных работы и первых строк вычитанного текста на листе A4.
Если ничего не удалось — остаётся запасной вариант (SVG-паттерн). */

function wrapLines(ctx, text, maxW, maxLines) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var lines = [], cur = '';
    for (var i = 0; i < words.length && lines.length < maxLines; i++) {
        var test = cur ? cur + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[i]; }
        else cur = test;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    return lines;
}

/* титульный лист A4 для старых .doc — canvas */
function docTitlePNG(p) {
    try {
        var W = 595, H = 842;
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var g = c.getContext('2d');
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
        g.textAlign = 'center';
        g.font = '600 13px Georgia, serif';
        g.fillStyle = '#8B8578';
        g.fillText(String(p.venue || '').toUpperCase().slice(0, 44), W / 2, 92);
        g.fillStyle = '#211F1A';
        g.font = '700 23px Georgia, serif';
        wrapLines(g, p.title, W - 120, 6).forEach(function (ln, i) { g.fillText(ln, W / 2, 170 + i * 32); });
        g.font = '400 15px Georgia, serif';
        g.fillStyle = '#6E6759';
        g.fillText(String(p.authors || '').slice(0, 64), W / 2, 372);
        g.fillText(String(p.year || ''), W / 2, 398);
        var body = pubTextOf(p) || p.abstract || '';
        g.fillStyle = '#211F1A'; g.font = '400 12.5px Georgia, serif'; g.textAlign = 'left';
        wrapLines(g, body, W - 130, 22).forEach(function (ln, i) { g.fillText(ln, 65, 452 + i * 19); });
        g.textAlign = 'center'; g.fillStyle = '#B8A98A'; g.font = 'italic 11px Georgia, serif';
        g.fillText('первая страница · DOC', W / 2, H - 46);
        return c.toDataURL('image/jpeg', 0.85);
    } catch (e) { return ''; }
}

/* ---------- ВСПОМОГАТЕЛЬНЫЕ ---------- */
function dataUrlBytes(dataUrl) {
    var s = String(dataUrl || '');
    var comma = s.indexOf(',');
    var b64 = s.startsWith('data:') ? s.slice(comma + 1) : s;
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}
function canvasPNG(c) {
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
}

/* ---------- ЧТЕНИЕ ФАЙЛОВ ИЗ ZIP (DOCX) ---------- */
/* общий проход по центральному каталогу архива */
function zipEntries(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return [];
    var count = dv.getUint16(eocd + 10, true);
    var ptr = dv.getUint32(eocd + 16, true);
    var list = [];
    for (var n = 0; n < count; n++) {
        if (dv.getUint32(ptr, true) !== 0x02014b50) break;
        var method = dv.getUint16(ptr + 10, true);
        var compSize = dv.getUint32(ptr + 20, true);
        var nameLen = dv.getUint16(ptr + 28, true);
        var extraLen = dv.getUint16(ptr + 30, true), commentLen = dv.getUint16(ptr + 32, true);
        var localOff = dv.getUint32(ptr + 42, true);
        var name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
        list.push({ name: name, method: method, compSize: compSize, localOff: localOff });
        ptr += 46 + nameLen + extraLen + commentLen;
    }
    return list;
}
async function readZipEntry(bytes, wantName) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var es = zipEntries(bytes);
    for (var i = 0; i < es.length; i++) {
        var e = es[i];
        if (e.name !== wantName) continue;
        var lh = e.localOff;
        if (dv.getUint32(lh, true) !== 0x04034b50) return null;
        var nl = dv.getUint16(lh + 26, true), el = dv.getUint16(lh + 28, true);
        var dataStart = lh + 30 + nl + el;
        var raw = bytes.subarray(dataStart, dataStart + e.compSize);
        var data = null;
        if (e.method === 0) data = raw;
        else if (e.method === 8) data = await inflateBytes(raw);
        if (!data) return null;
        return new TextDecoder('utf-8').decode(data);
    }
    return null;
}

/* ---------- OOXML → HTML (только первая страница) ---------- */
function xmlEsc(s) {
    var e = window.OU_esc || function (x) {
        return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    return e(s);
}
function attrVal(attrs, name) {
    var m = String(attrs || '').match(new RegExp(name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '="([^"]*)"'));
    return m ? m[1] : null;
}
function runsHtml(chunk) {
    var out = '', re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g, m;
    while ((m = re.exec(chunk))) {
        if (m[1] != null) out += xmlEsc(m[1]);
        else if (/^<w:tab/.test(m[0])) out += '&emsp;';
        else out += '<br>';
    }
    return out;
}
/* стили абзаца/символа из styles.xml (по w:pStyle / w:rStyle) */
function parseDocxStyles(xml) {
    var styles = {};
    if (!xml) return styles;
    var re = /<w:style\b[^>]*>([\s\S]*?)<\/w:style>/g, m;
    while ((m = re.exec(xml))) {
        var openTag = m[0].slice(0, m[0].indexOf('>'));
        var id = attrVal(openTag, 'w:styleId');
        if (!id) continue;
        var body = m[1];
        var info = {};
        var sz = body.match(/<w:sz w:val="(\d+)"/);
        if (sz) info.sizePx = (+sz[1]) / 2;
        if (/<w:b\s*\/>/.test(body) || /<w:b w:val="(1|true|on)"/.test(body)) info.bold = true;
        var jc = body.match(/<w:jc w:val="(\w+)"/);
        if (jc) info.align = jc[1];
        var ind = body.match(/<w:ind ([^>]*)\/>/);
        if (ind) {
            var fl = attrVal(ind[1], 'w:firstLine');
            if (fl) info.firstLinePx = Math.round(+fl / 20);
        }
        styles[id] = info;
    }
    return styles;
}
function docxXmlToHtml(docXml, stylesXml) {
    var styles = parseDocxStyles(stylesXml);
    var pageSize = { w: 11906, h: 16838, ml: 1800, mr: 1800, mt: 1300, mb: 1300 }; /* A4, поля ~3 см */
    var mSec = docXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
    if (mSec) {
        var pgSz = mSec[0].match(/<w:pgSz([^>]*)\/?>/);
        if (pgSz) {
            var mw = attrVal(pgSz[1], 'w:w'), mh = attrVal(pgSz[1], 'w:h');
            if (mw) pageSize.w = +mw;
            if (mh) pageSize.h = +mh;
        }
        var pgMar = mSec[0].match(/<w:pgMar([^>]*)\/?>/);
        if (pgMar) {
            [['ml', 'w:left'], ['mr', 'w:right'], ['mt', 'w:top'], ['mb', 'w:bottom']].forEach(function (pair) {
                var v = attrVal(pgMar[1], pair[1]);
                if (v != null) pageSize[pair[0]] = +v;
            });
        }
    }
    var bi = docXml.indexOf('<w:body>');
    var body = bi >= 0 ? docXml.slice(bi + 8) : docXml;
    var endIdx = body.lastIndexOf('</w:body>');
    if (endIdx > 0) body = body.slice(0, endIdx);
    /* обрезаем по первому разрыву страницы — нужна только первая страница */
    var brk = body.search(/<w:lastRenderedPageBreak|<w:br[^>]*w:type="page"/);
    if (brk > 0) body = body.slice(0, brk);

    function paraHtml(inner) {
        var pPrM = inner.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
        var css = '';
        var styleInfo = {};
        if (pPrM) {
            var stl = attrVal(pPrM[1], 'w:val');
            var ps = pPrM[1].match(/<w:pStyle w:val="([^"]+)"/);
            if (ps && styles[ps[1]]) styleInfo = styles[ps[1]];
            var jc = pPrM[1].match(/<w:jc w:val="(\w+)"/);
            var align = jc ? jc[1] : styleInfo.align;
            if (align) css += 'text-align:' + ({ center: 'center', right: 'right', both: 'justify', distribute: 'justify' }[align] || 'left') + ';';
            var ind = pPrM[1].match(/<w:ind ([^>]*)\/>/);
            var fl = ind ? attrVal(ind[1], 'w:firstLine') : null;
            if (fl == null && styleInfo.firstLinePx) fl = String(styleInfo.firstLinePx * 20);
            if (fl != null) css += 'text-indent:' + Math.round(+fl / 20) + 'px;';
        }
        /* размер/жирность первого значимого run'а */
        var sizePx = styleInfo.sizePx || 0;
        var bold = !!styleInfo.bold;
        var rPrM = inner.match(/<w:r>\s*<w:rPr>([\s\S]*?)<\/w:rPr>/);
        if (rPrM) {
            var sz = rPrM[1].match(/<w:sz w:val="(\d+)"/);
            if (sz) sizePx = Math.max(sizePx, (+sz[1]) / 2);
            if (/<w:b\s*\/>/.test(rPrM[1]) || /<w:b w:val="(1|true|on)"/.test(rPrM[1])) bold = true;
        }
        if (!sizePx && !bold && /\bHeading|\bTitle|Zag|title/i.test(JSON.stringify(styleInfo))) sizePx = 18;
        var txt = runsHtml(inner);
        if (!txt.trim()) return '';
        if (bold) txt = '<span style="font-weight:bold">' + txt + '</span>';
        return '<p style="' + css + (sizePx ? 'font-size:' + sizePx + 'px;' : '') + '">' + txt + '</p>';
    }

    /* верхнеуровневые элементы идут по порядку: абзацы и таблицы */
    var html = '';
    var re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g, m;
    while ((m = re.exec(body))) {
        var chunk = m[0];
        if (chunk.indexOf('<w:tbl>') === 0) {
            var rows = '';
            var trRe = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, tm;
            while ((tm = trRe.exec(chunk))) {
                var cells = '';
                var tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g, cm;
                while ((cm = tcRe.exec(tm[0]))) cells += '<td>' + runsHtml(cm[0]) + '</td>';
                rows += '<tr>' + cells + '</tr>';
            }
            html += '<table>' + rows + '</table>';
        } else {
            var innerStart = chunk.indexOf('>');
            var inner = chunk.replace(/^<w:p\b[^>]*>/, '').replace(/<\/w:p>$/, '');
            if (chunk.indexOf('/>') > -1 && inner === chunk) continue;
            html += paraHtml(inner);
        }
    }
    var px = {};
    Object.keys(pageSize).forEach(function (k) { px[k] = Math.round(pageSize[k] / 20); });
    return { html: html, px: px };
}
/* снимок HTML-страницы A4 в PNG (без внешних библиотек) */
function htmlPageToPng(innerHtml, pw, ph, pad) {
    return new Promise(function (resolve) {
        try {
            var scale = 2;
            var doc =
                '<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:' + pw + 'px;height:' + ph + 'px;' +
                'padding:' + pad.top + 'px ' + pad.right + 'px ' + pad.bottom + 'px ' + pad.left + 'px;background:#ffffff;' +
                "font-family:'Times New Roman',Times,serif;font-size:14px;line-height:1.5;color:#111;overflow:hidden;" +
                'text-align:justify;">' + innerHtml + '</div>';
            var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (pw * scale) + '" height="' + (ph * scale) + '">' +
                '<foreignObject x="0" y="0" width="' + pw + '" height="' + ph + '">' + doc + '</foreignObject></svg>';
            var img = new Image();
            img.onload = function () {
                try {
                    var c = document.createElement('canvas');
                    c.width = pw * scale; c.height = ph * scale;
                    var g = c.getContext('2d');
                    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
                    g.drawImage(img, 0, 0, c.width, c.height);
                    resolve(canvasPNG(c));
                } catch (e) { resolve(''); }
            };
            img.onerror = function () { resolve(''); };
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        } catch (e) { resolve(''); }
    });
}
async function renderDocxFirstPage(bytes, meta) {
    var xml = await readZipEntry(bytes, 'word/document.xml');
    if (!xml) return '';
    var styles = await readZipEntry(bytes, 'word/styles.xml').catch(function () { return ''; });
    var r = docxXmlToHtml(xml, styles);
    if (!r.html.trim()) return '';
    var bodyHtml = r.html;
    if (meta && meta.title) {
        var low = bodyHtml.toLowerCase();
        if (low.indexOf(String(meta.title).toLowerCase().slice(0, 20)) < 0) {
            bodyHtml = '<h1 style="font-size:20px;text-align:center;margin:0 0 16px;font-weight:bold">' + xmlEsc(meta.title) + '</h1>' + bodyHtml;
        }
    }
    return await htmlPageToPng(bodyHtml, r.px.w, r.px.h,
        { top: r.px.mt, right: r.px.mr, bottom: r.px.mb, left: r.px.ml });
}

/* ---------- ТОЧКА ВХОДА: СОЗДАТЬ ПЕРВУЮ СТРАНИЦУ ДЛЯ ЗАГРУЖЕННОГО ФАЙЛА ---------- */
/* Возвращает { firstPageImg, previewType }. firstPageImg — PNG первой
   страницы (хранится в записи публикации и больше нигде не показывается
   как текст). Для PDF firstPageImg обычно пуст: страницу рисует сам
   браузер через <iframe>, это надёжнее любого снимка. */
async function makeFirstPage(fileData, fileName, meta) {
    var out = { firstPageImg: '', previewType: '' };
    try {
        var bytes = dataUrlBytes(fileData);
        var name = String(fileName || '').toLowerCase();
        var sig = latin(bytes.subarray(0, 8));
        var kind = '';
        if (/^%PDF/.test(sig) || /\.pdf$/.test(name)) kind = 'pdf';
        else if (/^PK/.test(sig)) kind = 'docx';
        else if (dv_isOle(bytes) || /\.doc$/.test(name)) kind = 'doc';
        if (kind === 'pdf') {
            out.previewType = 'pdf';
        } else if (kind === 'docx') {
            var png = await renderDocxFirstPage(bytes, meta || {});
            out.firstPageImg = png || docTitlePNG(Object.assign({ fileName: name }, meta || {}));
            out.previewType = 'img';
        } else if (kind === 'doc') {
            out.firstPageImg = docTitlePNG(Object.assign({ fileName: name }, meta || {}));
            out.previewType = 'img';
        }
    } catch (e) { console.warn('makeFirstPage:', e); }
    return out;
}

/* ---------- ПОИСК ПО ВЫЧИТАННОМУ ТЕКСТУ ---------- */
const PUB_TEXT_KEY = 'ou_pub_texts';
let _pubTexts = null;
function pubTexts() {
    if (_pubTexts == null) {
        try { _pubTexts = JSON.parse(localStorage.getItem(PUB_TEXT_KEY)) || {}; }
        catch (e) { _pubTexts = {}; }
    }
    return _pubTexts;
}
function setPubText(id, text) {
    var o = pubTexts();
    id = String(id);
    if (text) o[id] = cleanText(text).slice(0, 120000);
    else delete o[id];
    try { localStorage.setItem(PUB_TEXT_KEY, JSON.stringify(o)); }
    catch (e) {
        /* хранилище переполнено — урезаем самые длинные записи */
        try {
            var keys = Object.keys(o);
            for (var i = 0; i < keys.length; i++) {
                if (o[keys[i]].length > 30000) o[keys[i]] = o[keys[i]].slice(0, 30000);
            }
            localStorage.setItem(PUB_TEXT_KEY, JSON.stringify(o));
        } catch (e2) {}
    }
}
function pubTextOf(p) {
    if (!p) return '';
    if (p.text) return p.text;
    return pubTexts()[String(p.id)] || '';
}
/* фильтр списка публикаций по запросу: поля + полный текст файла.
   matches берётся из app.js (окно раскрывается ниже через window.matches) */
function filterPubsByQuery(list, q) {
    if (!q) return list;
    var mf = window.matches || function (qq, s) { return String(s || '').toLowerCase().indexOf(qq) >= 0; };
    return list.filter(function (p) {
        return mf(q, p.title, p.authors, p.venue || '', p.abstract || '') ||
            pubTextOf(p).toLowerCase().indexOf(q) >= 0;
    });
}

/* ---------- ОБЛОЖКА КАРТОЧКИ ---------- */
function coverKind(fileName) {
    var n = String(fileName || '').toLowerCase();
    if (/\.pdf$/.test(n)) return 'PDF';
    if (/\.docx?$/.test(n)) return 'WORD';
    return '';
}
/* есть ли у публикации файл первой страницы для показа на карточке */
function hasFirstPage(p) {
    if (!p) return false;
    if (p.fileData && /\.pdf$/i.test(p.fileName || '')) return true;
    if (p.file && /\.pdf$/i.test(p.file)) return true;
    if (p.firstPageImg) return true;
    return false;
}

/* ---------- СКАЧИВАНИЕ РАБОТЫ В PDF ---------- */
/* Минимальный генератор PDF 1.4 прямо в браузере: текст страниц
   кодируется побайтово в кодировке cp1251 (стандартная кириллическая
   кодировка PDF с базовыми шрифтами Helvetica/Times), перенос по словам
   считается canvas'ом, разбивка на страницы A4 — по высоте строк.
   Работает без сети и внешних библиотек. */
var CP1251_EXTRA = {
    'Ђ': 0x80, 'Ћ': 0x81, '‚': 0x82, 'ѓ': 0x83, '„': 0x84, '…': 0x85,
    '†': 0x86, '‡': 0x87, '€': 0x88, '‰': 0x89, 'Љ': 0x8A, '‹': 0x8B,
    'Њ': 0x8C, 'Ќ': 0x8D, 'Ў': 0x8E, 'ћ': 0x8F, '‘': 0x91, '’': 0x92,
    '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'ў': 0x98,
    'џ': 0x99, 'љ': 0x9A, '›': 0x9B, 'њ': 0x9C, 'ќ': 0x9D, 'љ': 0x9E,
    '№': 0x99, '™': 0x99, 'ъ': 0xAD,
    'Ё': 0xA8, 'ё': 0xB8, '«': 0xAB, '»': 0xBB
};
function toCp1251(s) {
    var out = new Uint8Array(s.length * 2), o = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c === 0x09 || c === 0x0A || c === 0x0D) continue;
        if (c < 0x80) out[o++] = c;
        else if (c >= 0xC0 && c <= 0xFF) out[o++] = c;            /* А-Я а-я Ё ё ≈ latin1 */
        else if (CP1251_EXTRA[s[i]] != null) out[o++] = CP1251_EXTRA[s[i]];
        else out[o++] = 0x3F;                                     /* '?' */
    }
    return out.subarray(0, o);
}
function pdfEscBytes(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
        var b = bytes[i];
        if (b === 0x28 || b === 0x29 || b === 0x5C) s += '\\' + String.fromCharCode(b);
        else s += String.fromCharCode(b);
    }
    return s;
}
/* мягкий перенос длинного слова по слогам-ish, чтобы влезало в ширину */
function pdfWrap(text, fontCss, maxW, ctx) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var lines = [], cur = '';
    ctx.font = fontCss;
    for (var i = 0; i < words.length; i++) {
        var w = words[i];
        while (ctx.measureText(w).width > maxW && w.length > 6) {
            var cut = Math.floor(w.length / 2);
            while (cut > 2 && ctx.measureText(w.slice(0, cut)).width > maxW) cut--;
            if (cur) { lines.push(cur); cur = ''; }
            lines.push(w.slice(0, cut - 1) + '-');
            w = w.slice(cut - 1);
        }
        var test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
        else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
}
async function buildWorkPdf(p) {
    var W = 595.28, H = 841.89;                       /* A4 в пунктах */
    var ML = 70, MR = 70, MT = 80, MB = 70;
    var CW = W - ML - MR;
    var meas = document.createElement('canvas').getContext('2d');
    var F = {
        title: { css: 'bold 19px Helvetica, Arial, sans-serif', size: 19 },
        meta:  { css: '11px Helvetica, Arial, sans-serif', size: 11 },
        h2:    { css: 'bold 13px Helvetica, Arial, sans-serif', size: 13 },
        body:  { css: '12px Helvetica, Arial, sans-serif', size: 12 }
    };
    var blocks = [];                                   /* {font, text, gap} */
    blocks.push({ f: F.title, t: p.title || 'Публикация', gap: 10 });
    blocks.push({ f: F.meta, t: 'Авторы: ' + (p.authors || '—'), gap: 4 });
    blocks.push({ f: F.meta, t: 'Год: ' + (p.year || '—') + '   ·   Издание: ' + (p.venue || '—'), gap: 4 });
    if (p.supervisor) { blocks.push({ f: F.meta, t: 'Научный руководитель: ' + p.supervisor, gap: 4 }); }
    if (p.license) { blocks.push({ f: F.meta, t: 'Лицензия: ' + p.license, gap: 4 }); }
    blocks.push({ f: F.meta, t: 'Открытый Университет — реестр научных работ', gap: 22 });
    if (p.abstract) {
        blocks.push({ f: F.h2, t: 'Аннотация', gap: 6 });
        blocks.push({ f: F.body, t: p.abstract, gap: 20 });
    }
    var body = pubTextOf(p);
    if (body) {
        blocks.push({ f: F.h2, t: 'Текст работы', gap: 8 });
        blocks.push({ f: F.body, t: body, gap: 12 });
    } else {
        blocks.push({ f: F.body, t: '(Полный текст работы недоступен: файл не был вычитан при загрузке.)', gap: 12 });
    }
    /* раскладка по строкам и страницам */
    var LH = 1.45;
    var lines = [];                                    /* {text, size, bold-gap} */
    blocks.forEach(function (b) {
        pdfWrap(b.t, b.f.css, CW, meas).forEach(function (ln) {
            lines.push({ text: ln, size: b.f.size });
        });
        for (var g = b.gap; g > 0;) { lines.push({ text: '', size: Math.min(g, 8) }); g -= 8; }
    });
    var pages = [], cur = [], y = MT;
    lines.forEach(function (ln) {
        var h = ln.text ? ln.size * LH : ln.size;
        if (y + h > H - MB && cur.length) { pages.push(cur); cur = []; y = MT; }
        cur.push({ text: ln.text, size: ln.size, y: y + ln.size });
        y += h;
    });
    if (cur.length) pages.push(cur);
    if (!pages.length) pages.push([]);
    /* нумерация страниц */
    pages.forEach(function (pg, idx) {
        pg.push({ text: String(idx + 1), size: 9, y: H - MB + 22, cx: W / 2 });
    });
    /* сборка объектов PDF */
    var objs = [];                                     /* строки тела объектов без "n 0 obj" */
    function addObj(bodyStr) { objs.push(bodyStr); return objs.length; }  /* id = индекс+1 */
    var N = pages.length;
    var fontH = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var fontB = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var pageIds = [], contentIds = [];
    pages.forEach(function (pg) {
        var ops = 'BT\n';
        pg.forEach(function (ln) {
            if (!ln.text) return;
            var bold = ln.size >= 13;
            ops += '/F' + (bold ? '2' : '1') + ' ' + ln.size + ' Tf\n';
            if (ln.cx != null) ops += '1 0 0 1 ' + (ln.cx - ln.size * 0.28 * ln.text.length).toFixed(1) + ' ' + (H - ln.y).toFixed(1) + ' Tm\n';
            else ops += '1 0 0 1 ' + ML + ' ' + (H - ln.y).toFixed(1) + ' Tm\n';
            ops += '(' + pdfEscBytes(toCp1251(ln.text)) + ') Tj\n';
        });
        ops += 'ET\n';
        contentIds.push(addObj('stream\n' + ops + 'endstream'));
        pageIds.push(null);                            /* заполним ниже */
    });
    var kidsStr = pageIds.map(function (_, i) { return (i + 1) + ' 0 R'; }).join(' ');
    /* объекты страниц идут сразу после контентов: id страницы i = fontB+1+i? — проще:
       создаём их сейчас, а catalog/pages в конце */
    pages.forEach(function (pg, i) {
        pageIds[i] = objs.length + 1;
        addObj('<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2) + '] ' +
            '/Resources << /Font << /F1 ' + fontH + ' 0 R /F2 ' + fontB + ' 0 R >> >> ' +
            '/Contents ' + contentIds[i] + ' 0 R >>');
    });
    var pagesId = addObj('<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] /Count ' + N + ' >>');
    /* проставляем /Parent в объектах страниц */
    pages.forEach(function (pg, i) {
        objs[pageIds[i] - 1] = objs[pageIds[i] - 1].replace('/Parent 0 0 R', '/Parent ' + pagesId + ' 0 R');
    });
    var infoId = addObj('<< /Title (' + pdfEscBytes(toCp1251(String(p.title || 'Публикация').slice(0, 120))) + ') /Producer (Open University) >>');
    var catalogId = addObj('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
    /* бинарная сборка с xref */
    var chunks = [], pos = 0;
    function push(s) { var b = new TextEncoder().encode(s); chunks.push(b); pos += b.length; }
    var header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    var hb = new Uint8Array(header.length);
    for (var q = 0; q < header.length; q++) hb[q] = header.charCodeAt(q) & 0xFF;
    chunks.push(hb); pos += hb.length;
    var offsets = [];
    objs.forEach(function (bodyStr, i) {
        offsets.push(pos);
        push((i + 1) + ' 0 obj\n' + bodyStr + '\nendobj\n');
    });
    var xrefPos = pos;
    var total = objs.length + 1;
    var xr = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { xr += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    push(xr);
    push('trailer\n<< /Size ' + total + ' /Root ' + catalogId + ' 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');
    var out = new Uint8Array(pos), off = 0;
    chunks.forEach(function (c) { out.set(c, off); off += c.length; });
    return out;
}
/* вернуть dataURL готового PDF работы (для кнопки «Скачать в PDF») */
async function workPdfDataUrl(p) {
    try {
        var bytes = await buildWorkPdf(p);
        var bin = '', CH = 0x8000;
        for (var i = 0; i < bytes.length; i += CH) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return 'data:application/pdf;base64,' + btoa(bin);
    } catch (e) { console.warn('workPdfDataUrl:', e); return ''; }
}

window.OU_extract = {
    extractFromFile: extractFromFile,
    cleanText: cleanText,
    docTitlePNG: docTitlePNG,
    makeFirstPage: makeFirstPage,
    pubTextOf: pubTextOf,
    setPubText: setPubText,
    filterPubsByQuery: filterPubsByQuery,
    coverKind: coverKind,
    hasFirstPage: hasFirstPage,
    workPdfDataUrl: workPdfDataUrl
};
})();
