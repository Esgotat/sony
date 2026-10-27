const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const results = [];
  const errors = [];

  async function newPhone(logged) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle0' });
    if (logged) {
      await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('ou_users') || '[]').find(x => x.id === 1) || {};
        localStorage.setItem('ou_session', String(u.id || 1));
      });
    } else {
      await page.evaluate(() => { localStorage.removeItem('ou_session'); });
    }
    return page;
  }

  // ---- 1. Профиль пользователя на телефоне: аватарка, под ней имя/роли, без текста поверх фото
  {
    const page = await newPhone(true);
    await page.goto('http://localhost:8099/profile.html?id=1', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 500));
    const prof = await page.evaluate(() => {
      const wrap = document.querySelector('.profile-avatar-wrap');
      if (!wrap) return { ok: false, why: 'no .profile-avatar-wrap' };
      const av = wrap.querySelector('svg.avatar-svg, img.avatar-photo, .avatar-big');
      const name = wrap.querySelector('.profile-name');
      const roles = wrap.querySelector('.profile-role-row');
      const cs = av && getComputedStyle(av);
      // текст поверх аватарки? ищем элементы, чей бокс лежит внутри бокса аватарки
      let overlayText = 0;
      if (av) {
        const ab = av.getBoundingClientRect();
        wrap.querySelectorAll('h2,p,.stat').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.top < ab.bottom - 4 && r.bottom > ab.top + 4 && r.left < ab.right - 4 && r.right > ab.left + 4) overlayText++;
        });
      }
      return {
        ok: !!name && !!roles,
        avSize: cs ? cs.width + 'x' + cs.height : null,
        avRadius: cs ? cs.borderRadius : null,
        nameBelow: name && av ? name.getBoundingClientRect().top >= av.getBoundingClientRect().bottom - 2 : null,
        rolesBelow: roles && av ? roles.getBoundingClientRect().top >= av.getBoundingClientRect().bottom - 2 : null,
        overlayText
      };
    });
    results.push(['profile avatar', JSON.stringify(prof)]);
    await page.screenshot({ path: '/tmp/m_profile.png', fullPage: false });
    await page.close();
  }

  // ---- 2. Шапка: нет «Главная», «Моя кафедра»/«Мои знакомые» в Кабинете, стрелок ▾ нет
  {
    const page = await newPhone(true);
    await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    const nav = await page.evaluate(() => {
      const txt = (s) => [...document.querySelectorAll(s)].map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40));
      const cabBtn = document.getElementById('cabBtn');
      return {
        mainLinks: txt('.hd-nav > a'),
        hasHome: /Главная/.test(document.querySelector('.hd-nav') ? document.querySelector('.hd-nav').textContent : ''),
        subnavBtns: txt('#subnav .dd-btn'),
        carets: document.querySelectorAll('.caret').length,
        caretGlyphs: document.body.innerHTML.includes('▾'),
        cabOpenBefore: document.querySelector('.hd-dd') ? document.querySelector('.hd-dd').classList.contains('open') : null,
      };
    });
    results.push(['header nav', JSON.stringify(nav)]);
    // тап по «Кабинет» — только открывает меню
    if (await page.$('#cabBtn')) await page.click('#cabBtn');
    await new Promise(r => setTimeout(r, 300));
    const cab = await page.evaluate(() => {
      const w = document.querySelector('.hd-dd');
      const items = [...document.querySelectorAll('.hd-dd-menu a')].map(a => a.textContent.trim().replace(/\s+/g, ' ').slice(0, 30));
      const visible = w.classList.contains('open') && getComputedStyle(w.querySelector('.hd-dd-menu')).display !== 'none';
      return { open: w.classList.contains('open'), visible, url: location.pathname, items };
    });
    results.push(['cabinet tap', JSON.stringify(cab)]);
    // тап по «Кафедры» в subnav — только открывает
    await page.click('#subnav .dd:nth-child(1) .dd-btn');
    await new Promise(r => setTimeout(r, 300));
    const dd = await page.evaluate(() => {
      const w = document.querySelector('#subnav .dd');
      return { open: w.classList.contains('open'), menuVisible: getComputedStyle(w.querySelector('.dd-menu')).display !== 'none', url: location.pathname };
    });
    results.push(['subnav tap', JSON.stringify(dd)]);
    await page.screenshot({ path: '/tmp/m_header.png' });
    await page.close();
  }

  // ---- 3. Регистрация: галочки ролей на своих местах (чекбокс слева от текста)
  {
    const page = await newPhone(false);
    await page.goto('http://localhost:8099/login.html?mode=reg', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    const chk = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('#rRoles label')];
      return labels.slice(0, 3).map(lb => {
        const inp = lb.querySelector('input[type=checkbox]');
        const ir = inp.getBoundingClientRect();
        const lr = lb.getBoundingClientRect();
        const cs = getComputedStyle(inp);
        // текстовый узел
        const textLeft = lr.left + parseFloat(getComputedStyle(lb).paddingLeft);
        return {
          appears: cs.display !== 'none' && ir.width > 6,
          leftOfText: ir.left >= lr.left - 1 && ir.left <= lr.left + 40,
          verticallyCentered: Math.abs((ir.top + ir.height / 2) - (lr.top + lr.height / 2)) < 6,
          w: ir.width
        };
      });
    });
    results.push(['role checkboxes', JSON.stringify(chk)]);
    await page.screenshot({ path: '/tmp/m_reg.png' });
    await page.close();
  }

  console.log(JSON.stringify(results, null, 1));
  console.log('JS ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
