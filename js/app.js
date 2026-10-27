/* ============================================================
OPEN UNIVERSITY · ЛОГИКА ВСЕХ СТРАНИЦ
Коллеги = все люди. Знакомые = личный список на «Моей странице».
Синхронизация всего — через store.js (CloudSync + CloudFiles).
============================================================ */
(function () {
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const searchEl = () => document.getElementById('siteSearch');
let DEPTS = [];
let DEPT_BY_N = {};

const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function shortenName(name, maxLen = 28) {
  if (!name || name.length <= maxLen) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 3) return name;
  // Сокращаем отчество до инициала
  parts[2] = parts[2][0] + '.';
  const result = parts.join(' ');
  // Если всё ещё длинно — сокращаем имя
  if (result.length > maxLen && parts.length >= 2) {
    parts[1] = parts[1][0] + '.';
  }
  return parts.join(' ');
}

function plural(n, forms) {
    n = Math.abs(n) % 100;
    const d = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (d > 1 && d < 5) return forms[1];
    if (d === 1) return forms[0];
    return forms[2];
}
function stagger(nodes) {
    if (REDUCED) return;
    nodes.forEach((el, i) => { el.style.animationDelay = Math.min(i * 25, 400) + 'ms'; });
}
function buildFilters(items, current, onPick) {
    const box = $('#filters');
    if (!box) return;
    box.innerHTML = items
        .map((it) => '<button class="fbtn' + (it.key === current ? ' on' : '') + '" data-k="' + esc(it.key) + '">' + esc(it.label) + '</button>')
        .join('');

    let touched = false;
    function handlePick(e) {
        const btn = e.target.closest('.fbtn');
        if (!btn) return;
        if (e.type === 'touchend') {
            e.preventDefault();
            touched = true;
            setTimeout(() => { touched = false; }, 400);
        } else if (touched) {
            return;
        }
        box.querySelectorAll('.fbtn').forEach((b) => b.classList.toggle('on', b === btn));
        onPick(btn.dataset.k);
    }
    box.addEventListener('touchend', handlePick, { passive: false });
    box.addEventListener('click', handlePick);
}

const initialsOf = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('');
const matches = (q, ...fields) => fields.join(' ').toLowerCase().includes(q);
const nextPubId = () => Math.max(0, ...(Store.pubs || []).map((p) => p.id)) + 1;
const sortPubs = (list) => list.slice().sort((a, b) => b.year - a.year || a.id - b.id);
const pubsOf = (person) => person.short
    ? sortPubs((Store.pubs || []).filter((p) => p.authors.includes(person.short)))
    : [];
const effectiveUser = () => {
  const base = Object.assign({}, USER, LocalProfile.get(), LocalPeopleOvr.get(USER.id));
  /* фото из общего синхронизируемого слоя — приоритетнее локальных копий:
     так аватарку человека видят все пользователи (включая его собственную страницу) */
  try {
    if (window.LocalPeoplePhotos) {
      const ph = LocalPeoplePhotos.byId(base.id);
      if (ph && ph.photo) base.photo = ph.photo;
    }
  } catch (e) {}
  return base;
};
const personById = (id) => (id === USER.id ? effectiveUser() : (Store.people || []).find((x) => x.id === id));
const personByShort = (short) => {
    if (!short) return null;
    if (short === USER.short) return effectiveUser();
    return (Store.people || []).find((x) => x.short === short);
};
const hasConflict = (p, person) =>
    p.authors.includes(person.short) || (p.supervisor || '').includes(person.short);
const canManageDept = (d) => !!d && !USER.guest &&
    (isAdmin(USER) || (d.createdBy != null && d.createdBy === USER.id));

function deptStats(n) {
    const ppl = (Store.people || []).filter((p) => p.dept === n);
    const pubs = (Store.pubs || []).filter((p) => p.dept === n);
    return {
        d: ppl.filter((p) => p.deg === 'd').length,
        k: ppl.filter((p) => p.deg === 'k').length,
        a: ppl.filter((p) => p.deg === 'a').length,
        ch: ppl.length,
        w: pubs.length,
        r: ppl.filter((p) => (p.roles || []).includes('rev')).length,
        s: ppl.filter((p) => (p.roles || []).includes('sup')).length,
        i: ppl.filter((p) => (p.roles || []).includes('res')).length,
        t: ppl.filter((p) => (p.roles || []).includes('trn')).length
    };
}

function authorsHTML(p) {
    return p.authors.split(',').map((s) => s.trim()).filter(Boolean)
        .map((a) => {
            const person = personByShort(a);
            return person ? '<a href="profile.html?id=' + person.id + '">' + esc(a) + '</a>' : esc(a);
        }).join(', ');
}

const STOP = new Set(['и','в','во','не','на','с','по','для','от','об','о','а','к','у','как','но','что','это','при','из','за','the','of','and']);
const wordsOf = (t) => (t || '').toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

function similarPubs(p, n) {
    const ws = wordsOf(p.title + ' ' + (p.abstract || ''));
    return (Store.pubs || [])
        .filter((x) => x.id !== p.id)
        .map((x) => {
            const other = new Set(wordsOf(x.title + ' ' + (x.abstract || '')));
            let score = 0;
            ws.forEach((w) => { if (other.has(w)) score++; });
            if (x.dept === p.dept) score += 2;
            return { x: x, score: score };
        })
        .filter((o) => o.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, n || 3)
        .map((o) => o.x);
}

function deptLabel(p) {
    if (p.dept == null) return { fac: 'Без кафедры', title: 'Без кафедры' };
    const d = DEPT_BY_N[p.dept];
    return d ? { fac: d.f, title: d.t } : { fac: 'Без кафедры', title: 'Кафедра не найдена' };
}

const ROLE_COLOR = { rev: 'var(--bd)', res: 'var(--bk)', sup: 'var(--ba)', trn: '#3E6C8E', adm: '#6B2D5C' };

function personCard(p) {
  const lab = deptLabel(p);
  const r0 = (p.roles && p.roles[0]) || 'res';
  const ROLE_BG = { rev: '#C41E3A', res: '#2D6A4F', sup: '#1D3557', trn: '#3E6C8E', adm: '#6B2D8B' };
  const initials = initialsOf(p.name);
  const roles = (p.roles || []).map((r) => ROLES[r]
    ? `<span class="stat"><span class="b b-${r}" style="background:${ROLE_BG[r] || '#2D6A4F'}">${ROLES[r].letter}</span></span>`
    : '').join('');
  const avIcon = (window.OU_icons && OU_icons.personAvatarHTML)
    ? OU_icons.personAvatarHTML(p, 96)
    : (p.photo
        ? '<img class="avatar-photo avatar-svg" src="' + esc(p.photo) + '" alt="Фото: ' + esc(p.name) + '">'
        : ((window.OU_icons && OU_icons.avatarSVG)
            ? OU_icons.avatarSVG(p.name, r0, 96)
            : `<span class="emoji-icon" style="background:${ROLE_BG[r0] || '#2D6A4F'}">${esc(initials)}</span>`));
  return `
  <a class="card card-link person-card" href="profile.html?id=${p.id}">
    <div class="card-emoji" aria-hidden="true">
      ${avIcon}
    </div>
    <div class="card-bottom">
      <div class="card-stats">${roles}</div>
      <span class="fac">${esc(lab.fac)}</span>
      <h3 class="card-title">${esc(shortenName(p.name))}</h3>
      <p class="person-note">${esc(p.note || '')}</p>
      <p class="person-years">${p.years ? 'в университете ' + p.years + ' ' + plural(p.years, ['год', 'года', 'лет']) : ''}</p>
    </div>
  </a>`;
}

/* ---------- CC-ЛИЦЕНЗИИ (по принципу Creative Commons) ---------- */
const CCL = {
  'CC BY':        { label: 'CC BY — с указанием автора',                hint: 'Можно свободно копировать, распространять и адаптировать, даже в коммерческих целях, при указании авторства.' },
  'CC BY-SA':     { label: 'CC BY-SA — с указанием автора, на тех же условиях', hint: 'Как CC BY, но производные работы обязаны распространяться под той же лицензией.' },
  'CC BY-NC':     { label: 'CC BY-NC — с указанием автора, некоммерчески', hint: 'Свободное использование только для некоммерческих целей, с указанием авторства.' },
  'CC BY-NC-SA':  { label: 'CC BY-NC-SA — некоммерчески, на тех же условиях', hint: 'Некоммерческое распространение и адаптация с указанием авторства и сохранением лицензии.' },
  'CC BY-ND':     { label: 'CC BY-ND — с указанием автора, без производных', hint: 'Можно копировать и распространять только полный текст, без изменений, с указанием авторства.' },
  'CC0':          { label: 'CC0 — общественное достояние',              hint: 'Полный отказ от авторских прав: любое использование без ограничений.' }
};
function licBadgeHTML(p) {
    if (!p || !p.license || !CCL[p.license]) return '';
    return '<span class="lic-badge" title="' + esc(CCL[p.license].hint) + '">' + esc(p.license) + '</span>';
}

/* Обложка публикации: картинка (фото/автор работы) тянется от верха до низа
   секции, а текст (год, статус, название, авторы, издание) лежит поверх неё
   на затемнении. */
function pubCoverImgHTML(p) {
    if (p.photo) return '<img class="pub-cover-img" src="' + esc(p.photo) + '" alt="">';
    const firstAuthor = personByShort((p.authors || '').split(',')[0].trim());
    if (firstAuthor && firstAuthor.photo) return '<img class="pub-cover-img" src="' + esc(firstAuthor.photo) + '" alt="">';
    const name = firstAuthor ? firstAuthor.name : (p.authors || '');
    const r0 = firstAuthor && firstAuthor.roles ? firstAuthor.roles[0] : 'res';
    if (window.OU_icons && OU_icons.avatarSVG) {
        /* фон-паттерн из сгенерированного SVG-автора: он заполняет всю секцию
           от верха до низа и повторяется по тексту */
        var svg = OU_icons.avatarSVG(name, r0, 240);
        var uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        return '<span class="pub-cover-gen" style="background-image:url(&quot;' + uri + '&quot;)"></span>';
    }
    return '';
}

function pubCard(p) {
    const st = STATUS[p.status] || STATUS.wait;
    const d = DEPT_BY_N[p.dept];
    return `
<a class="card card-link pub-card" style="--stripe:${d ? FAC_COLOR[d.f] || 'var(--ink)' : 'var(--ink)'}" href="publication.html?id=${p.id}">
<div class="card-emoji pub-cover">
${pubCoverImgHTML(p)}
<div class="pub-cover-shade"></div>
<div class="pub-cover-text">
<div class="card-top">
<span class="num">${esc(p.year)}</span>
${licBadgeHTML(p)}
<span class="status ${st.cls}">${esc(st.short)}</span>
</div>
<h3 class="card-title">${esc(p.title)}</h3>
<p class="pub-authors">${esc(p.authors)}</p>
<p class="pub-venue">${esc(p.venue)}${d ? ' · ' + esc(d.t) : ''}</p>
</div>
</div>
</a>`;
}

function deptDetailHTML(d) {
    const s = deptStats(d.n);
    const creator = d.createdBy != null ? esc(d.creatorName || ('пользователь №' + d.createdBy)) : 'база университета';
    const deptCover = d.photo
        ? '<img class="dept-cover-img" src="' + esc(d.photo) + '" alt="Фото кафедры">'
        : ((window.OU_icons && OU_icons.deptIconHTML) ? '<div class="dept-cover-gen">' + OU_icons.deptIconHTML(d) + '</div>' : '');
    return `
<div class="dept-cover-wrap">
${deptCover}
<div class="dept-cover-shade"></div>
<div class="dept-cover-text">
<div class="dept-cover-head">
<span class="fac">${esc(d.f)}</span>
<div class="card-stats">
<span class="stat"><i class="b b-d">Д</i>${s.d}</span>
<span class="stat"><i class="b b-k">К</i>${s.k}</span>
<span class="stat"><i class="b b-a">А</i>${s.a}</span>
<span class="stat"><i class="b b-ch">Ч</i>${s.ch}</span>
</div>
</div>
<h2 class="dept-title"><a href="dept.html?id=${d.n}">${esc(d.t)}</a></h2>
<p class="dept-desc">${esc(d.x || '')}</p>
</div>
</div>
<div>
<div class="dstat"><span>Создатель</span><i class="dots"></i><b class="txt">${creator}</b></div>
<div class="dstat"><span>Публикации в базе</span><i class="dots"></i><b>${s.w}</b></div>
<div class="dstat"><span>Рецензенты</span><i class="dots"></i><b>${s.r}</b></div>
<div class="dstat"><span>Научные руководители</span><i class="dots"></i><b>${s.s}</b></div>
<div class="dstat"><span>Исследователи</span><i class="dots"></i><b>${s.i}</b></div>
<div class="dstat"><span>Переводчики</span><i class="dots"></i><b>${s.t}</b></div>
</div>`;
}

function profileHTML(person, extraRight) {
const r0 = (person.roles && person.roles[0]) || 'res';
const av = (window.OU_icons && OU_icons.personAvatarHTML)
    ? '<div class="avatar avatar-big">' + OU_icons.personAvatarHTML(person, 80, 'avatar-big') + '</div>'
    : (person.photo
    ? '<img class="avatar avatar-big avatar-photo" src="' + esc(person.photo) + '" alt="Фото: ' + esc(person.name) + '">'
    : ((window.OU_icons && OU_icons.avatarSVG)
    ? '<div class="avatar avatar-big svg">' + OU_icons.avatarSVG(person.name, r0, 80) + '</div>'
    : '<div class="avatar avatar-big av-' + r0 + '">' + esc(initialsOf(person.name)) + '</div>'));
return `
<div class="profile-left">
${av}
<div>
<h2 class="profile-name">${esc(person.name)}</h2>
<p class="person-note">${esc(person.note || '')}</p>
<div class="card-stats">
${(person.roles || []).map((r) => ROLES[r] ? `<span class="stat"><span class="b b-${r}" style="background:${ROLES[r].color};color:#FFF">${ROLES[r].letter}</span>${esc(ROLES[r].label)}</span>` : '').join('')}
</div>
</div>
</div>
<div>${extraRight}</div>`;
}

function fileButtonHTML(p, key) {
    if (p.fileData) return '<a class="file-btn" href="' + p.fileData + '" download="' + esc(p.fileName || 'work.pdf') + '">Открыть файл работы ↓</a>';
    if (p.hasFile) return '<a class="file-btn remote-file" href="#" data-filekey="' + esc(key) + '" data-filename="' + esc(p.fileName || 'work.pdf') + '">Открыть файл работы ↓</a>';
    if (p.file) return '<a class="file-btn" href="' + esc(p.file) + '" target="_blank" rel="noopener">Открыть файл работы ↓</a>';
    return '';
}

function bindAutocomplete(input, drop, candidates, isExcluded, onPick) {
    if (!input || !drop) return;
    const hide = () => { drop.hidden = true; drop.innerHTML = ''; };
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 1) { hide(); return; }
        const hits = candidates
            .filter((c) => !isExcluded(c))
            .filter((c) => matches(q, c.name || c.title, c.short || c.authors || ''))
            .slice(0, 8);
        if (!hits.length) { hide(); return; }
        drop.innerHTML = hits.map((c) =>
            '<button type="button" class="ac-item" data-short="' + esc(c.short || c.id) + '">' +
            esc(c.name || c.title) + '<small>' + esc(c.note || c.authors || '') + '</small></button>'
        ).join('');
        drop.hidden = false;
        drop.querySelectorAll('.ac-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                onPick(btn.getAttribute('data-short'));
                input.value = '';
                hide();
            });
        });
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !drop.contains(e.target)) hide();
    });
}

