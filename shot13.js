const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});

  // ===== PHONE, logged-in owner =====
  let page = await browser.newPage();
  await page.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  await page.goto('http://localhost:8099/login.html',{waitUntil:'networkidle0'});
  await page.evaluate(()=>{
    const id = 555;
    LocalUsers.add({id, name:'Тест Тестерович Тестов', short:'Тест Т.Т.', email:'t@t.ru', pass:'x', dept:null, deg:null, roles:['res'], note:'Тест', years:3, balance:5, interests:[], experience:''});
    Session.set(id);
  });
  await page.goto('http://localhost:8099/profile.html?id=555',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,900));
  const phone = await page.evaluate(()=>({
    guest: USER.guest,
    logoutTop: !!document.getElementById('logoutBtn'),
    logoutBottom: !!document.getElementById('logoutBtnBottom'),
    bottomIsLast: (()=>{const b=document.getElementById('logoutBtnBottom'); if(!b) return false; const main=document.querySelector('main.content'); return !!(main && main.contains(b));})()
  }));
  // tap logout bottom works?
  const beforeUrl = page.url();
  await page.evaluate(()=>{ document.getElementById('logoutBtnBottom').click(); });
  await new Promise(r=>setTimeout(r,700));
  const afterLogout = await page.evaluate(()=>({url: location.href, session: localStorage.getItem('ou_session')}));
  console.log('PHONE:', JSON.stringify({phone, afterLogout}));
  await page.close();

  // ===== DESKTOP, logged-in owner: logout stays in header =====
  page = await browser.newPage();
  await page.setViewport({width:1280,height:800});
  await page.goto('http://localhost:8099/login.html',{waitUntil:'networkidle0'});
  await page.evaluate(()=>{
    const id = 556;
    LocalUsers.add({id, name:'Десктоп Пользователь', short:'Десктоп П.', email:'d@d.ru', pass:'x', dept:null, deg:null, roles:['res'], note:'', years:1, balance:5, interests:[], experience:''});
    Session.set(id);
  });
  await page.goto('http://localhost:8099/profile.html?id=556',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,700));
  const desk = await page.evaluate(()=>({
    logoutTop: !!document.getElementById('logoutBtn'),
    logoutBottom: !!document.getElementById('logoutBtnBottom')
  }));
  console.log('DESKTOP:', JSON.stringify(desk));

  // desktop subnav: hover opens list
  const ddBox = await page.evaluate(()=>{ const b=document.querySelectorAll('#subnav .dd-btn')[0].getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; });
  await page.mouse.move(ddBox.x, ddBox.y);
  await new Promise(r=>setTimeout(r,250));
  const hov = await page.evaluate(()=>getComputedStyle(document.querySelectorAll('#subnav .dd')[0].querySelector('.dd-menu')).display);
  // desktop click navigates to kafedry
  await page.mouse.click(ddBox.x, ddBox.y);
  await new Promise(r=>setTimeout(r,700));
  const navUrl = await page.evaluate(()=>location.href);
  console.log('DESKTOP SUBNAV:', JSON.stringify({hov, navUrl}));
  await browser.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
