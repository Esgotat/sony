const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  for (const [w,name] of [[1280,'d1280'],[768,'d768'],[375,'d375']]) {
    const page = await browser.newPage();
    await page.setViewport({width:w, height:900});
    await page.goto('http://localhost:8099/publications.html', {waitUntil:'networkidle0'});
    await new Promise(r=>setTimeout(r,700));
    const res = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.pub-card').forEach(c => {
        c.querySelectorAll('*').forEach(el => {
          if (el.classList.contains('pub-book')) return;
          const cs = getComputedStyle(el);
          if (cs.position === 'absolute' || cs.position === 'fixed') return;
          const r = el.getBoundingClientRect();
          const cb = c.getBoundingClientRect();
          const over = r.bottom - cb.bottom, right = r.right - cb.right;
          if (over > 1 || right > 1) out.push({cls: el.className.toString().slice(0,40), tag: el.tagName, overBottom:+over.toFixed(1), overRight:+right.toFixed(1)});
        });
      });
      return out.slice(0,10);
    });
    console.log(name, JSON.stringify(res));
    await page.close();
  }
  // admin page
  const page = await browser.newPage();
  await page.setViewport({width:1280, height:900});
  await page.goto('http://localhost:8099/admin.html', {waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,700));
  const res = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.pub-card').forEach(c => {
      const cb = c.getBoundingClientRect();
      c.querySelectorAll('.pub-pages,.pub-cover,.pub-book').forEach(el => {
        const r = el.getBoundingClientRect();
        out.push({cls: el.className, overBottom:+(r.bottom-cb.bottom).toFixed(1), overRight:+(r.right-cb.right).toFixed(1), cardH:+cb.height.toFixed(1)});
      });
    });
    return out.slice(0,6);
  });
  console.log('admin', JSON.stringify(res));
  await browser.close();
})();