function canIReview(r, pub, me) {
    if (!can(me, 'review')) return false;
    if (r.author === me.id || r._done) return false;
    if (hasConflict(pub, me)) return false;
    if (me.dept != null && pub.dept != null && me.dept === pub.dept) return false;
    if ((r._revs || []).some((v) => v.reviewer === me.id)) return false;
    return true;
}

function reviewBlockHTML(r, person, index) {
    const annulled = r._done &&
        ((r._result === 'ok' && person.verdict === 'neg') || (r._result === 'no' && person.verdict === 'pos'));
    const name = r._done
        ? (personById(person.reviewer) ? personById(person.reviewer).name : 'Рецензент')
        : 'Анонимный рецензент ' + (index + 1);
    const cls = person.verdict === 'pos' ? 'st-ok' : person.verdict === 'neg' ? 'st-no' : 'st-wait';
    const lab = person.verdict === 'pos' ? 'положительная' : person.verdict === 'neg' ? 'отрицательная' : 'на доработку';
    return `
<article class="comment">
<div class="comment-head">
<b>${esc(name)}</b>
<span class="status ${cls}">${lab}${annulled ? ' · аннулирована' : ''}</span>
</div>
<p>${esc(person.text)}</p>
</article>`;
}

function checkReqCard(r) {
    const pub = (Store.pubs || []).find((p) => p.id === r.pubId);
    if (!pub) return '';
    const me = effectiveUser();
    const revs = r._revs || [];
    const revHTML = revs.map((v, i) => reviewBlockHTML(r, v, i)).join('');
    let action = '';
    if (canIReview(r, pub, me)) {
        action = `
<button class="edit-btn" type="button" data-openrev="${r.id}">▶ Начать проверку</button>
<div class="rev-panel" id="revPanel-${r.id}" hidden>
<h2 class="form-sub">Проверка работы</h2>
<div class="rev-file">
${fileButtonHTML(pub, 'pub-' + pub.id) || '<span class="file-hint">Файл не прикреплён.</span>'}
<a class="edit-btn" href="publication.html?id=${pub.id}">Страница работы</a>
</div>
<form class="pub-form rev-form" data-req="${r.id}">
<div class="radio-row">
<label><input type="radio" name="verdict" value="pos" checked> Положительная</label>
<label><input type="radio" name="verdict" value="fix"> На доработку</label>
<label><input type="radio" name="verdict" value="neg"> Отрицательная</label>
</div>
<label class="fld"><span>Аргументация оценки *</span><textarea rows="3" required placeholder="Почему такая оценка…"></textarea></label>
<div class="form-actions"><button class="file-btn" type="submit">Отправить рецензию</button></div>
</form>
</div>`;
    } else if (r.author === me.id && !r._done) {
        action = '<p class="conflict-note">Идёт проверка: рецензенты анонимны, имена откроются после завершения.</p>';
    }
    const stCls = r._done ? ((VERDICT[r._result] || VERDICT.fix).cls) : 'st-wait';
    const stLabel = r._done ? ((VERDICT[r._result] || VERDICT.fix).label) : 'проверка идёт';
    return `
<article class="req-card">
<div class="card-top">
<span class="num">${esc(r.date)}</span>
<span class="status ${stCls}">${esc(stLabel)}</span>
</div>
<h3 class="card-title">${esc(pub.title)}</h3>
<p class="person-years">${DEPT_BY_N[pub.dept] ? esc(DEPT_BY_N[pub.dept].f) : ''} · автор скрыт до конца проверки</p>
<p class="req-progress">Рецензий: ${revs.length} из ${r.need} · стоимость ${r.cost} руб.</p>
<div class="req-reviews">${revHTML}</div>
${action}
</article>`;
}

function requestCard(r) {
    const author = personById(r.author);
    const authorLink = author ? '<a href="profile.html?id=' + author.id + '">' + esc(author.name) + '</a>' : 'Автор';
    if (r.type === 'check') return checkReqCard(r);
    if (r.type === 'sup') {
        return `
<article class="req-card">
<div class="card-top"><span class="num">${esc(r.date)}</span><span class="status st-wait">руководство</span></div>
<h3 class="card-title">${authorLink} ищет научного руководителя</h3>
<p class="rev-text"><b>Кто:</b> ${esc(r.who)}</p>
<p class="rev-text"><b>Зачем:</b> ${esc(r.why)}</p>
<p class="rev-text"><b>Тема:</b> ${esc(r.topic)}</p>
<p class="person-years">Вознаграждение: ${esc(r.reward)} руб.</p>
</article>`;
    }
    if (r.type === 'res') {
        return `
<article class="req-card">
<div class="card-top"><span class="num">${esc(r.date)}</span><span class="status st-wait">исследование</span></div>
<h3 class="card-title">${authorLink} ищет соавтора</h3>
<p class="rev-text"><b>Кто:</b> ${esc(r.who)}</p>
<p class="rev-text"><b>О чём:</b> ${esc(r.about)}</p>
<p class="rev-text"><b>Подробности:</b> ${esc(r.details || '—')}</p>
</article>`;
    }
    const pub = (Store.pubs || []).find((p) => p.id === r.pubId);
    return `
<article class="req-card">
<div class="card-top"><span class="num">${esc(r.date)}</span><span class="status st-wait">перевод</span></div>
<h3 class="card-title">Нужен перевод на «${esc(r.lang)}»</h3>
<p class="rev-text">${pub ? '<a href="publication.html?id=' + pub.id + '">' + esc(pub.title) + '</a>' : 'Работа не найдена'}</p>
<p class="person-years">Автор: ${authorLink}</p>
</article>`;
}

function bindReviewForms(box) {
    box.querySelectorAll('[data-openrev]').forEach((b) => {
        b.addEventListener('click', () => {
            const panel = document.getElementById('revPanel-' + b.dataset.openrev);
            if (!panel) return;
            panel.hidden = !panel.hidden;
            b.textContent = panel.hidden ? '▶ Начать проверку' : '▼ Свернуть';
        });
    });
    box.querySelectorAll('form.rev-form').forEach((f) => {
        f.addEventListener('submit', (e) => {
            e.preventDefault();
            const reqId = +f.dataset.req;
            const r = (Store.requests || []).find((x) => x.id === reqId);
            if (!r) return;
            const verdict = f.querySelector('input[name="verdict"]:checked').value;
            const text = f.querySelector('textarea').value.trim();
            if (!text) return;
            LocalCheckReviews.add(reqId, {
                reviewer: USER.id, verdict: verdict, text: text,
                date: new Date().toISOString().slice(0, 10)
            });
            const count = (r._revs || []).length + 1;
            if (count >= r.need) {
                const all = (r._revs || []).concat([{ verdict: verdict }]);
                const pos = all.filter((v) => v.verdict === 'pos').length;
                const neg = all.filter((v) => v.verdict === 'neg').length;
                const fix = all.filter((v) => v.verdict === 'fix').length;
                const result = (pos > neg && pos > fix) ? 'ok' : (neg > pos && neg >= fix) ? 'no' : 'fix';
                LocalPubs.update(r.pubId, { status: result });
            }
            location.reload();
        });
    });
}

function initSearch() {
    const input = searchEl();
    if (!input) return;
    const drop = document.createElement('div');
    drop.className = 'search-drop';
    drop.hidden = true;
    input.parentElement.appendChild(drop);
    function show() {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) { drop.hidden = true; return; }
        const depts = (Store.depts || []).filter((d) => !d.tpl && matches(q, d.t, d.f)).slice(0, 4);
        const people = (Store.people || []).filter((p) => matches(q, p.name, p.note || '')).slice(0, 4);
        const pubs = (Store.pubs || []).filter((p) => matches(q, p.title, p.authors)).slice(0, 4);
        if (!depts.length && !people.length && !pubs.length) {
            drop.innerHTML = '<div class="sd-none">Ничего не найдено.</div>';
        } else {
            drop.innerHTML =
                (depts.length ? '<div class="sd-group">Кафедры</div>' + depts.map((d) =>
                    '<a class="sd-item" href="dept.html?id=' + d.n + '">' + esc(d.t) + '<small>' + esc(d.f) + '</small></a>').join('') : '') +
                (people.length ? '<div class="sd-group">Люди</div>' + people.map((p) =>
                    '<a class="sd-item" href="profile.html?id=' + p.id + '">' + esc(p.name) + '<small>' + esc(p.note || '') + '</small></a>').join('') : '') +
                (pubs.length ? '<div class="sd-group">Публикации</div>' + pubs.map((p) =>
                    '<a class="sd-item" href="publication.html?id=' + p.id + '">' + esc(p.title) + '<small>' + esc(p.authors) + '</small></a>').join('') : '');
        }
        drop.hidden = false;
    }
    input.addEventListener('input', show);
    input.addEventListener('focus', show);
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') drop.hidden = true; });
    document.addEventListener('click', (e) => { if (!e.target.closest('.hd')) drop.hidden = true; });
}

// ============================================================
// ГЛАВНАЯ (обложка + список кафедр)
// ============================================================
function initHome() {
    const main = $('#homeMain');

    const nd = (Store.depts || []).filter((d) => !d.tpl).length;
    const np = (Store.people || []).length;
    const nw = (Store.pubs || []).length;

    main.innerHTML = `
<section class="cover">
<div class="cover-sub">ОТКРЫТЫЙ УНИВЕРСИТЕТ — РЕЕСТР ЛЮДЕЙ И РАБОТ</div>
<h1 class="cover-title">НАУКА ВЕДЁТ<br>СВОЙ КАТАЛОГ</h1>
<p class="cover-text">Люди, кафедры и научные работы — в одном открытом реестре. Публикуйте, рецензируйте и находите единомышленников.</p>
<div class="cover-stamps">
<div class="stamp"><b>${nd}</b><span>кафедр</span></div>
<div class="stamp"><b>${np}</b><span>человек</span></div>
<div class="stamp"><b>${nw}</b><span>работ</span></div>
</div>
</section>
<div class="legend" aria-label="Обозначения" style="margin:24px 0">
<span class="lg"><i class="b b-d">Д</i>доктор наук</span>
<span class="lg"><i class="b b-k">К</i>кандидат наук</span>
<span class="lg"><i class="b b-a">А</i>аспирант</span>
<span class="lg"><i class="b b-ch">Ч</i>человек</span>
</div>
<section class="home-block" id="homeDepts"></section>`;



    /* ---------- карточки кафедр ---------- */
    const FAC_COLOR = {
        'Математика': '#C41E3A', 'Информатика': '#1D3557', 'Физика': '#2D6A4F',
        'Химия': '#9C6644', 'Гуманитарные науки': '#6B2D8B', 'Экономика': '#457B9D',
        'Психология': '#E76F51', 'Языки': '#264653'
    };
function deptCardHTML(c) {
  const s = deptStats(c.n);
  const val = (v) => (v == null ? '—' : v);
  return `
  <a class="card card-link" style="--stripe:${FAC_COLOR[c.f] || 'var(--ink)'}" href="dept.html?id=${c.n}">
    <div class="card-emoji" aria-hidden="true">
      ${c.photo ? '<img class="dept-photo avatar-svg" src="' + esc(c.photo) + '" alt="">' : ((window.OU_icons && OU_icons.deptIconHTML) ? OU_icons.deptIconHTML(c) : '')}
    </div>
    <div class="card-bottom">
      <span class="fac">${esc(c.f)}</span>
      <h3 class="card-title">${esc(c.t)}</h3>
      <div class="card-stats">
        <span class="stat"><span class="b b-d">Д</span>${val(s.d)}</span>
        <span class="stat"><span class="b b-k">К</span>${val(s.k)}</span>
        <span class="stat"><span class="b b-a">А</span>${val(s.a)}</span>
        <span class="stat"><span class="b b-ch">Ч</span>${val(s.ch)}</span>
      </div>
    </div>
  </a>`;
}

    function deptsHTML() {
        const list = (Store.depts || []).filter((d) => !d.tpl).sort((a, b) => a.n - b.n);
        if (!list.length) return '<h2 class="sub-title">Кафедры</h2><div class="empty">Кафедр пока нет.</div>';
        return '<h2 class="sub-title">Кафедры</h2><section class="cards">' + list.map(deptCardHTML).join('') + '</section>';
    }

    $('#homeDepts').innerHTML = deptsHTML();
    stagger($('#homeDepts').querySelectorAll('.card'));
}

// ============================================================
// ЗНАКОМЫЕ
// ============================================================
function initPeople() {
    const pre = params.get('role');
    /* «Знакомые» (mode=friends) — личный список знакомых;
       «Коллеги» (mode=all или переход из подменю «Коллеги», в т.ч. с ?role=) — все пользователи */
    const isFriendsMode = params.get('mode') === 'friends';
    const state = {
        role: ['rev', 'res', 'sup', 'trn', 'adm'].includes(pre) ? pre : 'Все',
        friendsOnly: !USER.guest && isFriendsMode
    };
    /* подписываем заголовок страницы под выбранным режимом */
    const titleEl = document.querySelector('.page-title');
    if (titleEl) titleEl.textContent = state.friendsOnly ? 'Знакомые' : 'Коллеги';

    if (!USER.guest && !$('#addFriendBar')) {
        $('.filters-row').insertAdjacentHTML('afterend',
            '<div class="member-bar add-friend-bar" id="addFriendBar">' +
            '<span class="member-note">Добавить в знакомые:</span>' +
            '<div class="ac-wrap add-friend-wrap">' +
            '<input type="text" id="addFriendInput" class="ac-input" placeholder="Найти коллегу по ФИО…" autocomplete="off">' +
            '<div class="ac-drop" id="addFriendDrop" hidden></div>' +
            '</div></div>');
        bindAutocomplete(
            $('#addFriendInput'), $('#addFriendDrop'),
            (Store.people || []).filter((x) => x.id !== USER.id),
            (short) => { const p = personByShort(short); return !p || LocalFriends.has(p.id); },
            (short) => { const p = personByShort(short); if (p) { LocalFriends.add(p.id); render(); } }
        );
    }

    function render() {
        let list;
        if (state.friendsOnly) {
            list = LocalFriends.list()
                .map((id) => (Store.people || []).find((p) => p.id === id))
                .filter(Boolean);
        } else {
            list = (Store.people || []).filter((p) => p.id !== USER.id);
        }
        if (state.role !== 'Все') list = list.filter((p) => (p.roles || []).includes(state.role));

        $('#cards').innerHTML = list.map(personCard).join('');
        stagger($('#cards').querySelectorAll('.card'));
        $('#count').textContent = list.length + ' ' +
            (state.friendsOnly
                ? plural(list.length, ['знакомый', 'знакомых', 'знакомых'])
                : plural(list.length, ['коллега', 'коллег', 'коллег']));
        const empty = $('#empty');
        if (!list.length) {
            empty.textContent = state.friendsOnly
                ? (LocalFriends.list().length === 0 ? 'Список знакомых пуст. Найдите коллегу через поле выше.' : 'Никого из знакомых не нашлось.')
                : 'Никого не нашлось. Попробуйте изменить запрос.';
        }
        empty.hidden = list.length !== 0;
    }

    buildFilters([
        { key: 'Все', label: 'Все' },
        { key: 'res', label: 'Исследователи' },
        { key: 'rev', label: 'Рецензенты' },
        { key: 'sup', label: 'Научные руководители' },
        { key: 'trn', label: 'Переводчики' },
        { key: 'adm', label: 'Администраторы' }
    ], state.role, (k) => { state.role = k; render(); });
    render();
}

