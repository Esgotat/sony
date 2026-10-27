const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  const results = [];
  // --- PHONE ---
  let page = await browser.newPage();
  await page.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  await page.goto('http://localhost:8099/index.html',{waitUntil:'networkidle0'});
  // login as regular user via session storage? Use existing demo login: check store
  await page.evaluate(()=>{ try{ localStorage.clear(); }catch(e){} });
  await page.goto('http://localhost:8099/login.html',{waitUntil:'networkidle0'});
  // find a demo account
  const creds = await page.evaluate(()=>{ const el=document.querySelector('[data-demo-email]'); return el?el.dataset.demoEmail:null; });
  await page.evaluate(()=>{
    const email='anna@example.ru';
    // use LocalUsers/Session directly if present
    if(window.Session&&window.LocalUsers){
      const u=(LocalUsers.list()||[])[0];
      if(u) Session.set(u);
    }
  });
  await page.goto('http://localhost:8099/profile.html?id=1',{waitUntil:'networkidle0'}).catch(()=>{});
  await new Promise(r=>setTimeout(r,800));
  const phoneState = await page.evaluate(()=>{
    const btns=[...document.querySelectorAll('#subnav .dd-btn')].map(b=>b.textContent.trim());
    return {
      url: location.href,
      hasLogoutTop: !!document.getElementById('logoutBtn'),
      hasLogoutBottom: !!document.getElementById('logoutBtnBottom'),
      subnavBtns: btns
    };
  });
  // tap "Публикации" once -> should open menu, not navigate
  await page.evaluate(()=>{ document.querySelectorAll('#subnav .dd-btn')[1].click(); });
  await new Promise(r=>setTimeout(r,300));
  const afterTap1 = await page.evaluate(()=>({url:location.href, open:document.querySelectorAll('#subnav .dd')[1].classList.contains('open')}));
  // tap again -> should navigate
  await page.evaluate(()=>{ document.querySelectorAll('#subnav .dd-btn')[1].click(); });
  await new Promise(r=>setTimeout(r,700));
  const afterTap2 = await page.evaluate(()=>({url:location.href}));
  results.push({phoneState, afterTap1, afterTap2});
  await page.close();

  // --- DESKTOP ---
  page = await browser.newPage();
  await page.setViewport({width:1280,height:800});
  await page.goto('http://localhost:8099/publications.html',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,500));
  // hover opens menu
  const box = await page.evaluate(()=>{ const b=document.querySelectorAll('#subnav .dd-btn')[1].getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; });
  await page.mouse.move(box.x,box.y);
  await new Promise(r=>setTimeout(r,300));
  const hoverOpen = await page.evaluate(()=>{ const m=document.querySelectorAll('#subnav .dd')[1].querySelector('.dd-menu'); return getComputedStyle(m).display; });
  // click navigates
  await page.mouse.click(box.x,box.y);
  await new Promise(r=>setTimeout(r,700));
  const clickedUrl = await page.evaluate(()=>location.href);
  results.push({hoverOpen, clickedUrl});
  console.log(JSON.stringify(results,null,1));
  await browser.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
