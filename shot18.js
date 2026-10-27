const puppeteer = require('puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv = http.createServer((req,res)=>{
  let f = path.join('/workspace', req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r=>srv.listen(8137,r));
  const b = await puppeteer.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
  const p = await b.newPage();
  await p.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://localhost:8137/index.html',{waitUntil:'networkidle2'});
  await p.evaluate(()=>{ localStorage.setItem('ou_session','1'); });

  await p.goto('http://localhost:8137/profile.html?id=1',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,600));
  const r1 = await p.evaluate(()=>({
    eobHidden: document.querySelector('#editOnlyBtns')?.hidden ?? 'none',
    hasLogoutBottom: !!document.querySelector('#logoutBtnBottom'),
    qlinks: [...document.querySelectorAll('.qlink')].map(a=>a.textContent.trim())
  }));
  await p.evaluate(()=>document.querySelector('#editBtn').click());
  const r2 = await p.evaluate(()=>({ eobVisibleAfterEdit: document.querySelector('#editOnlyBtns')?.hidden === false }));

  await p.goto('http://localhost:8137/dept.html?id=1',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,600));
  const r3 = await p.evaluate(()=>{
    const wrap=document.querySelector('.dept-cover-wrap');
    const row=document.querySelector('.dept-stats-row');
    return { lettersInCover: wrap?wrap.querySelectorAll('.b').length:-1,
             rowBelow: !!(row&&wrap&&(row.compareDocumentPosition(wrap)&Node.DOCUMENT_POSITION_PRECEDING)),
             rowLetters: row?row.querySelectorAll('.b').length:-1 };
  });

  await p.goto('http://localhost:8137/chats.html',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,800));
  const r5 = await p.evaluate(async ()=>{
    const btn=document.querySelector('.chat-item,[data-chat],.conv'); if(btn) btn.click();
    await new Promise(r=>setTimeout(r,400));
    const del=document.querySelector('.msg.me .msg-del-btn');
    const ed=document.querySelector('.msg.me .msg-edit-btn');
    let removed=false;
    if(del){ const before=LocalMessages.list().length; window.confirm=()=>true; del.click(); removed = LocalMessages.list().length===before-1; }
    return { chatItems: document.querySelectorAll('.chat-item,[data-chat],.conv').length, hasDel:!!del, hasEd:!!ed, removed };
  });

  await p.goto('http://localhost:8137/admin.html',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,800));
  const r4 = await p.evaluate(async ()=>{
    const t=document.querySelector('.admin-tabs');
    const stats=[...t.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab==='stats');
    stats.click();
    await new Promise(r=>setTimeout(r,400));
    return { tabCount:t.querySelectorAll('[data-tab]').length, statsTabShown: !document.querySelector('#tab-stats').hidden };
  });
  console.log(JSON.stringify({r1,r2,r3,r4,r5,errs}));
  await b.close(); srv.close();
})();