// ============================================================
// ПРОФИЛЬ
// ============================================================
function initProfile() {
    const id = +params.get('id');
    let person = id === USER.id ? effectiveUser() : (Store.people || []).find((x) => x.id === id);
    /* фото профиля хранится в LocalProfile/LocalUsers — подтягиваем его и для «базовых» людей */
    if (person && id === USER.id && !person.photo) {
        const lu = LocalUsers.byId(person.id);
        if (lu && lu.photo) person.photo = lu.photo;
    }
    if (!person) { $('#profile').innerHTML = '<div class="empty">Страница не найдена.</div>'; return; }
    const isOwner = person.id === USER.id;
    if (isOwner && USER.guest) { location.href = 'login.html'; return; }
    const targetIsAdmin = (person.roles || []).includes('adm');
    const iAmSystemAdmin = (USER.id === 99999 || USER.email === 'admin@ou.ru');
    const isEditable = isOwner || (isAdmin(USER) && (!targetIsAdmin || iAmSystemAdmin));

    $('#backLink').style.display = isOwner ? 'none' : '';
    $('#ownerBar').style.display = isEditable ? '' : 'none';
    $('#ownerOnly').style.display = isOwner ? '' : 'none';

    if (isOwner && !$('#resetBtn')) {
        $('#ownerBar').insertAdjacentHTML('beforeend',
            ' <button class="edit-btn" id="photoBtn" type="button">Фото профиля</button>' +
            ' <input type="file" id="photoInput" accept="image/*" hidden>' +
            ' <button class="edit-btn" id="resetBtn" type="button">Сбросить правки</button>');
        /* загрузка фото профиля: сжимается до 256px и хранится как dataURL */
        $('#photoBtn').addEventListener('click', () => $('#photoInput').click());
        $('#photoInput').addEventListener('change', (e) => {
            const f = e.target.files[0];
            e.target.value = '';
            if (!f) return;
            if (!/^image\//.test(f.type)) { alert('Нужен файл изображения (JPG/PNG).'); return; }
            if (f.size > 8 * 1024 * 1024) { alert('Файл больше 8 МБ.'); return; }
            const btn = $('#photoBtn');
            btn.disabled = true; btn.textContent = 'Обработка…';
            const done = (dataUrl) => {
                LocalProfile.save({ photo: dataUrl });
                /* сохраняем фото в общий слой (ou_people_photos) и overrides —
                   оба синхронизируются через облако, поэтому аватарку увидят все коллеги */
                LocalPeopleOvr.update(person.id, { photo: dataUrl });
                person.photo = dataUrl;
                if (LocalUsers.byId(person.id)) LocalUsers.update(person.id, { photo: dataUrl });
                try { window.dispatchEvent(new Event('ou:data')); } catch (err) {}
                render();
            };
            if (window.OU_icons && OU_icons.readImage) {
                OU_icons.readImage(f, 512, (err, dataUrl) => {
                    if (err) { alert('Не удалось прочитать изображение.'); btn.disabled = false; btn.textContent = 'Фото профиля'; return; }
                    try { localStorage.setItem('__ou_photo_test', dataUrl); localStorage.removeItem('__ou_photo_test'); }
                    catch (err2) { alert('Память браузера заполнена — выберите изображение меньшего размера.'); btn.disabled = false; btn.textContent = 'Фото профиля'; return; }
                    done(dataUrl);
                });
            } else {
                const rd = new FileReader();
                rd.onload = () => done(rd.result);
                rd.readAsDataURL(f);
            }
        });
        $('#resetBtn').addEventListener('click', () => {
            if (confirm('Сбросить все правки вашего профиля?')) { LocalProfile.reset(); location.reload(); }
        });
    }
    if (!isOwner) {
        const inFr = !USER.guest && LocalFriends.has(person.id);
        $('#profile').insertAdjacentHTML('afterend',
            USER.guest
                ? '<div class="member-bar"><span>Чтобы добавлять людей в знакомые, <a href="login.html">войдите</a>.</span></div>'
                : '<div class="member-bar">' + (inFr
                    ? '<span>✓ Этот человек у вас в знакомых</span><button class="edit-btn danger-btn" id="friendBtn" type="button">Убрать</button>'
                    : '<button class="edit-btn" id="friendBtn" type="button">+ Добавить в знакомые</button>') + '</div>');
        $('#friendBtn').addEventListener('click', () => {
            if (LocalFriends.has(person.id)) LocalFriends.remove(person.id);
            else LocalFriends.add(person.id);
            location.reload();
        });
    }
    if (!isOwner && !USER.guest) {
        $('#profile').insertAdjacentHTML('afterend',
            '<div class="member-bar"><a class="edit-btn" href="chats.html?id=' + person.id + '">✉ Написать сообщение</a></div>');
    }

    function render() {
        const dept = person.dept != null ? DEPT_BY_N[person.dept] : null;
        const pubs = pubsOf(person);
        const revs = (Store.reviews || []).filter((r) => r.reviewer === person.id);
        const deptName = dept ? '<a href="dept.html?id=' + person.dept + '">' + esc(dept.t.replace('Кафедра ', '')) + '</a>' : '<span class="badge-no-dept">без кафедры</span>';

        /* Подсчёт цитирований */
        const citations = (Store.pubs || []).reduce((sum, otherPub) => {
            const refs = otherPub.refs || [];
            const myPubIds = pubs.map((p) => p.id);
            return sum + refs.filter((id) => myPubIds.includes(id)).length;
        }, 0);

        $('#profile').innerHTML = profileHTML(person, `
<div class="dstat"><span>Кафедра</span><i class="dots"></i><b class="txt">${deptName}</b></div>
<div class="dstat"><span>В университете</span><i class="dots"></i><b>${esc(person.years)} ${plural(person.years, ['год', 'года', 'лет'])}</b></div>
<div class="dstat"><span>Публикаций</span><i class="dots"></i><b>${pubs.length}</b></div>
<div class="dstat"><span>Цитирований</span><i class="dots"></i><b>${citations}</b></div>
<div class="dstat"><span>Рецензий</span><i class="dots"></i><b>${revs.length}</b></div>`);

        const by = (s) => pubs.filter((p) => p.status === s).length;
        let tiles = `
<div class="tile"><b>${pubs.length}</b><span>публикаций</span></div>
<div class="tile"><b>${by('ok')}</b><span>проверено</span></div>
<div class="tile"><b>${by('wait')}</b><span>на проверке</span></div>
<div class="tile"><b>${by('no')}</b><span>отказ</span></div>`;
        if (isOwner && can(person, 'publish'))
            tiles += '<a class="tile tile-btn" href="new-publication.html"><b>+</b><span>создать публикацию</span></a>';
        $('#tiles').innerHTML = tiles;
        $('#ints').innerHTML = (person.interests || []).map((i) => '<span class="chip-int">' + esc(i) + '</span>').join('') || '—';
        $('#exp').textContent = person.experience || '—';
        if (dept) { $('#personDept').innerHTML = deptDetailHTML(dept); $('#personDept').hidden = false; }
        else { $('#personDept').innerHTML = '<div class="empty">Кафедра не указана.</div>'; }

        $('#cards').innerHTML = pubs.map(pubCard).join('');
        stagger($('#cards').querySelectorAll('.card'));
        $('#pCount').textContent = pubs.length + ' ' + plural(pubs.length, ['публикация', 'публикации', 'публикаций']);
        $('#emptyPubs').hidden = pubs.length !== 0;

        $('#revCards').innerHTML = revs.map((r) => {
            const v = VERDICT[r.verdict] || VERDICT.fix;
            const pub = (Store.pubs || []).find((x) => x.id === r.pub);
            return `
<article class="card">
<div class="card-top"><span class="num">${esc((r.date || '').slice(0, 4))}</span><span class="status ${v.cls}">${esc(v.label)}</span></div>
<h3 class="card-title">${pub ? '<a href="publication.html?id=' + pub.id + '">' + esc(pub.title) + '</a>' : 'Публикация не найдена'}</h3>
<p class="rev-text">${esc(r.text)}</p>
</article>`;
        }).join('');
        stagger($('#revCards').querySelectorAll('.card'));
        $('#rCount').textContent = revs.length + ' ' + plural(revs.length, ['рецензия', 'рецензии', 'рецензий']);
        $('#emptyRev').hidden = revs.length !== 0;

        if (isOwner) {
            let people = LocalFriends.list()
                .map((fid) => (Store.people || []).find((p) => p.id === fid))
                .filter(Boolean);
            $('#peopleCards').innerHTML = people.map(personCard).join('');
            stagger($('#peopleCards').querySelectorAll('.card'));
            $('#myPeopleCount').textContent = people.length + ' ' + plural(people.length, ['человек', 'человека', 'человек']);
            const emptyPeople = $('#emptyPeople');
            emptyPeople.textContent = !people.length
                ? (LocalFriends.list().length === 0 ? 'Список знакомых пока пуст.' : 'Никого не нашлось.')
                : '';
            emptyPeople.hidden = people.length !== 0;
            $('#qlinks').innerHTML = `
<a class="qlink" href="moya-kafedra.html?dept=${USER.dept != null ? USER.dept : ''}">Моя кафедра <span class="arrow">→</span></a>
<a class="qlink" href="moi-publikacii.html">Все публикации <span class="arrow">→</span></a>
<a class="qlink" href="znakomye.html?mode=friends">Знакомые <span class="arrow">→</span></a>`;
        }
    }

    if (isOwner && !$('#addFriendBar')) {
        $('#peopleCards').insertAdjacentHTML('beforebegin',
            '<div class="member-bar add-friend-bar" id="addFriendBar">' +
            '<span class="member-note">Найдите коллегу по ФИО и добавьте в знакомые:</span>' +
            '<div class="ac-wrap add-friend-wrap">' +
            '<input type="text" id="addFriendInput" class="ac-input" placeholder="Начните вводить ФИО…" autocomplete="off">' +
            '<div class="ac-drop" id="addFriendDrop" hidden></div>' +
            '</div></div>');
        bindAutocomplete(
            $('#addFriendInput'), $('#addFriendDrop'),
            Store.people.filter((x) => x.id !== USER.id),
            (short) => { const p = personByShort(short); return !p || LocalFriends.has(p.id); },
            (short) => { const p = personByShort(short); if (p) { LocalFriends.add(p.id); render(); } }
        );
    }

    if (isEditable) {
        $('#editBtn').addEventListener('click', () => {
            $('#ndFac').innerHTML = FAC.map((f) => '<option>' + esc(f) + '</option>').join('');
            $('#fNote').value = person.note || '';
            $('#fExp').value = person.experience || '';
            $('#fInts').value = (person.interests || []).join(', ');
            $('#fDept').innerHTML = '<option value="">— без кафедры —</option>' +
                DEPTS.map((d) => '<option value="' + d.n + '"' + (person.dept === d.n ? ' selected' : '') + '>' + esc(d.t) + '</option>').join('');
            $('#fDeg').value = person.deg || '';
            $('#editForm').hidden = false;
            $('#editBtn').disabled = true;
        });
        $('#cancelBtn').addEventListener('click', () => { $('#editForm').hidden = true; $('#editBtn').disabled = false; });
        $('#editForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const deptVal = $('#fDept').value;
            const patch = {
                note: $('#fNote').value.trim(),
                experience: $('#fExp').value.trim(),
                interests: $('#fInts').value.split(',').map((s) => s.trim()).filter(Boolean),
                dept: deptVal === '' ? null : +deptVal,
                deg: $('#fDeg').value || null
            };
            LocalProfile.save(patch);
            Object.assign(person, patch);
            LocalPeopleOvr.update(person.id, { dept: patch.dept });
            if (LocalUsers.byId(person.id)) LocalUsers.update(person.id, patch);
            $('#editForm').hidden = true;
            $('#editBtn').disabled = false;
            render();
        });
        $('#createDeptBtn').addEventListener('click', () => { $('#newDeptForm').hidden = !$('#newDeptForm').hidden; });
        if (window.OU_icons && OU_icons.iconSelectHTML) {
            const icSel = $('#ndIcon');
            if (icSel) icSel.outerHTML = OU_icons.iconSelectHTML('ndIcon', 'cap');
        }
        $('#newDeptForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = $('#ndName').value.trim();
            if (!name || !can(USER, 'admin')) { alert('Создавать кафедры может только администратор.'); return; }
            const baseMax = Math.max(...(Store.depts || []).map((d) => d.n));
            const n = LocalDepts.nextN(baseMax);
            const facVal = $('#ndFac').value;
            const icEl = $('#ndIcon');
            const icVal = (icEl && window.OU_icons) ? OU_icons.normalizeDept({ ic: icEl.value }).ic
                : (icEl ? icEl.value : 'cap');
            LocalDepts.add({
                n: n, f: facVal, ic: icVal,
                t: name, x: $('#ndDesc').value.trim(),
                d: 0, k: 0, a: 0, ch: 0, createdBy: USER.id, creatorName: USER.name
            });
            location.reload();
        });
    }
    render();
}

// ============================================================
// КАФЕДРА
// ============================================================
function setMyDept(n) {
    LocalPeopleOvr.update(USER.id, { dept: n });
    if (LocalUsers.byId(USER.id)) LocalUsers.update(USER.id, { dept: n });
    LocalProfile.save({ dept: n });
    location.reload();
}
function membershipBar(d) {
    if (USER.guest) return '<div class="member-bar"><span>Чтобы вступить на кафедру, <a href="login.html">войдите</a>.</span></div>';
    const myDept = effectiveUser().dept;
    if (myDept === d.n) return '<div class="member-bar"><span>Вы состоите на этой кафедре.</span><button class="edit-btn danger-btn" id="leaveCafe" type="button">Выйти из кафедры</button></div>';
    if (myDept != null && DEPT_BY_N[myDept]) return '<div class="member-bar"><span>Вы на кафедре «' + esc(DEPT_BY_N[myDept].t) + '».</span><button class="edit-btn" id="joinCafe" type="button">Перейти сюда</button></div>';
    return '<div class="member-bar"><span>Вы пока не состоите ни на одной кафедре.</span><button class="edit-btn" id="joinCafe" type="button">Вступить</button></div>';
}
function bindMembership(d) {
    const join = $('#joinCafe');
    if (join) join.addEventListener('click', () => setMyDept(d.n));
    const leave = $('#leaveCafe');
    if (leave) leave.addEventListener('click', () => { if (confirm('Выйти из кафедры?')) setMyDept(null); });
}

