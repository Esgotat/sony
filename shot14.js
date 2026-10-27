const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});

  async function login(page, id, name, email){
    await page.goto('http://localhost:8099/login.html',{waitUntil:'networkidle0'});
    await page.evaluate((id,name,email)=>{
      LocalUsers.add({id, name, short:name.split(' ')[0], email, pass:'x', dept:null, deg:null, roles:['res'], note:'', years:1, balance:5, interests:[], experience:''});
      Session.set(id);
    }, id, name, email);
  }

  // PHONE: tap navigates
  let page = await browser.newPage();
  await page.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  await login(page, 701, 'Тап Тестович', 'tap@t.ru');
  await page.goto('http://localhost:8099/index.html',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,600));
  const b = await page.evaluate(()=>{ const el=document.querySelectorAll('#subnav .dd-btn')[1]; const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
  await page.touchscreen.tap(b.x,b.y);           // tap1 -> open menu
  await new Promise(r=>setTimeout(r,300));
  const s1 = await page.evaluate(()=>({url:location.href, open:document.querySelectorAll('#subnav .dd')[1].classList.contains('open')}));
  await page.touchscreen.tap(b.x,b.y);           // tap2 -> navigate
  await new Promise(r=>setTimeout(r,700));
  const s2 = await page.evaluate(()=>location.href);
  console.log('PHONE TAP:', JSON.stringify({s1,s2}));
  await page.close();

  // DESKTOP: hover opens, click navigates
  page = await browser.newPage();
  await page.setViewport({width:1280,height:800});
  await login(page, 702, 'Десктоп Тестов', 'desk@d.ru');
  await page.goto('http://localhost:8099/index.html',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,600));
  const dbox = await page.evaluate(()=>{ const el=document.querySelectorAll('#subnav .dd-btn')[1]; const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
  await page.mouse.move(dbox.x,dbox.y);
  await new Promise(r=>setTimeout(r,250));
  const hov = await page.evaluate(()=>getComputedStyle(document.querySelectorAll('#subnav .dd')[1].querySelector('.dd-menu')).display);
  await page.mouse.click(dbox.x,dbox.y);
  await new Promise(r=>setTimeout(r,700));
  const navUrl = await page.evaluate(()=>location.href);
  console.log('DESKTOP:', JSON.stringify({hov, navUrl}));
  await browser.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
