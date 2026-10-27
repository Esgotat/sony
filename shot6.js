const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  for (const [w,name] of [[1280,'r1280'],[768,'r768'],[375,'r375']]) {
    const page = await browser.newPage();
    await page.setViewport({width:w, height:900});
    await page.goto('http://localhost:8099/publications.html', {waitUntil:'networkidle0'});
    await new Promise(r=>setTimeout(r,700));
    const res = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.pub-card').forEach(c => {
        const cb = c.getBoundingClientRect();
        c.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width===0||r.height===0) return;
          const ovR = +(r.right-cb.right).toFixed(1), ovB = +(r.bottom-cb.bottom).toFixed(1);
          if (ovR > 0.5 || ovB > 0.5) out.push({cls:String(el.className).slice(0,44), ovR, ovB});
        });
      });
      return out.slice(0,12);
    });
    console.log(name, JSON.stringify(res));
    await page.close();
  }
  await browser.close();
})();