function initDeptPage() {
    const id = +params.get('id');
    const d = (Store.depts || []).find((x) => x.n === id);
    if (!d || d.tpl) { $('#deptHead').innerHTML = '<div class="empty">Кафедра не найдена.</div>'; return; }
    $('#deptHead').innerHTML = deptDetailHTML(d);
    $('#deptHead').insertAdjacentHTML('afterend', membershipBar(d));
    bindMembership(d);
    if (canManageDept(d)) {
        $('#deptHead').insertAdjacentHTML('afterend',
            '<div class="member-bar"><span>Вы управляете этой кафедрой.</span><button class="edit-btn" id="editDeptBtn" type="button">✎ Редактировать</button></div>' +
            '<form id="editDeptForm" class="pub-form" hidden><h2 class="form-sub">Редактирование кафедры</h2>' +
            '<div class="fld-row"><label class="fld"><span>Название *</span><input id="edName" required></label>' +
            '<label class="fld"><span>Направление</span><select class="select" id="edFac"></select></label></div>' +
            '<div class="fld-row"><label class="fld"><span>Иконка кафедры</span>' +
            ((window.OU_icons && OU_icons.iconSelectHTML) ? OU_icons.iconSelectHTML('edIcon', d.ic || d.e || '') : '') +
            '</label>' +
            '<label class="fld"><span>Описание</span><input id="edDesc"></label></div>' +
            '<div class="fld-row"><label class="fld"><span>Фото кафедры (необязательно)</span>' +
            '<input type="file" id="edPhoto" accept="image/*"></label>' +
            '<label class="fld chk-fld"><span>&nbsp;</span><label class="switch"><input type="checkbox" id="edPhotoClear"> Удалить фото</label></label></div>' +
            '<div class="form-actions"><button class="file-btn" type="submit">Сохранить</button> ' +
            '<button class="edit-btn" id="edCancel" type="button">Отмена</button></div></form>');
        $('#edFac').innerHTML = FAC.map((f) => '<option' + (f === d.f ? ' selected' : '') + '>' + esc(f) + '</option>').join('');
        $('#edName').value = d.t; $('#edDesc').value = d.x || '';
        $('#editDeptBtn').addEventListener('click', () => { $('#editDeptForm').hidden = !$('#editDeptForm').hidden; });
        $('#edCancel').addEventListener('click', () => { $('#editDeptForm').hidden = true; });
        $('#editDeptForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const icEl = $('#edIcon');
            const patch = { t: $('#edName').value.trim() || d.t, f: $('#edFac').value, x: $('#edDesc').value.trim() };
            if (icEl) {
                patch.ic = window.OU_icons ? OU_icons.normalizeDept({ ic: icEl.value, f: patch.f }).ic : icEl.value;
                delete patch.e; /* эмодзи больше не используется */
            }
            const savePatch = () => { LocalDepts.update(d.n, patch); location.reload(); };
            const clearChk = $('#edPhotoClear');
            if (clearChk && clearChk.checked) { patch.photo = null; savePatch(); return; }
            const phEl = $('#edPhoto');
            const pf = phEl && phEl.files[0];
            if (pf) {
                if (!/^image\//.test(pf.type)) { alert('Нужен файл изображения.'); return; }
                /* обложка кафедры: кадрирование под соотношение секции (~16/7), высокое разрешение */
                OU_icons.readImage(pf, 1400, (err, dataUrl) => {
                    if (err) { alert('Не удалось прочитать изображение.'); return; }
                    try { localStorage.setItem('__ou_photo_test', dataUrl); localStorage.removeItem('__ou_photo_test'); }
                    catch (e2) { alert('Память браузера заполнена — выберите изображение меньшего размера.'); return; }
                    patch.photo = dataUrl;
                    savePatch();
                });
            } else savePatch();
        });
    }
    const ppl = Store.people.filter((p) => p.dept === d.n);
    $('#pplCards').innerHTML = ppl.map(personCard).join('');
    stagger($('#pplCards').querySelectorAll('.card'));
    $('#pplCount').textContent = ppl.length + ' ' + plural(ppl.length, ['человек', 'человека', 'человек']);
    $('#emptyPpl').hidden = ppl.length !== 0;
    if (canManageDept(d)) {
        $('#pplCards').insertAdjacentHTML('afterend',
            '<h2 class="sub-title">Управление составом</h2><div class="mgr-list" id="manageList"></div>');
        $('#manageList').innerHTML = ppl.map((p) =>
            '<div class="mgr-row"><b>' + esc(p.name) + '</b><button class="edit-btn danger-btn" data-kick="' + p.id + '" type="button">Выгнать</button></div>'
        ).join('') || '<div class="empty">На кафедре пока никого.</div>';
        $('#manageList').querySelectorAll('[data-kick]').forEach((b) => {
            b.addEventListener('click', () => {
                const pid = +b.dataset.kick;
                const p = personById(pid);
                if (!confirm('Убрать ' + (p ? p.name : 'этого человека') + '?')) return;
                LocalPeopleOvr.update(pid, { dept: null });
                if (LocalUsers.byId(pid)) LocalUsers.update(pid, { dept: null });
                location.reload();
            });
        });
    }
    const pubs = sortPubs((Store.pubs || []).filter((p) => p.dept === d.n));
    $('#pubCards').innerHTML = pubs.map(pubCard).join('');
    stagger($('#pubCards').querySelectorAll('.card'));
    $('#pubCount').textContent = pubs.length + ' ' + plural(pubs.length, ['публикация', 'публикации', 'публикаций']);
    $('#emptyPub').hidden = pubs.length !== 0;
}

function initDept() {
    const sel = $('#deptSelect');
    sel.innerHTML = DEPTS.map((d) => '<option value="' + d.n + '">' + esc(d.t) + '</option>').join('');
    const pre = +params.get('dept');
    const myDept = effectiveUser().dept;
    sel.value = DEPT_BY_N[pre] ? pre : (myDept != null ? myDept : DEPTS[0].n);
    function render() {
        const d = DEPT_BY_N[+sel.value];
        if (!d) { $('#deptDetail').innerHTML = '<div class="empty">Кафедра не найдена.</div>'; return; }
        $('#deptDetail').innerHTML = deptDetailHTML(d);
        const staff = Store.people.filter((p) => p.dept === +sel.value);
        $('#staffCount').textContent = staff.length + ' ' + plural(staff.length, ['человек', 'человека', 'человек']);
        $('#staff').innerHTML = staff.map(personCard).join('');
        stagger($('#staff').querySelectorAll('.card'));
        $('#empty').hidden = staff.length !== 0;
    }
    sel.addEventListener('change', render);
    render();
}

// ============================================================
// МОИ ПУБЛИКАЦИИ
// ============================================================
function initPubs() {
    const pre = params.get('status');
    const state = { status: STATUS[pre] ? pre : 'Все' };
    
    const me = effectiveUser();
    if (can(me, 'publish')) {
        const ph = $('.page-head');
        const cbtn = '<a class="create-btn" href="new-publication.html">+ Создать публикацию</a>';
        if (ph) {
            /* вставляем сразу после заголовка — кнопка будет прижата к правому краю строки */
            const h1 = ph.querySelector('.page-title');
            if (h1) h1.insertAdjacentElement('afterend', document.createRange().createContextualFragment(cbtn).firstElementChild);
            else ph.insertAdjacentHTML('beforeend', cbtn);
        } else {
            const countEl = $('#count');
            if (countEl) {
                countEl.insertAdjacentHTML('beforebegin', cbtn);
            }
        }
    }
    
    function render() {
        const myShort = me.short;
        let list = sortPubs((Store.pubs || []).filter((p) => p.authors.includes(myShort)));
        if (state.status !== 'Все') list = list.filter((p) => p.status === state.status);
        $('#cards').innerHTML = list.map(pubCard).join('');
        stagger($('#cards').querySelectorAll('.card'));
        $('#count').textContent = list.length + ' ' + plural(list.length, ['публикация', 'публикации', 'публикаций']);
        const empty = $('#empty');
        if (empty) {
            empty.textContent = list.length === 0 && (Store.pubs || []).some((p) => p.authors.includes(myShort))
                ? 'По такому статусу публикаций не нашлось.'
                : 'У вас пока нет публикаций. Создайте первую через кнопку выше.';
            empty.hidden = list.length !== 0;
        }
    }
    
    buildFilters(
        [{ key: 'Все', label: 'Все' }].concat(Object.entries(STATUS).map(([k, s]) => ({ key: k, label: s.label }))),
        state.status, (k) => { state.status = k; render(); }
    );
    render();
}

// ============================================================
// ВСЕ ПУБЛИКАЦИИ
// ============================================================
function initAllPubs() {
    const pre = params.get('status');
    const q = (params.get('q') || '').trim().toLowerCase();
    const state = { status: STATUS[pre] ? pre : 'Все' };
    if (can(effectiveUser(), 'publish')) {
        const cbtn = '<a class="create-btn" href="new-publication.html">+ Создать публикацию</a>';
        const ph = $('.page-head');
        if (ph) {
            const h1 = ph.querySelector('.page-title');
            if (h1) h1.insertAdjacentElement('afterend', document.createRange().createContextualFragment(cbtn).firstElementChild);
            else ph.insertAdjacentHTML('beforeend', cbtn);
        } else $('#count').insertAdjacentHTML('beforebegin', cbtn);
    }
    function render() {
        let list = sortPubs(Store.pubs);
        if (state.status !== 'Все') list = list.filter((p) => p.status === state.status);
        if (q) list = list.filter((p) => matches(q, p.title, p.authors, p.venue || '', p.abstract || ''));
        $('#cards').innerHTML = list.map(pubCard).join('');
        stagger($('#cards').querySelectorAll('.card'));
        $('#count').textContent = list.length + ' ' + plural(list.length, ['публикация', 'публикации', 'публикаций']) + (q ? ' по запросу «' + q + '»' : '');
        $('#empty').hidden = list.length !== 0;
    }
    buildFilters(
        [{ key: 'Все', label: 'Все' }].concat(Object.entries(STATUS).map(([k, s]) => ({ key: k, label: s.label }))),
        state.status, (k) => { state.status = k; render(); }
    );
    render();
}

// ============================================================
// СТРАНИЦА ПУБЛИКАЦИИ
// ============================================================
function initPub() {
    const id = +params.get('id');
    const p = (Store.pubs || []).find((x) => x.id === id);
    const box = $('#pubDetail');
    if (!p) { box.innerHTML = '<div class="empty">Публикация не найдена.</div>'; return; }
    try { Notifications.markPubSeen(p.id); } catch (e) {}
    if (window.OU_badges) window.OU_badges.refresh();
    const me = effectiveUser();
    const st = STATUS[p.status] || STATUS.wait;
    const dept = DEPT_BY_N[p.dept];
    const isOwnerPub = p.authors.includes(me.short) || isAdmin(me);
    const checkReqs = (Store.requests || []).filter((r) => r.type === 'check' && r.pubId === p.id);
    const req = checkReqs[checkReqs.length - 1];
    const allRevs = checkReqs.reduce((n, r) => n + (r._revs || []).length, 0);
    const translations = (Store.translations || []).filter((t) => t.pub === p.id);

    box.innerHTML = `
<article class="pub-page">
<div class="card-top"><span class="num">${esc(p.year)}</span><span class="status ${st.cls}">${esc(st.short)}</span></div>
<h1 class="pub-title">${esc(p.title)}</h1>
<p class="pub-abstract">${esc(p.abstract || '')}</p>
<div class="pub-meta">
<div class="dstat"><span>Авторы</span><i class="dots"></i><b class="txt">${authorsHTML(p)}</b></div>
<div class="dstat"><span>Направление</span><i class="dots"></i><b class="txt">${dept ? '<a href="kafedry.html?fac=' + encodeURIComponent(dept.f) + '">' + esc(dept.f) + '</a>' : '—'}</b></div>
<div class="dstat"><span>Кафедра</span><i class="dots"></i><b class="txt">${dept ? '<a href="dept.html?id=' + p.dept + '">' + esc(dept.t.replace('Кафедра ', '')) + '</a>' : '<span class="badge-no-dept">без кафедры</span>'}</b></div>
<div class="dstat"><span>Научный руководитель</span><i class="dots"></i><b class="txt">${esc(p.supervisor || '—')}</b></div>
<div class="dstat"><span>Год</span><i class="dots"></i><b>${esc(p.year)}</b></div>
<div class="dstat"><span>Рецензий</span><i class="dots"></i><b>${allRevs}</b></div>
<div class="dstat"><span>Издание</span><i class="dots"></i><b class="txt">${esc(p.venue)}</b></div>
${p.license && CCL[p.license] ? '<div class="dstat"><span>Лицензия</span><i class="dots"></i><b class="txt"><span class="lic-badge">' + esc(p.license) + '</span> <small class="lic-hint">' + esc(CCL[p.license].hint) + '</small></b></div>' : ''}
</div>
${fileButtonHTML(p, 'pub-' + p.id)}
</article>`;

    if (isOwnerPub) {
        $('#pubActions').hidden = false;
        $('#pubEditBtn').addEventListener('click', () => { location.href = 'new-publication.html?id=' + p.id; });
        $('#pubDelBtn').addEventListener('click', () => {
            if (confirm('Удалить публикацию?')) { LocalPubs.remove(p.id); location.href = 'publications.html'; }
        });
    }
    if (req) {
        $('#revList').innerHTML = (req._revs || []).map((v, i) => reviewBlockHTML(req, v, i)).join('') || '<div class="empty">Рецензий пока нет.</div>';
        $('#reviewZone').innerHTML = req._done
            ? '<p class="conflict-note">Проверка окончена.</p>'
            : '<p class="conflict-note">Идёт проверка: ' + (req._revs || []).length + ' из ' + req.need + '.</p>';
    } else if (isOwnerPub) {
        $('#reviewZone').innerHTML = '<a class="create-btn" href="new-request.html?type=check&pub=' + p.id + '">Подать заявку на проверку</a>';
    }

    function trFileButton(tr) {
        if (tr.fileData) return '<a class="file-btn" href="' + tr.fileData + '" download="' + esc(tr.fileName || 'translation.pdf') + '">Скачать перевод ↓</a>';
        if (tr.hasFile) return '<a class="file-btn remote-file" href="#" data-filekey="tr-' + tr.id + '" data-filename="' + esc(tr.fileName || 'translation.pdf') + '">Скачать перевод ↓</a>';
        if (tr.file) return '<a class="file-btn" href="' + esc(tr.file) + '" target="_blank" rel="noopener">Скачать перевод ↓</a>';
        return '';
    }
    function renderTr() {
        const lang = $('#trLang').value;
        const tr = translations.find((t) => t.lang === lang);
        if (tr) {
            const author = personById(tr.author);
            $('#trView').innerHTML = '<b>' + esc(lang) + (author ? ' · перевод: <a href="profile.html?id=' + author.id + '">' + esc(author.name) + '</a>' : '') + '</b>' +
                (tr.text ? '<p>' + esc(tr.text) + '</p>' : '') + trFileButton(tr);
        } else { $('#trView').innerHTML = 'Перевода на «' + esc(lang) + '» пока нет.'; }
    }
    $('#trLang').innerHTML = LANGS.map((l) => '<option>' + esc(l) + '</option>').join('');
    $('#trLang').addEventListener('change', renderTr);
    renderTr();

    if (can(me, 'translate')) {
        $('#trAddBtn').hidden = false;
        $('#trAddBtn').addEventListener('click', () => {
            const form = $('#trForm');
            form.hidden = !form.hidden;
            if (!form.hidden) $('#trFormLang').innerHTML = LANGS.map((l) => '<option>' + esc(l) + '</option>').join('');
        });
        let pendingTrFile = null;
        $('#trFileInput').addEventListener('change', (e) => {
            const f = e.target.files[0]; if (!f) return;
            if (!/\.(pdf|doc|docx)$/i.test(f.name)) { alert('Только PDF или Word.'); e.target.value = ''; return; }
            if (f.size > 3 * 1024 * 1024) { alert('Файл больше 3 МБ.'); e.target.value = ''; return; }
            const reader = new FileReader();
            reader.onload = () => { pendingTrFile = { fileData: reader.result, fileName: f.name }; $('#trFileHint').textContent = 'Файл: ' + f.name; };
            reader.readAsDataURL(f);
        });
        $('#trForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const text = $('#trText').value.trim();
            if (!text && !pendingTrFile) { alert('Добавьте текст или файл.'); return; }
            const rec = { id: Date.now(), pub: p.id, lang: $('#trFormLang').value, author: me.id, text: text };
            if (pendingTrFile) { rec.fileData = pendingTrFile.fileData; rec.fileName = pendingTrFile.fileName; rec.hasFile = true; }
            LocalTranslations.add(rec);
            if (pendingTrFile) CloudFiles.upload('tr-' + rec.id, pendingTrFile);
            location.reload();
        });
    }

    $('#recCards').innerHTML = similarPubs(p).map(pubCard).join('');
    stagger($('#recCards').querySelectorAll('.card'));
    $('#emptyRec').hidden = similarPubs(p).length !== 0;

    /* ---------- ЦИТИРОВАНИЯ ---------- */
    const refsBlock = $('#refsBlock');
    if (refsBlock) {
        const refs = p.refs || [];
        const citedBy = (Store.pubs || []).filter((other) => (other.refs || []).includes(p.id));

        let html = '';

        if (refs.length) {
            html += '<h2 class="sub-title">Основа работы</h2><div class="refs-list">';
            refs.forEach((id) => {
                const refPub = (Store.pubs || []).find((x) => x.id === id);
                if (refPub) {
                    html += '<a class="ref-link" href="publication.html?id=' + id + '">' +
                        esc(refPub.title) + '<small>' + esc(refPub.authors) + ', ' + refPub.year + '</small></a>';
                }
            });
            html += '</div>';
        }

        if (citedBy.length) {
            html += '<h2 class="sub-title">Цитируется в</h2><div class="refs-list">';
            citedBy.forEach((cp) => {
                html += '<a class="ref-link" href="publication.html?id=' + cp.id + '">' +
                    esc(cp.title) + '<small>' + esc(cp.authors) + ', ' + cp.year + '</small></a>';
            });
            html += '</div>';
        }

        if (citedBy.length) {
            const meta = box.querySelector('.pub-meta');
            if (meta) {
                meta.insertAdjacentHTML('beforeend',
                    '<div class="dstat"><span>Цитирований</span><i class="dots"></i><b>' + citedBy.length + '</b></div>');
            }
        }

        refsBlock.innerHTML = html;
    }

    function renderComments() {
        const list = LocalComments.list().filter((c) => c.pub === p.id);
        $('#cCount').textContent = list.length + ' ' + plural(list.length, ['комментарий', 'комментария', 'комментариев']);
        $('#commentsList').innerHTML = list.map((c) => `
<article class="comment">
<div class="comment-head"><b>${esc(c.author)}</b><span>${esc(c.date)}</span></div>
<p>${esc(c.text)}</p>
</article>`).join('') || '<div class="empty">Комментариев пока нет.</div>';
    }
    $('#commentForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const text = $('#cText').value.trim(); if (!text) return;
        LocalComments.add({ id: Date.now(), pub: p.id, author: me.name, date: new Date().toISOString().slice(0, 10), text: text });
        $('#cText').value = ''; renderComments();
    });
    renderComments();
}

