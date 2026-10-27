const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width:1280, height:900});
  await page.goto('http://localhost:8099/publications.html', {waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,700));
  const c = await page.$('.pub-card');
  await c.screenshot({path:'/tmp/closed.png'});
  await c.hover();
  await new Promise(r=>setTimeout(r,600));
  await c.screenshot({path:'/tmp/hover.png'});
  await browser.close();
})();
