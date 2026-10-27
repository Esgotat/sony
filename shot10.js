const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const errors = [];
  async function phone(uid) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => localStorage.clear());
    await page.evaluate((u) => localStorage.setItem('ou_session', String(u)), uid);
    return page;
  }
  const out = {};

  // 1. Шапка: пункты в одном уровне, без «Главная», без стрелок
  {
    const p = await phone(1);
    await p.goto('http://localhost:8099/profile.html?id=1', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    out.nav = await p.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.hd-nav > a, .hd-nav > .hd-dd'));
      return {
        labels: items.map(el => el.textContent.trim().replace(/\s+/g,' ').slice(0,25)),
        sameRow: new Set(items.map(el => Math.round(el.getBoundingClientRect().top))).size === 1 || items.length <= 4,
        tops: items.map(el => Math.round(el.getBoundingClientRect().top)),
        hasGlavnaya: document.querySelector('.hd-nav').textContent.includes('Главная'),
        arrowsInSubnav: !!document.querySelector('#subnav .caret, #subnav .arrow, #subnav .dd-btn svg')
      };
    });
    await p.close();
  }

  // 2. Сообщения: редактирование и удаление
  {
    const p = await phone(1);
    await p.goto('http://localhost:8099/chats.html', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 300));
    // отправить сообщение через форму
    const sent = await p.evaluate(async () => {
      // открыть чат с первым доступным собеседником или создать через LocalMessages
      LocalMessages.add({ id: 'tstA', from: 1, to: 2, fromName: 'Я', text: 'тестовое', _ts: Date.now() });
      const el = document.querySelector('[data-chat="2"]');
      if (el) { el.click(); } else { location.href='chats.html?id=2'; return 'reload'; }
      await new Promise(r => setTimeout(r, 300));
      return 'ok';
    });
    if (sent === 'reload') { await p.waitForNavigation({waitUntil:'networkidle0'}).catch(()=>{}); await new Promise(r=>setTimeout(r,400)); }
    else { await p.goto('http://localhost:8099/chats.html?id=2', { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 400)); }
    out.msgActions = await p.evaluate(() => {
      const me = document.querySelector('.msg.me');
      return { found: !!me, hasEdit: !!(me && me.querySelector('.msg-edit-btn')), hasDel: !!(me && me.querySelector('.msg-del-btn')) };
    });
    out.msgEditWorks = await p.evaluate(async () => {
      const btn = document.querySelector('.msg.me .msg-edit-btn');
      if (!btn) return false;
      btn.click();
      await new Promise(r => setTimeout(r, 200));
      const ta = document.querySelector('.msg.me textarea');
      if (!ta) return false;
      ta.value = 'отредактировано';
      document.querySelector('.msg.me .msg-edit-save').click();
      await new Promise(r => setTimeout(r, 200));
      const t = document.querySelector('.msg.me .msg-text');
      return t && t.textContent.includes('отредактировано');
    });
    out.msgDeleteWorks = await p.evaluate(async () => {
      const btn = document.querySelector('.msg.me .msg-del-btn');
      if (!btn) return false;
      const orig = window.confirm; window.confirm = () => true;
      btn.click();
      await new Promise(r => setTimeout(r, 250));
      window.confirm = orig;
      return !document.querySelector('.msg.me');
    });
    await p.close();
  }

  // 3. Профиль: кнопки редактирования появляются только в режиме правки
  {
    const p = await phone(1);
    await p.goto('http://localhost:8099/profile.html?id=1', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    out.editBtns = await p.evaluate(() => {
      const span = document.querySelector('#editOnlyBtns');
      return { exists: !!span, hiddenBefore: !span || span.hidden, hasPhotoBtn: !!document.querySelector('#photoBtn') };
    });
    const editClicked = await p.evaluate(() => {
      const eb = document.querySelector('#editBtn');
      if (!eb) return 'no editBtn';
      eb.click();
      return 'clicked';
    });
    await new Promise(r => setTimeout(r, 300));
    out.editBtns.afterEdit = await p.evaluate(() => {
      const span = document.querySelector('#editOnlyBtns');
      return { shown: !!span && !span.hidden, photo: !!document.querySelector('#photoBtn'), reset: !!document.querySelector('#resetBtn') };
    });
    out.editBtns.editClicked = editClicked;
    await p.close();
  }

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? [...new Set(errors)].join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