// ============================================================
// СОЗДАНИЕ / РЕДАКТИРОВАНИЕ ПУБЛИКАЦИИ
// ============================================================
function initPubEdit() {
    const id = +params.get('id');
    const existing = id ? (Store.pubs || []).find((x) => x.id === id) : null;
    const isEdit = !!existing;
    const me = effectiveUser();
    if (USER.guest) { location.href = 'login.html'; return; }
    if (!can(me, 'publish')) { $('#pubForm').innerHTML = '<div class="empty">Публиковать могут только исследователи.</div>'; return; }
    if (isEdit && !existing.authors.includes(me.short) && !isAdmin(me)) { $('#pubForm').innerHTML = '<div class="empty">Редактировать можно только свои публикации.</div>'; return; }
    const dept = DEPT_BY_N[me.dept];
    if (isEdit) { $('#formTitle').textContent = 'Редактирование'; $('#submitBtn').textContent = 'Сохранить'; $('#autoStatus').textContent = (STATUS[existing.status] || STATUS.wait).short; }
    $('#autoAuthor').textContent = me.name;
    $('#autoDept').textContent = dept ? dept.t.replace('Кафедра ', '') : 'без кафедры';
    $('#autoFac').textContent = dept ? dept.f : '—';

    let coSelected = isEdit ? existing.authors.split(',').map((s) => s.trim()).filter((a) => a && a !== me.short) : [];
    const coCandidates = Store.people.filter((x) => can(x, 'coauthor') && x.short !== me.short);
    function renderCoChips() {
        const box = $('#fCoChips');
        box.innerHTML = coSelected.map((s) => {
            const p = personByShort(s);
            return '<span class="ac-chip">' + esc(p ? p.name : s) + ' <button type="button" data-rm="' + esc(s) + '">×</button></span>';
        }).join('');
        box.querySelectorAll('button[data-rm]').forEach((b) => {
            b.addEventListener('click', () => { coSelected = coSelected.filter((x) => x !== b.getAttribute('data-rm')); renderCoChips(); });
        });
    }
    renderCoChips();
    bindAutocomplete($('#fCoSearch'), $('#fCoDrop'), coCandidates, (short) => coSelected.includes(short),
        (short) => { if (!coSelected.includes(short)) { coSelected.push(short); renderCoChips(); } });

    let supSelected = isEdit ? (existing.supervisor || '') : '';
    const supCandidates = Store.people.filter((x) => can(x, 'supervise') && x.short !== me.short);
    function renderSupChip() {
        const box = $('#fSupChips');
        if (!supSelected) { box.innerHTML = ''; return; }
        const p = personByShort(supSelected);
        box.innerHTML = '<span class="ac-chip">' + esc(p ? p.name : supSelected) + ' <button type="button" id="supRm">×</button></span>';
        $('#supRm').addEventListener('click', () => { supSelected = ''; renderSupChip(); });
    }
    renderSupChip();
    bindAutocomplete($('#fSupSearch'), $('#fSupDrop'), supCandidates, (short) => short === supSelected,
        (short) => { supSelected = short; renderSupChip(); });

    /* СПИСОК ЛИТЕРАТУРЫ */
    let refSelected = isEdit ? (existing.refs || []) : [];
    const refCandidates = (Store.pubs || []).filter((x) => x.id !== (existing ? existing.id : -1));
    function renderRefChips() {
        const box = $('#fRefChips');
        box.innerHTML = refSelected.map((id) => {
            const p = (Store.pubs || []).find((x) => x.id === id);
            if (!p) return '';
            return '<span class="ac-chip" data-pub-id="' + id + '">' + esc(p.title) +
                ' <button type="button" data-rm="' + id + '">×</button></span>';
        }).join('');
        box.querySelectorAll('button[data-rm]').forEach((b) => {
            b.addEventListener('click', () => {
                const rmId = +b.dataset.rm;
                refSelected = refSelected.filter((x) => x !== rmId);
                renderRefChips();
            });
        });
    }
    renderRefChips();
    bindAutocomplete($('#fRefSearch'), $('#fRefDrop'), refCandidates,
        (pub) => refSelected.includes(pub.id),
        (pub) => { if (!refSelected.includes(pub.id)) { refSelected.push(pub.id); renderRefChips(); } },
        (pub) => pub.title + ' · ' + pub.authors
    );

    $('#fTitle').value = isEdit ? existing.title : '';
    $('#fAbstract').value = isEdit ? (existing.abstract || '') : '';
    $('#fYear').value = isEdit ? existing.year : new Date().getFullYear();
    $('#fVenue').value = isEdit ? existing.venue : '';
    /* лицензия CC BY */
    const licSel = $('#fLicense');
    if (licSel) {
        licSel.innerHTML = Object.entries(CCL).map(([k, v]) =>
            '<option value="' + k + '"' + ((isEdit ? existing.license : 'CC BY') === k ? ' selected' : '') + '>' + esc(v.label) + '</option>').join('');
        const updHint = () => { const h = $('#licHint'); if (h && CCL[licSel.value]) h.textContent = CCL[licSel.value].hint; };
        licSel.addEventListener('change', updHint); updHint();
    }
    if (isEdit && (existing.fileData || existing.file)) $('#fileHint').textContent = 'Сейчас: ' + (existing.fileName || existing.file);

    let pendingFile = null;
    $('#fFileInput').addEventListener('change', (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (!/\.(pdf|doc|docx)$/i.test(f.name)) { alert('Только PDF или Word.'); e.target.value = ''; return; }
        if (f.size > 3 * 1024 * 1024) { alert('Файл больше 3 МБ.'); e.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => { pendingFile = { fileData: reader.result, fileName: f.name }; $('#fileHint').textContent = 'Файл: ' + f.name; };
        reader.readAsDataURL(f);
    });
    $('#pubForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = $('#fTitle').value.trim(); if (!title) { $('#fTitle').focus(); return; }
        const refIds = Array.from(document.querySelectorAll('#fRefChips .ac-chip'))
            .map((chip) => +chip.dataset.pubId)
            .filter((id) => !isNaN(id));
        const patch = {
            title: title, abstract: $('#fAbstract').value.trim(),
            authors: [me.short].concat(coSelected).join(', '),
            dept: me.dept, year: (+$('#fYear').value) || new Date().getFullYear(),
            venue: $('#fVenue').value.trim() || '—', supervisor: supSelected,
            license: licSel ? licSel.value : 'CC BY',
            refs: refIds
        };
        if (pendingFile) { patch.fileData = pendingFile.fileData; patch.fileName = pendingFile.fileName; patch.hasFile = true; }
        if (isEdit) {
            LocalPubs.update(existing.id, patch);
            if (pendingFile) CloudFiles.upload('pub-' + existing.id, pendingFile);
            location.href = 'publication.html?id=' + existing.id;
        } else {
            patch.id = nextPubId(); patch.status = 'wait';
            LocalPubs.add(patch);
            if (pendingFile) CloudFiles.upload('pub-' + patch.id, pendingFile);
            location.href = 'publication.html?id=' + patch.id;
        }
    });
}

// ============================================================
// ЗАПРОСЫ
// ============================================================
function initRequests() {
    const pre = params.get('type');
    const state = { type: REQ_TYPES[pre] ? pre : 'Все' };
    function render() {
        let list = (Store.requests || []).filter((r) => state.type === 'Все' || r.type === state.type);
        list = list.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        $('#reqList').innerHTML = list.map(requestCard).join('');
        bindReviewForms($('#reqList'));
        $('#count').textContent = list.length + ' ' + plural(list.length, ['запрос', 'запроса', 'запросов']);
        $('#empty').hidden = list.length !== 0;
    }
    buildFilters(
        [{ key: 'Все', label: 'Все' }].concat(Object.entries(REQ_TYPES).map(([k, t]) => ({ key: k, label: t.label }))),
        state.type, (k) => { state.type = k; render(); }
    );
    render();
    try { Notifications.markRequestsSeen(); } catch (e) {}
    if (window.OU_badges) window.OU_badges.refresh();
}

function initNewRequest() {
    const preType = params.get('type');
    const prePub = +params.get('pub');
    if (USER.guest) { location.href = 'login.html'; return; }
    function fieldsFor(type) {
        if (type === 'sup') return `
<label class="fld"><span>Кто вы</span><textarea id="qWho" rows="2">${esc(USER.name)}, ${esc(USER.note || '')}</textarea></label>
<label class="fld"><span>Зачем</span><textarea id="qWhy" rows="3" required></textarea></label>
<label class="fld"><span>Тема</span><input id="qTopic" required></label>
<label class="fld"><span>Вознаграждение (руб.)</span><input id="qReward" type="number" min="1" value="1"></label>`;
        if (type === 'res') return `
<label class="fld"><span>Кто вы</span><textarea id="qWho" rows="2">${esc(USER.name)}, ${esc(USER.note || '')}</textarea></label>
<label class="fld"><span>О чём</span><input id="qAbout" required></label>
<label class="fld"><span>Подробности</span><textarea id="qDetails" rows="3"></textarea></label>`;
        if (type === 'trn') return `
<div class="fld"><span>Работа</span><select class="select" id="qPub">${(Store.pubs || []).map((p) => '<option value="' + p.id + '"' + (prePub === p.id ? ' selected' : '') + '>' + esc(p.title) + '</option>').join('')}</select></div>
<div class="fld"><span>Язык</span><select class="select" id="qLang">${LANGS.map((l) => '<option>' + esc(l) + '</option>').join('')}</select></div>`;
        const mine = (Store.pubs || []).filter((p) => p.authors.includes(USER.short));
        return `
<div class="fld"><span>Ваша работа</span><select class="select" id="qPub">${mine.map((p) => '<option value="' + p.id + '"' + (prePub === p.id ? ' selected' : '') + '>' + esc(p.title) + '</option>').join('') || '<option value="">Нет работ</option>'}</select></div>
<div class="fld"><span>Сколько рецензий</span><select class="select" id="qNeed"><option>2</option><option>3</option><option>4</option><option>5</option></select></div>
<p class="conflict-note" id="qCost"></p>`;
    }
    function refresh() {
        const type = $('#reqType').value;
        $('#reqFields').innerHTML = fieldsFor(type);
        const needSel = $('#qNeed');
        if (needSel) { const upd = () => { $('#qCost').textContent = 'Стоимость: ' + needSel.value + ' руб.'; }; needSel.addEventListener('change', upd); upd(); }
    }
    if (REQ_TYPES[preType]) $('#reqType').value = preType;
    $('#reqType').addEventListener('change', refresh);
    refresh();
    $('#reqForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const type = $('#reqType').value;
        const base = { id: Date.now(), type: type, author: USER.id, date: new Date().toISOString().slice(0, 10) };
        if (type === 'sup') { base.who = $('#qWho').value.trim(); base.why = $('#qWhy').value.trim(); base.topic = $('#qTopic').value.trim(); base.reward = (+$('#qReward').value) || 1; if (!base.why || !base.topic) return; }
        if (type === 'res') { base.who = $('#qWho').value.trim(); base.about = $('#qAbout').value.trim(); base.details = $('#qDetails').value.trim(); if (!base.about) return; }
        if (type === 'trn') { base.pubId = +$('#qPub').value; base.lang = $('#qLang').value; }
        if (type === 'check') {
            const pubId = +$('#qPub').value; if (!pubId) { alert('Сначала создайте публикацию.'); return; }
            if ((Store.requests || []).some((r) => r.type === 'check' && r.pubId === pubId && !r._done)) { alert('Проверка уже идёт.'); return; }
            base.pubId = pubId; base.need = +$('#qNeed').value; base.cost = base.need; base.reviews = [];
        }
        LocalRequests.add(base); location.reload();
    });
    const mine = (Store.requests || []).filter((r) => r.author === USER.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    $('#myReqs').innerHTML = mine.map(requestCard).join('');
    bindReviewForms($('#myReqs'));
    $('#myReqCount').textContent = mine.length + ' ' + plural(mine.length, ['запрос', 'запроса', 'запросов']);
    $('#empty').hidden = mine.length !== 0;
}

