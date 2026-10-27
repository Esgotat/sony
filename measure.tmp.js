const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width:1280, height:900});
  await page.goto('http://localhost:8099/publications.html', {waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,600));
  const data = await page.evaluate(() => {
    return [...document.querySelectorAll('.pub-card')].slice(0,4).map(c => {
      const cb = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      const book = c.querySelector('.pub-book').getBoundingClientRect();
      const pages = c.querySelector('.pub-pages').getBoundingClientRect();
      const cover = c.querySelector('.pub-cover').getBoundingClientRect();
      const after = getComputedStyle(c.querySelector('.pub-pages'), '::after');
      return {
        card:[+cb.left.toFixed(1), +cb.right.toFixed(1), +cb.width.toFixed(1)],
        pad:cs.padding, ovf:cs.overflow, minh:cs.minHeight,
        book:[+book.left.toFixed(1), +book.right.toFixed(1), +book.width.toFixed(1)],
        pages:[+pages.left.toFixed(1), +pages.right.toFixed(1), +pages.width.toFixed(1)],
        cover:[+cover.left.toFixed(1), +cover.right.toFixed(1), +cover.width.toFixed(1)],
        afterRight: after.right, afterWidth: after.width,
      };
    });
  });
  console.log(JSON.stringify(data, null, 1));
  await page.screenshot({path:'/tmp/pubs.png'});
  await browser.close();
})();
