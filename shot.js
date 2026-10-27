const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width:1280, height:900, deviceScaleFactor:1});
  await page.goto('http://localhost:8099/publications.html', {waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,700));
  const card = await page.$('.pub-card');
  await card.screenshot({path:'/tmp/card1.png'});
  // hover state
  await card.hover();
  await new Promise(r=>setTimeout(r,500));
  await card.screenshot({path:'/tmp/card1-hover.png'});
  await browser.close();
})();