// ============================================================
// ВХОД / РЕГИСТРАЦИЯ
// ============================================================
function initAuth() {
    const reg = params.get('mode') === 'reg';
    $('#loginForm').hidden = reg;
    $('#regForm').hidden = !reg;
    const demoHint = $('#loginForm .conflict-note');
    if (demoHint) demoHint.remove();
    $('#rDept').innerHTML = '<option value="">— без кафедры —</option>' + DEPTS.map((d) => '<option value="' + d.n + '">' + esc(d.t) + '</option>').join('');
    $('#rRoles').innerHTML = Object.entries(ROLES).filter(([k]) => k !== 'adm').map(([k, r]) =>
        '<label><input type="checkbox" value="' + k + '"' + (k === 'res' ? ' checked' : '') + '> ' + esc(r.label) + '</label>').join('');
    if (!USER.guest) {
        const note = document.createElement('div');
        note.className = 'conflict-note'; note.style.marginBottom = '14px';
        note.innerHTML = 'Вы вошли как <b>' + esc(USER.name) + '</b>. <a href="#" id="doLogout">Выйти</a>.';
        $('.auth-wrap').insertBefore(note, $('.auth-wrap').firstChild);
        $('#doLogout').addEventListener('click', (e) => { e.preventDefault(); Session.clear(); location.href = 'login.html'; });
    }
    $('#loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const u = LocalUsers.findByEmail($('#lEmail').value.trim().toLowerCase());
        if (!u || u.pass !== hashPass($('#lPass').value)) { alert('Неверный email или пароль.'); return; }
        Session.set(u.id); location.href = 'profile.html?id=' + u.id;
    });
    $('#regForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#rName').value.trim();
        const email = $('#rEmail').value.trim().toLowerCase();
        const pass = $('#rPass').value;
        if (name.split(' ').length < 2) { alert('Укажите ФИО.'); return; }
        if (LocalUsers.findByEmail(email)) { alert('Email уже занят.'); return; }
        const words = name.split(' ');
        const short = words[0] + ' ' + (words[1] ? words[1][0] + '.' : '') + (words[2] ? ' ' + words[2][0] + '.' : '');
        const existingMax = Math.max(0, ...Store.people.map((p) => p.id).filter((v) => v < 90000));
        const id = LocalUsers.nextId(existingMax);
        const deptVal = $('#rDept').value;
        const degVal = $('#rDeg').value;
        LocalUsers.add({
            id: id, name: name, short: short, email: email, pass: hashPass(pass),
            dept: deptVal === '' ? null : +deptVal, deg: degVal === '' ? null : degVal,
            roles: Array.from($('#rRoles').querySelectorAll('input:checked')).map((i) => i.value),
            note: $('#rNote').value.trim() || 'Участник', years: 0, balance: 5, interests: [], experience: ''
        });
        Session.set(id); location.href = 'profile.html?id=' + id;
    });
}

// ============================================================
// ЖАЛОБЫ: письмо администрации (доступно всем, включая гостей)
// ============================================================
const cmpTypeLabel = (k) => (COMPLAINT_TYPES[k] || { label: 'Без темы' }).label;
const cmpStatusBadge = (c) => {
    const s = COMPLAINT_STATUS[c.status] || COMPLAINT_STATUS.new;
    return '<span class="status ' + s.cls + '">' + s.label + '</span>';
};
const cmpDate = (ts) => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function initComplaint() {
    const form = $('#cmpForm'), okBox = $('#cmpSuccess');
    if (!form) return;

    // тема обращения — из словаря
    $('#cmpType').innerHTML = Object.entries(COMPLAINT_TYPES)
        .map(([k, t]) => '<option value="' + k + '">' + esc(t.label) + '</option>').join('');

    // автозаполнение для авторизованных + скрытие полей имени/email
    const authed = !USER.guest;
    if (authed) {
        $('#cmpName').value = USER.name || '';
        $('#cmpEmail').value = USER.email || '';
        form.querySelectorAll('.fld-row .fld').forEach((f) => f.style.display = 'none');
    }

    // счётчик символов
    const ta = $('#cmpText'), counter = $('#cmpCounter');
    ta.addEventListener('input', () => { counter.textContent = ta.value.length + ' / 2000'; });

    // «Мои обращения» — только для авторизованных (по id или email гостя)
    function myComplaints() {
        const all = LocalComplaints.list();
        return all.filter((c) => authed ? c.uid === USER.id : (c.email || '').toLowerCase() === (localStorage.getItem('ou_cmp_email') || '').toLowerCase());
    }
    function renderMine() {
        const box = $('#cmpMine'), list = $('#cmpMineList');
        const mine = myComplaints().sort((a, b) => (b._ts || 0) - (a._ts || 0));
        if (!mine.length || (!authed && !localStorage.getItem('ou_cmp_email'))) { box.hidden = true; return; }
        box.hidden = false;
        list.innerHTML = mine.map((c) => `
<div class="cmp-item${c.read ? '' : ' unread'}">
<div class="cmp-item-head">
<b>${esc(cmpTypeLabel(c.type))}</b>${cmpStatusBadge(c)}
<span class="cmp-item-date">${cmpDate(c._ts)}</span>
</div>
<p class="cmp-item-text">${esc(c.text)}</p>
${c.reply ? '<div class="cmp-reply"><small>Ответ администрации · ' + cmpDate(c.replyAt || c._ts) + '</small>' + esc(c.reply) + '</div>' : ''}
</div>`).join('');
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#cmpName').value.trim();
        const email = $('#cmpEmail').value.trim();
        const text = ta.value.trim();
        if (name.length < 2) { alert('Укажите имя.'); $('#cmpName').focus(); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { alert('Укажите корректный email для ответа.'); $('#cmpEmail').focus(); return; }
        if (text.length < 10) { alert('Опишите проблему подробнее (минимум 10 символов).'); ta.focus(); return; }

        LocalComplaints.add({
            id: Date.now(),
            uid: authed ? USER.id : null,
            fromName: authed ? USER.name : name,
            fromShort: authed ? USER.short : name,
            name: name, email: email,
            type: $('#cmpType').value,
            text: text,
            page: location.origin + location.pathname,
            status: 'new', read: false, reply: null, replyAt: null
        });
        localStorage.setItem('ou_cmp_email', email); // чтобы гость видел статус своего обращения

        form.hidden = true;
        okBox.hidden = false;
        renderMine();
        window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    });

    $('#cmpAgain').addEventListener('click', () => {
        okBox.hidden = true; form.hidden = false;
        ta.value = ''; counter.textContent = '0 / 2000';
        $('#cmpType').value = 'other';
    });

    renderMine();
    try { Notifications.markComplaintsSeen(); } catch (e) {}
    if (window.OU_badges) window.OU_badges.refresh();
}

// ============================================================
// АДМИН-ПАНЕЛЬ
// ============================================================
function initAdmin() {
    if (!isAdmin(USER)) { document.querySelector('.content').innerHTML = '<div class="empty">Доступ только для администраторов.</div>'; return; }
    const isSystemAdmin = (u) => !!u && (u.id === 99999 || u.email === 'admin@ou.ru');
    const iAmSystem = isSystemAdmin(USER);
    document.querySelectorAll('#adminTabs .fbtn').forEach((b) => {
        b.addEventListener('click', () => {
            document.querySelectorAll('#adminTabs .fbtn').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
            ['users', 'depts', 'pubs', 'complaints', 'stats'].forEach((t) => { $('#tab-' + t).hidden = b.dataset.tab !== t; });
            if (b.dataset.tab === 'stats' && !window._statsRendered) {
                initAdminStats();
                window._statsRendered = true;
            }
        });
    });
    function renderUsers() {
        const list = LocalUsers.list();
        $('#tab-users').innerHTML = `<h2 class="sub-title">Пользователи · ${list.length}</h2>
<table class="admin-table"><colgroup><col style="width:7%"><col style="width:24%"><col style="width:22%"><col style="width:15%"><col style="width:16%"><col style="width:16%"></colgroup><thead><tr><th>ID</th><th>ФИО</th><th>Email</th><th>Кафедра</th><th>Роли</th><th>Действия</th></tr></thead><tbody>
${list.map((u) => `<tr data-uid="${u.id}"><td>${u.id}</td><td><a href="profile.html?id=${u.id}">${esc(u.name)}</a></td><td>${esc(u.email)}</td>
<td>${u.dept != null && DEPT_BY_N[u.dept] ? esc(DEPT_BY_N[u.dept].t) : '—'}</td>
<td>${Object.entries(ROLES).map(([k, r]) => {
    const locked = (k === 'adm') && (isSystemAdmin(u) || !iAmSystem);
    return `<label${locked ? ' class="role-locked"' : ''}><input type="checkbox" data-role="${k}"${(u.roles || []).includes(k) ? ' checked' : ''}${locked ? ' disabled' : ''}> ${r.letter}</label>`;
}).join(' ')}</td>
<td class="admin-actions"><button data-save="${u.id}">Сохранить</button>${u.id !== USER.id && !isSystemAdmin(u) ? '<button class="danger" data-del="' + u.id + '">Удалить</button>' : ''}</td></tr>`).join('')}
</tbody></table>`;
        $('#tab-users').querySelectorAll('button[data-save]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = +btn.dataset.save; const target = LocalUsers.byId(id);
                let roles = Array.from(btn.closest('tr').querySelectorAll('input[data-role]:checked')).map((i) => i.dataset.role);
                if (isSystemAdmin(target) && !roles.includes('adm')) roles.push('adm');
                if (!iAmSystem) { const had = (target.roles || []).includes('adm'); if (had && !roles.includes('adm')) roles.push('adm'); if (!had && roles.includes('adm')) roles = roles.filter((r) => r !== 'adm'); }
                LocalUsers.update(id, { roles: roles }); alert('Сохранено.');
            });
        });
        $('#tab-users').querySelectorAll('button[data-del]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = +btn.dataset.del;
                if (isSystemAdmin(LocalUsers.byId(id))) { alert('Нельзя удалить системного админа.'); return; }
                if (confirm('Удалить пользователя?')) { LocalUsers.remove(id); renderUsers(); }
            });
        });
    }
    function renderDepts() {
        const all = (Store.depts || []).filter((d) => !d.tpl);
        $('#tab-depts').innerHTML = `<h2 class="sub-title">Создать кафедру</h2>
<form class="pub-form new-dept-form" id="newDeptAdmin">
<div class="fld-row"><label class="fld"><span>Название *</span><input id="ndaName" required></label>
<label class="fld"><span>Направление *</span><select class="select" id="ndaFac">${FAC.map((f) => '<option>' + esc(f) + '</option>').join('')}</select></label></div>
<div class="fld-row"><label class="fld"><span>Иконка кафедры</span>${(window.OU_icons && OU_icons.iconSelectHTML) ? OU_icons.iconSelectHTML('ndaIcon', '') : '<select id="ndaIcon"></select>'}</label>
<label class="fld"><span>Описание</span><input id="ndaDesc"></label></div>
<div class="fld-row"><label class="fld"><span>Фото кафедры (необязательно)</span><input type="file" id="ndaPhoto" accept="image/*"></label></div>
<div class="form-actions"><button class="file-btn" type="submit">Создать</button></div></form>
<h2 class="sub-title">Кафедры · ${all.length}</h2>
<table class="admin-table"><thead><tr><th>N</th><th>Название</th><th>Создатель</th><th>Действия</th></tr></thead><tbody>
${all.map((d) => `<tr><td>${d.n}</td><td>${esc(d.t)}</td><td>${d.createdBy != null ? esc(d.creatorName || '') : 'база'}</td>
<td class="admin-actions"><a class="btn" href="dept.html?id=${d.n}">Открыть</a><button class="danger" data-del-d="${d.n}">Удалить</button></td></tr>`).join('')}
</tbody></table>`;
        $('#newDeptAdmin').addEventListener('submit', (e) => {
            e.preventDefault(); const name = $('#ndaName').value.trim(); if (!name) return;
            const n = LocalDepts.nextN(Math.max(...(Store.depts || []).map((d) => d.n)));
            const rec = { n: n, f: $('#ndaFac').value, ic: (window.OU_icons && $('#ndaIcon')) ? OU_icons.normalizeDept({ ic: $('#ndaIcon').value, f: $('#ndaFac').value }).ic : ($('#ndaIcon') ? $('#ndaIcon').value : 'cap'), t: name, x: $('#ndaDesc').value.trim(), d: 0, k: 0, a: 0, ch: 0, createdBy: USER.id, creatorName: USER.name };
            const pfEl = $('#ndaPhoto');
            const pf = pfEl && pfEl.files[0];
            const finish = () => { LocalDepts.add(rec); renderDepts(); };
            if (pf && window.OU_icons) {
                OU_icons.readImage(pf, 1400, (err, dataUrl) => { if (!err) rec.photo = dataUrl; finish(); }, 16 / 7);
            } else finish();
        });
        $('#tab-depts').querySelectorAll('button[data-del-d]').forEach((btn) => {
            btn.addEventListener('click', () => { if (confirm('Удалить кафедру?')) { LocalDepts.remove(+btn.dataset.delD); renderDepts(); } });
        });
    }
    function renderPubs() {
        const list = (Store.pubs || []).slice().sort((a, b) => b.year - a.year || a.id - b.id);
        $('#tab-pubs').innerHTML = `<h2 class="sub-title">Публикации · ${list.length}</h2>
<table class="admin-table"><colgroup><col style="width:8%"><col style="width:40%"><col style="width:22%"><col style="width:30%"></colgroup><thead><tr><th>ID</th><th>Название</th><th>Статус</th><th>Действия</th></tr></thead><tbody>
${list.map((p) => `<tr><td>${p.id}</td><td><a href="publication.html?id=${p.id}">${esc(p.title)}</a></td>
<td><select data-stat="${p.id}">${Object.entries(STATUS).map(([k, s]) => '<option value="' + k + '"' + (p.status === k ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('')}</select></td>
<td class="admin-actions"><button data-save-stat="${p.id}">Сменить</button><button class="danger" data-del-p="${p.id}">Удалить</button></td></tr>`).join('')}
</tbody></table>`;
        $('#tab-pubs').querySelectorAll('button[data-save-stat]').forEach((btn) => {
            btn.addEventListener('click', () => { LocalPubs.update(+btn.dataset.saveStat, { status: btn.closest('tr').querySelector('select[data-stat]').value }); alert('Готово.'); });
        });
        $('#tab-pubs').querySelectorAll('button[data-del-p]').forEach((btn) => {
            btn.addEventListener('click', () => { if (confirm('Удалить?')) { LocalPubs.remove(+btn.dataset.delP); renderPubs(); } });
        });
    }
    // ---------- ЖАЛОБЫ (вкладка администрации) ----------
    const cmpState = { filter: 'all', q: '' };
    function updateCmpBadge() {
        const badge = $('#cmpTabBadge');
        if (!badge) return;
        const n = LocalComplaints.list().filter((c) => !c.read && c.status !== 'closed').length;
        badge.textContent = n || '';
        badge.hidden = !n;
    }
    function renderComplaints() {
        const all = LocalComplaints.list().slice().sort((a, b) => (b._ts || 0) - (a._ts || 0));
        const counts = { all: all.length, new: 0, doing: 0, closed: 0 };
        all.forEach((c) => { counts[c.status || 'new'] = (counts[c.status || 'new'] || 0) + 1; });
        let list = all;
        if (cmpState.filter !== 'all') list = list.filter((c) => (c.status || 'new') === cmpState.filter);
        if (cmpState.q) {
            const q = cmpState.q.toLowerCase();
            list = list.filter((c) => [c.name, c.email, c.text, cmpTypeLabel(c.type)].join(' ').toLowerCase().includes(q));
        }
        $('#tab-complaints').innerHTML = `
<h2 class="sub-title">Жалобы и обращения · ${all.length}</h2>
<div class="cmp-admin-toolbar">
${[['all', 'Все'], ['new', 'Новые'], ['doing', 'В работе'], ['closed', 'Закрытые']].map(([k, l]) =>
    '<button class="fbtn' + (cmpState.filter === k ? ' on' : '') + '" data-cmpf="' + k + '">' + l + ' <small>' + (counts[k] || 0) + '</small></button>').join('')}
<input id="cmpSearch" class="cmp-search" type="search" placeholder="поиск по жалобам…" value="${esc(cmpState.q)}">
<button class="btn" id="cmpExport" type="button" title="Скачать CSV">CSV</button>
</div>
<div id="cmpAdminList">
${list.length ? list.map((c) => `
<article class="cmp-card${c.read ? '' : ' unread'}" data-cmp="${c.id}">
<div class="cmp-card-head">
<span class="status ${COMPLAINT_STATUS[c.status || 'new'].cls}">${COMPLAINT_STATUS[c.status || 'new'].label}</span>
<b class="cmp-card-topic">${esc(cmpTypeLabel(c.type))}</b>
<span class="cmp-card-date">${cmpDate(c._ts)}</span>
${c.read ? '' : '<span class="cmp-new-tag">новая</span>'}
</div>
<div class="cmp-card-meta">
от <b>${esc(c.fromName || c.name || '—')}</b>${c.uid ? ' (<a href="profile.html?id=' + c.uid + '">страница</a>)' : ''} ·
<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>${c.page ? ' · со страницы <code>' + esc(c.page.replace(/^https?:\/\//, '')) + '</code>' : ''}
</div>
<p class="cmp-card-text">${esc(c.text)}</p>
${c.reply ? '<div class="cmp-reply"><small>Ответ администрации · ' + cmpDate(c.replyAt || c._ts) + '</small>' + esc(c.reply) + '</div>' : ''}
<div class="cmp-card-actions">
<select data-cmpstat="${c.id}">${Object.entries(COMPLAINT_STATUS).map(([k, s]) => '<option value="' + k + '"' + ((c.status || 'new') === k ? ' selected' : '') + '>' + s.label + '</option>').join('')}</select>
<button type="button" data-cmpraw="${c.id}">↩ Ответить</button>
<button type="button" class="danger" data-cmpdel="${c.id}">Удалить</button>
</div>
<div class="cmp-reply-box" data-cmpreply="${c.id}" hidden>
<textarea rows="4" maxlength="2000" placeholder="Текст ответа пользователю…"></textarea>
<div class="form-actions"><button class="file-btn" type="button" data-cmpsend="${c.id}">Отправить ответ</button></div>
</div>
</article>`).join('') : '<div class="empty">' + (all.length ? 'Ничего не найдено.' : 'Жалоб пока нет — письма с формы «Письмо администрации» появятся здесь.') + '</div>'}
</div>`;

        $('#tab-complaints').querySelectorAll('[data-cmpf]').forEach((b) => {
            b.addEventListener('click', () => { cmpState.filter = b.dataset.cmpf; renderComplaints(); });
        });
        const search = $('#cmpSearch');
        search.addEventListener('input', () => {
            cmpState.q = search.value.trim();
            clearTimeout(search._t);
            search._t = setTimeout(renderComplaints, 250);
            const pos = search.selectionStart; search.focus(); try { search.setSelectionRange(pos, pos); } catch (e) {}
        });
        $('#tab-complaints').querySelectorAll('[data-cmpstat]').forEach((sel) => {
            sel.addEventListener('change', () => {
                LocalComplaints.update(+sel.dataset.cmpstat, { status: sel.value, read: true });
                updateCmpBadge(); renderComplaints();
            });
        });
        $('#tab-complaints').querySelectorAll('[data-cmpraw]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const box = $('#tab-complaints').querySelector('[data-cmpreply="' + btn.dataset.cmpraw + '"]');
                if (box) { box.hidden = !box.hidden; if (!box.hidden) box.querySelector('textarea').focus(); }
            });
        });
        $('#tab-complaints').querySelectorAll('[data-cmpsend]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = +btn.dataset.cmpsend;
                const box = $('#tab-complaints').querySelector('[data-cmpreply="' + id + '"]');
                const text = box.querySelector('textarea').value.trim();
                if (text.length < 3) { alert('Напишите текст ответа.'); return; }
                LocalComplaints.update(id, { reply: text, replyAt: _ts(), read: true });
                alert('Ответ сохранён. Пользователь увидит его в разделе «Мои обращения».');
                updateCmpBadge(); renderComplaints();
            });
        });
        $('#tab-complaints').querySelectorAll('[data-cmpdel]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (confirm('Удалить обращение безвозвратно?')) {
                    LocalComplaints.remove(+btn.dataset.cmpdel);
                    updateCmpBadge(); renderComplaints();
                }
            });
        });
        // открытие карточки = «прочитано»
        $('#tab-complaints').querySelectorAll('.cmp-card.unread').forEach((card) => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button, select, a, textarea')) return;
                LocalComplaints.update(+card.dataset.cmp, { read: true });
                card.classList.remove('unread');
                const tag = card.querySelector('.cmp-new-tag'); if (tag) tag.remove();
                updateCmpBadge();
            });
        });
        $('#cmpExport').addEventListener('click', () => {
            const rows = [['ID', 'Дата', 'Тема', 'Статус', 'Имя', 'Email', 'Текст', 'Ответ']];
            all.forEach((c) => rows.push([
                c.id, new Date(c._ts).toLocaleString('ru-RU'), cmpTypeLabel(c.type),
                (COMPLAINT_STATUS[c.status || 'new'] || COMPLAINT_STATUS.new).label,
                c.name || '', c.email || '', c.text || '', c.reply || ''
            ]));
            const csv = rows.map((r) => r.map((cell) => {
                const s = String(cell == null ? '' : cell);
                return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            }).join(';')).join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'complaints.csv';
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        });
    }
    renderUsers(); renderDepts(); renderPubs(); renderComplaints(); updateCmpBadge();
}

