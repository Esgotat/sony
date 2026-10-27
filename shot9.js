const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const errors = [];
  async function phone(logged, id) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + page.url() + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate((uid) => {
      if (uid == null) localStorage.removeItem('ou_session');
      else localStorage.setItem('ou_session', String(uid));
    }, logged ? id : null);
    return page;
  }
  const out = {};

  // 1. Шапка на телефоне: Моя страница | Моя кафедра | Кабинет | Админ-панель в одном уровне
  {
    const p = await phone(true, 1);
    await p.goto('http://localhost:8099/profile.html?id=1', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    out.nav = await p.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.hd-nav > a, .hd-nav > .hd-dd'));
      return {
        labels: items.map(el => el.textContent.trim().replace(/\s+/g,' ').slice(0,20)),
        tops: items.map(el => Math.round(el.getBoundingClientRect().top)),
        hasGlavnaya: document.querySelector('.hd-nav').textContent.includes('Главная'),
        arrowsInSubnav: !!document.querySelector('#subnav .caret, #subnav .arrow')
      };
    });
    await p.close();
  }

  // 2. ДКАЧ под обложкой кафедры, цветные залитые плашки с белой буквой
  {
    const p = await phone(true, 1);
    await p.goto('http://localhost:8099/dept.html?id=1', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    out.deptLetters = await p.evaluate(() => {
      const row = document.querySelector('.dept-stats-row');
      const cover = document.querySelector('.dept-cover-wrap');
      if (!row || !cover) return { ok:false, why:'missing' };
      const rb = row.getBoundingClientRect(), cb = cover.getBoundingClientRect();
      const bs = Array.from(row.querySelectorAll('.b')).map(b => {
        const cs = getComputedStyle(b);
        return { t: b.textContent, bg: cs.backgroundColor, color: cs.color };
      });
      const inCover = !!cover.querySelector('.b');
      return { ok:true, belowCover: rb.top >= cb.bottom - 1, lettersInCover: inCover, bs };
    });
    await p.close();
  }

  // 3. Меню тем привязано к кнопке 🎨 (не к низу экрана)
  {
    const p = await phone(true, 1);
    await p.goto('http://localhost:8099/profile.html?id=1', { waitUntil: 'networkidle0' });
    await p.click('#themeBtn');
    await new Promise(r => setTimeout(r, 300));
    out.themeMenu = await p.evaluate(() => {
      const m = document.querySelector('.theme-menu');
      const btn = document.querySelector('#themeBtn');
      if (!m || m.hidden) return { ok:false, why:'menu hidden' };
      const mb = m.getBoundingClientRect(), bb = btn.getBoundingClientRect();
      return { ok:true, nearBtn: Math.abs(mb.top - bb.bottom) < 40, bottomGap: Math.round(window.innerHeight - mb.bottom), pos: getComputedStyle(m).position };
    });
    await p.close();
  }

  // 4. Чекбоксы ролей при регистрации — галочка перед подписью
  {
    const p = await phone(false, null);
    await p.goto('http://localhost:8099/login.html?mode=reg', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 300));
    out.checkboxes = await p.evaluate(() => {
      const lab = document.querySelector('#rRoles label');
      const inp = lab && lab.querySelector('input[type=checkbox]');
      if (!inp) return { ok:false, why:'no checkbox' };
      const lr = lab.getBoundingClientRect(), ir = inp.getBoundingClientRect();
      return { ok:true, beforeText: ir.left <= lr.left + 16, aligned: Math.abs((ir.top + ir.height/2) - (lr.top + lr.height/2)) < 6 };
    });
    await p.close();
  }

  // 5. Сообщения: кнопки редактирования и удаления есть у своих сообщений
  {
    const p = await phone(true, 1);
    // создадим своё сообщение через LocalMessages напрямую
    await p.evaluate(() => {
      localStorage.setItem('ou_messages', JSON.stringify([{ id:'tst1', from:1, to:2, text:'привет', _ts: Date.now() }]));
    });
    await p.goto('http://localhost:8099/chats.html?id=2', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 500));
    out.msgActions = await p.evaluate(() => {
      const me = document.querySelector('.msg.me');
      return { hasEdit: !!(me && me.querySelector('.msg-edit-btn')), hasDel: !!(me && me.querySelector('.msg-del-btn')) };
    });
    // клик по удалению
    const delOk = await p.evaluate(async () => {
      const btn = document.querySelector('.msg.me .msg-del-btn');
      if (!btn) return false;
      const orig = window.confirm; window.confirm = () => true;
      btn.click();
      await new Promise(r => setTimeout(r, 200));
      window.confirm = orig;
      return !document.querySelector('.msg.me');
    });
    out.msgDeleteWorks = delOk;
    await p.close();
  }

  // 6. Админка: вкладки Жалобы и Статистика кликабельны и переключаются
  {
    const p = await phone(true, 99999);
    await p.goto('http://localhost:8099/admin.html', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    out.adminTabs = await p.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('#adminTabs .fbtn'));
      return { count: tabs.length, labels: tabs.map(t => t.textContent.trim()), scrollable: (() => { const c = document.querySelector('.admin-tabs'); return c.scrollWidth > c.clientWidth; })() };
    });
    const statsOk = await p.evaluate(async () => {
      const b = document.querySelector('#adminTabs [data-tab="stats"]');
      b.click();
      await new Promise(r => setTimeout(r, 300));
      return !document.querySelector('#tab-stats').hidden && document.querySelector('#tab-users').hidden;
    });
    out.adminStatsSwitch = statsOk;
    const cmpOk = await p.evaluate(async () => {
      const b = document.querySelector('#adminTabs [data-tab="complaints"]');
      b.click();
      await new Promise(r => setTimeout(r, 300));
      return !document.querySelector('#tab-complaints').hidden;
    });
    out.adminComplaintsSwitch = cmpOk;
    await p.close();
  }

  // 7. Кнопки "Фото профиля"/"Сбросить правки" скрыты до начала редактирования
  {
    const p = await phone(true, 1);
    await p.goto('http://localhost:8099/profile.html?id=1', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    out.editBtns = await p.evaluate(() => {
      const span = document.querySelector('#editOnlyBtns');
      const hiddenBefore = !span || span.hidden;
      const eb = document.querySelector('#editBtn');
      if (eb) eb.click();
      return { hiddenBefore };
    });
    await new Promise(r => setTimeout(r, 300));
    out.editBtns.shownAfterEdit = await p.evaluate(() => {
      const span = document.querySelector('#editOnlyBtns');
      return !!span && !span.hidden && !!document.querySelector('#photoBtn') && !!document.querySelector('#resetBtn');
    });
    await p.close();
  }

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
