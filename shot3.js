const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  for (const [w, name] of [[1920,'w1920'],[1440,'w1440'],[1024,'w1024'],[768,'w768'],[480,'w480'],[375,'w375']]) {
    const page = await browser.newPage();
    await page.setViewport({width:w, height:900});
    await page.goto('http://localhost:8099/publications.html', {waitUntil:'networkidle0'});
    await new Promise(r=>setTimeout(r,600));
    const res = await page.evaluate(() => {
      return [...document.querySelectorAll('.pub-card')].map(c => {
        const cb = c.getBoundingClientRect();
        const pg = c.querySelector('.pub-pages').getBoundingClientRect();
        const cv = c.querySelector('.pub-cover').getBoundingClientRect();
        return {cardW:+cb.width.toFixed(1), overPages:+(pg.right-cb.right).toFixed(1), overCover:+(cv.right-cb.right).toFixed(1)};
      });
    });
    console.log(name, JSON.stringify(res.slice(0,4)));
    if (w===768||w===375) {
      const cards = await page.$$('.pub-card');
      if (cards[0]) await cards[0].screenshot({path:'/tmp/card-'+name+'.png'});
    }
    await page.close();
  }
  await browser.close();
})();