// ============================================================
// АДМИН-СТАТИСТИКА
// ============================================================
function initAdminStats() {
    const box = $('#tab-stats');
    if (!box) return;

    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const palette = () => ({
        ink: css('--ink') || '#211F1A',
        muted: css('--muted') || '#7A7365',
        line: css('--line-2') || '#9A9280',
        paper: css('--paper') || '#F5F0E6',
        bg2: css('--bg-2') || '#F7F2E5',
        bd: css('--bd') || '#C05A2E',
        bk: css('--bk') || '#7D8F4C',
        ba: css('--ba') || '#7A9480',
        bch: css('--bch') || '#A98153',
        accent: css('--accent') || '#C05A2E'
    });

    const charts = [];
    function makeChart(canvas, cfg) {
        const p = palette();
        const ctx = canvas.getContext('2d');
        const instance = new Chart(ctx, Object.assign({
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: p.ink, font: { size: 11 } } } },
                scales: {}
            }
        }, cfg));
        if (instance.options.plugins.legend) instance.options.plugins.legend.labels.color = p.ink;
        if (instance.options.scales) {
            Object.values(instance.options.scales).forEach((s) => {
                if (s.ticks) s.ticks.color = p.muted;
                if (s.grid) s.grid.color = p.line + '55';
            });
        }
        instance.update();
        charts.push(instance);
        return instance;
    }

    function toCSV(rows) {
        return rows.map((r) => r.map((c) => {
            const s = String(c == null ? '' : c);
            return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(';')).join('\n');
    }
    function downloadCSV(filename, rows) {
        const blob = new Blob(['\uFEFF' + toCSV(rows)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    }
    function bindCSV(btnId, filename, rowsFn) {
        const b = document.getElementById(btnId);
        if (b) b.addEventListener('click', () => downloadCSV(filename, rowsFn()));
    }

    const depts = (Store.depts || []).filter((d) => !d.tpl);
    const people = Store.people || [];
    const pubs = Store.pubs || [];
    const reviews = Store.reviews || [];
    const requests = Store.requests || [];
    const translations = Store.translations || [];

    const totals = [
        ['Кафедр', depts.length],
        ['Людей в базе', people.length],
        ['Публикаций', pubs.length],
        ['Рецензий (в базе)', reviews.length],
        ['Переводов', translations.length],
        ['Запросов', requests.length],
        ['Зарегистрированных пользователей', LocalUsers.list().length]
    ];
    const totalsHTML = totals.map(([l, v]) =>
        '<div class="stat-tile"><b>' + v + '</b><span>' + esc(l) + '</span></div>'
    ).join('');

    const byStatus = {};
    Object.keys(STATUS).forEach((k) => { byStatus[k] = 0; });
    pubs.forEach((p) => { if (byStatus[p.status] != null) byStatus[p.status]++; });

    const byYear = {};
    pubs.forEach((p) => { const y = p.year || '—'; byYear[y] = (byYear[y] || 0) + 1; });
    const years = Object.keys(byYear).sort();

    const pubsByDept = {};
    depts.forEach((d) => { pubsByDept[d.n] = 0; });
    pubs.forEach((p) => { if (pubsByDept[p.dept] != null) pubsByDept[p.dept]++; });
    const topDeptsByPubs = depts
        .map((d) => ({ n: d.n, t: d.t, w: pubsByDept[d.n] || 0 }))
        .sort((a, b) => b.w - a.w).slice(0, 10);

    const pubsByAuthor = {};
    pubs.forEach((p) => {
        (p.authors || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((a) => {
            pubsByAuthor[a] = (pubsByAuthor[a] || 0) + 1;
        });
    });
    const topAuthors = Object.entries(pubsByAuthor).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const peopleByDept = {};
    depts.forEach((d) => { peopleByDept[d.n] = 0; });
    people.forEach((p) => { if (peopleByDept[p.dept] != null) peopleByDept[p.dept]++; });
    const deptsByPeople = depts
        .map((d) => ({ n: d.n, t: d.t, ch: peopleByDept[d.n] || 0 }))
        .sort((a, b) => b.ch - a.ch);

    const deptsByFac = {};
    depts.forEach((d) => { deptsByFac[d.f] = (deptsByFac[d.f] || 0) + 1; });

    const deptTableRows = depts.map((d) => {
        const s = deptStats(d.n);
        return { n: d.n, t: d.t, f: d.f, d: s.d, k: s.k, a: s.a, ch: s.ch, w: s.w };
    });

    const byRole = {};
    Object.keys(ROLES).forEach((k) => { byRole[k] = 0; });
    people.forEach((p) => (p.roles || []).forEach((r) => { if (byRole[r] != null) byRole[r]++; }));

    const byDeg = { d: 0, k: 0, a: 0, none: 0 };
    people.forEach((p) => {
        if (p.deg === 'd') byDeg.d++;
        else if (p.deg === 'k') byDeg.k++;
        else if (p.deg === 'a') byDeg.a++;
        else byDeg.none++;
    });

    const revCount = {};
    reviews.forEach((r) => { revCount[r.reviewer] = (revCount[r.reviewer] || 0) + 1; });
    const topReviewers = Object.entries(revCount)
        .map(([id, n]) => { const p = personById(+id); return { name: p ? p.name : 'ID ' + id, n: n }; })
        .sort((a, b) => b.n - a.n).slice(0, 10);

    const topPubAuthors = Object.entries(pubsByAuthor)
        .map(([short, n]) => { const p = personByShort(short); return { name: p ? p.name : short, n: n }; })
        .sort((a, b) => b.n - a.n).slice(0, 10);

    const users = LocalUsers.list();
    const regByMonth = {};
    users.forEach((u) => {
        if (!u._ts) return;
        const d = new Date(u._ts);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        regByMonth[key] = (regByMonth[key] || 0) + 1;
    });
    const regMonths = Object.keys(regByMonth).sort();

    const checkReqs = requests.filter((r) => r.type === 'check' && r._done);
    let avgCheckDays = '—';
    if (checkReqs.length) {
        const total = checkReqs.reduce((sum, r) => {
            const revs = r._revs || [];
            if (!revs.length) return sum;
            const first = Math.min(...revs.map((v) => new Date(v.date || r.date).getTime()));
            const last = Math.max(...revs.map((v) => new Date(v.date || r.date).getTime()));
            return sum + (last - first) / (1000 * 60 * 60 * 24);
        }, 0);
        avgCheckDays = (total / checkReqs.length).toFixed(1);
    }

    const reqByType = {};
    Object.keys(REQ_TYPES).forEach((k) => { reqByType[k] = 0; });
    requests.forEach((r) => { if (reqByType[r.type] != null) reqByType[r.type]++; });

    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentRevs = {};
    reviews.forEach((r) => {
        const t = r._ts || new Date(r.date).getTime();
        if (t >= monthAgo) recentRevs[r.reviewer] = (recentRevs[r.reviewer] || 0) + 1;
    });
    const topRecentReviewers = Object.entries(recentRevs)
        .map(([id, n]) => { const p = personById(+id); return { name: p ? p.name : 'ID ' + id, n: n }; })
        .sort((a, b) => b.n - a.n).slice(0, 10);

    box.innerHTML = `
<section class="stats-block">
<h2 class="sub-title">Общие показатели</h2>
<div class="stats-tiles">${totalsHTML}</div>
</section>

<section class="stats-block">
<h2 class="sub-title">Публикации</h2>
<div class="stats-row">
<div class="stats-chart"><canvas id="ch-pub-status"></canvas></div>
<div class="stats-chart"><canvas id="ch-pub-year"></canvas></div>
</div>
<h3 class="stats-h3">Топ-10 кафедр по числу работ</h3>
<table class="admin-table stats-table" id="tbl-pub-dept">
<thead><tr><th>Кафедра</th><th>Публикаций</th></tr></thead>
<tbody>${topDeptsByPubs.map((d) => '<tr><td>' + esc(d.t) + '</td><td>' + d.w + '</td></tr>').join('')}</tbody>
</table>
<button class="edit-btn stats-csv" id="csv-pub-dept" type="button">Скачать CSV</button>

<h3 class="stats-h3">Топ-10 авторов по числу публикаций</h3>
<table class="admin-table stats-table" id="tbl-pub-auth">
<thead><tr><th>Автор</th><th>Публикаций</th></tr></thead>
<tbody>${topAuthors.map(([a, n]) => '<tr><td>' + esc(a) + '</td><td>' + n + '</td></tr>').join('')}</tbody>
</table>
<button class="edit-btn stats-csv" id="csv-pub-auth" type="button">Скачать CSV</button>
</section>

<section class="stats-block">
<h2 class="sub-title">Кафедры</h2>
<div class="stats-row">
<div class="stats-chart"><canvas id="ch-dept-people"></canvas></div>
<div class="stats-chart"><canvas id="ch-dept-fac"></canvas></div>
</div>
<h3 class="stats-h3">Состав кафедр</h3>
<table class="admin-table stats-table" id="tbl-dept">
<thead><tr><th>Кафедра</th><th>Направление</th><th>Д</th><th>К</th><th>А</th><th>Ч</th><th>Публикаций</th></tr></thead>
<tbody>${deptTableRows.map((d) =>
        '<tr><td>' + esc(d.t) + '</td><td>' + esc(d.f) + '</td><td>' + d.d + '</td><td>' + d.k + '</td><td>' + d.a + '</td><td>' + d.ch + '</td><td>' + d.w + '</td></tr>'
    ).join('')}</tbody>
</table>
<button class="edit-btn stats-csv" id="csv-dept" type="button">Скачать CSV</button>
</section>

<section class="stats-block">
<h2 class="sub-title">Люди</h2>
<div class="stats-row">
<div class="stats-chart"><canvas id="ch-people-role"></canvas></div>
<div class="stats-chart"><canvas id="ch-people-deg"></canvas></div>
</div>
<h3 class="stats-h3">Топ-10 рецензентов (всего)</h3>
<table class="admin-table stats-table" id="tbl-rev">
<thead><tr><th>Рецензент</th><th>Рецензий</th></tr></thead>
<tbody>${topReviewers.map((r) => '<tr><td>' + esc(r.name) + '</td><td>' + r.n + '</td></tr>').join('')}</tbody>
</table>
<button class="edit-btn stats-csv" id="csv-rev" type="button">Скачать CSV</button>

<h3 class="stats-h3">Топ-10 авторов по числу публикаций</h3>
<table class="admin-table stats-table" id="tbl-ppl-auth">
<thead><tr><th>Автор</th><th>Публикаций</th></tr></thead>
<tbody>${topPubAuthors.map((a) => '<tr><td>' + esc(a.name) + '</td><td>' + a.n + '</td></tr>').join('')}</tbody>
</table>
<button class="edit-btn stats-csv" id="csv-ppl-auth" type="button">Скачать CSV</button>
</section>

<section class="stats-block">
<h2 class="sub-title">Активность и процессы</h2>
<div class="stats-kpi">
<div class="stat-tile"><b>${avgCheckDays}</b><span>среднее время проверки (дней)</span></div>
<div class="stat-tile"><b>${checkReqs.length}</b><span>завершённых проверок</span></div>
</div>
<div class="stats-row">
<div class="stats-chart"><canvas id="ch-activity-reg"></canvas></div>
</div>
<h3 class="stats-h3">Распределение запросов по типам</h3>
<table class="admin-table stats-table" id="tbl-req">
<thead><tr><th>Тип</th><th>Количество</th></tr></thead>
<tbody>${Object.entries(reqByType).map(([k, n]) =>
        '<tr><td>' + esc(REQ_TYPES[k].label) + '</td><td>' + n + '</td></tr>'
    ).join('')}</tbody>
</table>
<button class="edit-btn stats-csv" id="csv-req" type="button">Скачать CSV</button>

<h3 class="stats-h3">Самые активные рецензенты (последние 30 дней)</h3>
<table class="admin-table stats-table" id="tbl-rev-recent">
<thead><tr><th>Рецензент</th><th>Рецензий</th></tr></thead>
<tbody>${topRecentReviewers.length
        ? topRecentReviewers.map((r) => '<tr><td>' + esc(r.name) + '</td><td>' + r.n + '</td></tr>').join('')
        : '<tr><td colspan="2">Нет активности за последний месяц.</td></tr>'}</tbody>
</table>
<button class="edit-btn stats-csv" id="csv-rev-recent" type="button">Скачать CSV</button>
</section>
`;

    const p = palette();

    makeChart($('#ch-pub-status'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(STATUS).map((k) => STATUS[k].label),
            datasets: [{
                data: Object.keys(STATUS).map((k) => byStatus[k]),
                backgroundColor: [p.bch, p.bk, p.ba, p.bd],
                borderColor: p.bg2, borderWidth: 2
            }]
        }
    });

    makeChart($('#ch-pub-year'), {
        type: 'bar',
        data: {
            labels: years,
            datasets: [{ label: 'Публикаций', data: years.map((y) => byYear[y]), backgroundColor: p.accent }]
        },
        options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    makeChart($('#ch-dept-people'), {
        type: 'bar',
        data: {
            labels: deptsByPeople.map((d) => d.t.replace('Кафедра ', '')),
            datasets: [{ label: 'Человек', data: deptsByPeople.map((d) => d.ch), backgroundColor: p.bk }]
        },
        options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const facLabels = Object.keys(deptsByFac);
    const facColors = ['#C05A2E', '#3E6C8E', '#7D8F4C', '#A98153', '#7A9480', '#6B2D5C', '#8465A9', '#2E7F8F'];
    makeChart($('#ch-dept-fac'), {
        type: 'doughnut',
        data: {
            labels: facLabels,
            datasets: [{
                data: facLabels.map((f) => deptsByFac[f]),
                backgroundColor: facLabels.map((_, i) => facColors[i % facColors.length]),
                borderColor: p.bg2, borderWidth: 2
            }]
        }
    });

    const roleLabels = Object.keys(ROLES).map((k) => ROLES[k].label);
    const roleColors = [p.bk, p.bd, p.ba, '#3E6C8E', '#6B2D5C'];
    makeChart($('#ch-people-role'), {
        type: 'doughnut',
        data: {
            labels: roleLabels,
            datasets: [{
                data: Object.keys(ROLES).map((k) => byRole[k]),
                backgroundColor: roleColors,
                borderColor: p.bg2, borderWidth: 2
            }]
        }
    });

    makeChart($('#ch-people-deg'), {
        type: 'doughnut',
        data: {
            labels: ['Доктор наук', 'Кандидат наук', 'Аспирант', 'Без степени'],
            datasets: [{
                data: [byDeg.d, byDeg.k, byDeg.a, byDeg.none],
                backgroundColor: [p.bd, p.bk, p.ba, p.bch],
                borderColor: p.bg2, borderWidth: 2
            }]
        }
    });

    makeChart($('#ch-activity-reg'), {
        type: 'line',
        data: {
            labels: regMonths,
            datasets: [{
                label: 'Новых пользователей',
                data: regMonths.map((m) => regByMonth[m]),
                borderColor: p.accent,
                backgroundColor: p.accent + '33',
                fill: true, tension: 0.3
            }]
        },
        options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    bindCSV('csv-pub-dept', 'top-cafedry-po-publicham.csv',
        () => [['Кафедра', 'Публикаций']].concat(topDeptsByPubs.map((d) => [d.t, d.w])));
    bindCSV('csv-pub-auth', 'top-avtory-po-publicham.csv',
        () => [['Автор', 'Публикаций']].concat(topAuthors.map(([a, n]) => [a, n])));
    bindCSV('csv-dept', 'sostav-kafeDr.csv',
        () => [['Кафедра', 'Направление', 'Д', 'К', 'А', 'Ч', 'Публикаций']]
            .concat(deptTableRows.map((d) => [d.t, d.f, d.d, d.k, d.a, d.ch, d.w])));
    bindCSV('csv-rev', 'top-recenzenty.csv',
        () => [['Рецензент', 'Рецензий']].concat(topReviewers.map((r) => [r.name, r.n])));
    bindCSV('csv-ppl-auth', 'top-avtory-ludi.csv',
        () => [['Автор', 'Публикаций']].concat(topPubAuthors.map((a) => [a.name, a.n])));
    bindCSV('csv-req', 'zaprosy-po-tipam.csv',
        () => [['Тип', 'Количество']].concat(Object.entries(reqByType).map(([k, n]) => [REQ_TYPES[k].label, n])));
    bindCSV('csv-rev-recent', 'top-recenzenty-30dnei.csv',
        () => [['Рецензент', 'Рецензий']].concat(topRecentReviewers.map((r) => [r.name, r.n])));
}

// ---------- ФАЙЛЫ ИЗ ОБЛАКА ----------
document.addEventListener('click', (e) => {
    const a = e.target.closest('a.remote-file'); if (!a) return;
    e.preventDefault(); const key = a.getAttribute('data-filekey'); const old = a.textContent; a.textContent = 'Загрузка…';
    CloudFiles.download(key).then((f) => {
        if (!f || !f.fileData) { alert('Файл не найден.'); a.textContent = old; return; }
        const link = document.createElement('a'); link.href = f.fileData; link.download = f.fileName || a.getAttribute('data-filename') || 'file.pdf';
        document.body.appendChild(link); link.click(); link.remove(); a.textContent = old;
    });
});

// ============================================================
// ЧАТЫ
// ============================================================
function initChats() {
    if (USER.guest) { location.href = 'login.html'; return; }
    const wrap = $('#chatsWrap'); let current = null;
    const partners = () => {
        const ids = new Set();
        LocalMessages.list().forEach((m) => { if (m.from === USER.id) ids.add(m.to); if (m.to === USER.id) ids.add(m.from); });
        return Array.from(ids).map((id) => (Store.people || []).find((p) => p.id === id)).filter(Boolean)
            .map((p) => { const th = LocalMessages.between(USER.id, p.id); return { p: p, last: th[th.length - 1] }; })
            .sort((a, b) => ((b.last && b.last._ts) || 0) - ((a.last && a.last._ts) || 0));
    };
    function renderList() {
        const list = partners();
        $('#chatsList').innerHTML = list.map((it) => {
            let un = 0; try { un = Notifications.chatUnreadFrom(it.p.id); } catch (e) {}
            return '<div class="chat-item' + (it.p.id === current ? ' on' : '') + '" data-chat="' + it.p.id + '"><b>' + esc(it.p.name) + '</b><small>' + (it.last ? esc(it.last.text) : 'нет сообщений') + '</small>' + (un > 0 ? '<span class="dd-badge">' + (un > 99 ? '99+' : un) + '</span>' : '') + '</div>';
        }
        ).join('') || '<div class="empty">Чатов пока нет.</div>';
        $('#chatsList').querySelectorAll('[data-chat]').forEach((el) => { el.addEventListener('click', () => openChat(+el.dataset.chat)); });
    }
    function renderThread() {
        if (current == null) return;
        const p = personById(current);
        $('#chatName').textContent = p ? p.name : '';
        $('#chatThread').innerHTML = LocalMessages.between(USER.id, current).map((m) =>
            '<div class="msg' + (m.from === USER.id ? ' me' : '') + '"><small>' + esc(m.fromName) + ' · ' + new Date(m._ts).toLocaleDateString('ru-RU') + (m._edited ? ' · изменено' : '') + '</small>' +
            '<span class="msg-text">' + esc(m.text) + '</span>' +
            (m.from === USER.id ? '<button type="button" class="msg-edit-btn" data-ed="' + m.id + '" title="Редактировать" aria-label="Редактировать сообщение">' +
                '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.2-4L16 5.2 18.8 8 8 18.8 4 20z"/><path d="m14 7 3 3"/></svg>' +
                '</button>' : '') +
            '</div>'
        ).join('') || '<div class="empty">Напишите первым.</div>';
    }
    /* инлайн-редактирование: клик по карандашу на краю сообщения */
    $('#chatThread').addEventListener('click', (e) => {
        const ed = e.target.closest('[data-ed]');
        if (!ed) return;
        const msgEl = ed.closest('.msg');
        const textEl = msgEl && msgEl.querySelector('.msg-text');
        const m = LocalMessages.list().find((x) => x.id === +ed.dataset.ed);
        if (!m || !textEl || msgEl.querySelector('textarea')) return;
        const ta = document.createElement('textarea');
        ta.className = 'msg-edit-area';
        ta.value = m.text;
        ta.rows = Math.min(6, Math.max(2, m.text.split('\n').length));
        const actions = document.createElement('div');
        actions.className = 'msg-edit-actions';
        actions.innerHTML = '<button type="button" class="msg-edit-save">Сохранить</button>' +
            '<button type="button" class="msg-edit-cancel">Отмена</button>' +
            '<span class="msg-edit-hint">Enter — сохранить · Esc — отмена</span>';
        textEl.replaceWith(ta, actions);
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        let done = false;
        const finish = (save) => {
            if (done) return; done = true;
            const v = ta.value.trim();
            if (save && v && v !== m.text) {
                LocalMessages.update(m.id, { text: v, _edited: true });
                renderThread(); renderList();
            } else {
                renderThread();
            }
        };
        actions.querySelector('.msg-edit-save').addEventListener('click', () => finish(true));
        actions.querySelector('.msg-edit-cancel').addEventListener('click', () => finish(false));
        ta.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
            if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
        });
    });
    function openChat(pid) { current = pid; $('#noChat').hidden = true; $('#chatView').hidden = false; wrap.classList.add('chat-open'); renderList(); renderThread(); try { Notifications.markChatSeen(pid); } catch (e) {} if (window.OU_badges) window.OU_badges.refresh(); }
    bindAutocomplete($('#newChatInput'), $('#newChatDrop'), (Store.people || []).filter((x) => x.id !== USER.id), () => false,
        (short) => { const p = personByShort(short); if (p) openChat(p.id); });
    $('#chatBack').addEventListener('click', () => { wrap.classList.remove('chat-open'); current = null; $('#chatView').hidden = true; $('#noChat').hidden = false; renderList(); });
    $('#chatForm').addEventListener('submit', (e) => {
        e.preventDefault(); if (current == null) return;
        const text = $('#chatText').value.trim(); if (!text) return;
        LocalMessages.add({ id: Date.now(), from: USER.id, fromName: USER.name, to: current, text: text });
        $('#chatText').value = ''; renderThread(); renderList();
    });
    renderList();
    const pre = +params.get('id'); if (pre && personById(pre)) openChat(pre);
}

// ============================================================
// КАФЕДРЫ (реестр)
// ============================================================
const FAC_COLOR = {
    'Математика': '#C05A2E', 'Информатика': '#3E6C8E', 'Физика': '#7D8F4C',
    'Химия': '#A98153', 'Гуманитарные науки': '#7A9480', 'Экономика': '#6B2D5C',
    'Психология': '#8465A9', 'Языки': '#2E7F8F'
};
function initKafedry() {
    const pre = params.get('fac');
    const state = { fac: FAC.includes(pre) ? pre : 'Все' };
    const FAC_COLOR = {
        'Математика': '#C41E3A', 'Информатика': '#1D3557', 'Физика': '#2D6A4F',
        'Химия': '#9C6644', 'Гуманитарные науки': '#6B2D8B', 'Экономика': '#457B9D',
        'Психология': '#E76F51', 'Языки': '#264653'
    };

function cardHTML(c) {
  const s = deptStats(c.n);
  const val = (v) => (v == null ? '—' : v);
  return `
  <a class="card card-link" style="--stripe:${FAC_COLOR[c.f] || 'var(--line-2)'}" href="dept.html?id=${c.n}" title="${esc(c.x || '')}">
    <div class="card-emoji" aria-hidden="true">
      ${c.photo ? '<img class="dept-photo avatar-svg" src="' + esc(c.photo) + '" alt="">' : ((window.OU_icons && OU_icons.deptIconHTML) ? OU_icons.deptIconHTML(c) : '')}
    </div>
    <div class="card-bottom">
      <span class="fac">${esc(c.f)}</span>
      <h3 class="card-title">${esc(c.t)}</h3>
      <div class="card-stats">
        <span class="stat"><span class="b b-d">Д</span>${val(s.d)}</span>
        <span class="stat"><span class="b b-k">К</span>${val(s.k)}</span>
        <span class="stat"><span class="b b-a">А</span>${val(s.a)}</span>
        <span class="stat"><span class="b b-ch">Ч</span>${val(s.ch)}</span>
      </div>
    </div>
  </a>`;
}

    function render() {
        let list = Store.depts.filter((c) => state.fac === 'Все' || c.f === state.fac);
        list.sort((a, b) => a.n - b.n);
        $('#cards').innerHTML = list.map(cardHTML).join('');
        stagger($('#cards').querySelectorAll('.card'));
        $('#count').textContent = list.length + ' ' + plural(list.length, ['кафедра', 'кафедры', 'кафедр']);
        $('#empty').hidden = list.length !== 0;
    }
    buildFilters([{ key: 'Все', label: 'Все' }].concat(FAC.map((f) => ({ key: f, label: f }))), state.fac, (k) => { state.fac = k; render(); });
    render();
}

// ---------- СТАРТ ----------
const INIT = {
    home: initHome, people: initPeople, person: initProfile, me: initProfile,
    dept: initDept, deptpage: initDeptPage, pubs: initPubs, allpubs: initAllPubs,
    pub: initPub, pubnew: initPubEdit, requests: initRequests, newreq: initNewRequest,
    auth: initAuth, admin: initAdmin, chats: initChats, kafedry: initKafedry, complaint: initComplaint
};
const page = document.body.dataset.page || 'home';
const loadBox = $('#cards') || $('#staff');
if (loadBox) loadBox.innerHTML = '<div class="loading">Загрузка…</div>';
Store.loadAll()
    .then(() => {
        DEPTS = Store.depts.filter((d) => !d.tpl);
        DEPT_BY_N = Object.fromEntries(DEPTS.map((d) => [d.n, d]));
        initSearch();
        INIT[page]();
        if (window.OU_theme) window.OU_theme.refresh();
        /* централизованный пересчёт бейджей по РЕАЛЬНЫМ загруженным данным */
        if (window.OU_badges) window.OU_badges.refresh();
    })
    .catch((err) => {
        console.error(err);
        if (loadBox) loadBox.innerHTML = '';
        const pd = $('#pubDetail') || $('#profile') || $('#deptHead');
        if (pd) pd.innerHTML = '<div class="empty">Не удалось загрузить данные.</div>';
    });
})();