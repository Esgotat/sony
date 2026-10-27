const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  await page.goto('http://localhost:8099/index.html',{waitUntil:'networkidle0'});
  // login as user id=1 (session stores id)
  await page.evaluate(()=>{ localStorage.setItem('ou_session','1'); });
  await page.goto('http://localhost:8099/profile.html?id=1',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  const st = await page.evaluate(()=>({
    isGuest: USER.guest, myId: USER.id,
    hasLogoutTop: !!document.getElementById('logoutBtn'),
    hasLogoutBottom: !!document.getElementById('logoutBtnBottom'),
    qlinks: !!document.getElementById('qlinks')
  }));
  console.log(JSON.stringify(st));
  await browser.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
