const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  for (const [name, url] of [['profile','profile.html?id=1'], ['dept','dept.html?dept=1'], ['moi','moi-publikacii.html'], ['pub-detail','publication.html?id=1']]) {
    const page = await browser.newPage();
    await page.setViewport({width:1280, height:900});
    await page.goto('http://localhost:8099/'+url, {waitUntil:'networkidle0'});
    await new Promise(r=>setTimeout(r,700));
    const res = await page.evaluate(() => {
      return [...document.querySelectorAll('.pub-card')].map(c => {
        const cb = c.getBoundingClientRect();
        const pg = c.querySelector('.pub-pages');
        if (!pg) return null;
        const pr = pg.getBoundingClientRect();
        return {cardRight:+cb.right.toFixed(1), pagesRight:+pr.right.toFixed(1), over:+(pr.right-cb.right).toFixed(1)};
      }).filter(Boolean);
    });
    console.log(name, JSON.stringify(res.slice(0,6)));
    const cards = await page.$$('.pub-card');
    if (cards[0]) await cards[0].screenshot({path:'/tmp/'+name+'-card.png'});
    await page.screenshot({path:'/tmp/'+name+'.png', fullPage:false});
    await page.close();
  }
  await browser.close();
})();
