const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({args:['--no-sandbox']});
  const p = await b.newPage();
  await p.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file:///workspace/index.html',{waitUntil:'networkidle2'});
  await p.evaluate(()=>{ localStorage.setItem('ou_session','1'); });

  await p.goto('file:///workspace/profile.html?id=1',{waitUntil:'networkidle2'});
  const r1 = await p.evaluate(()=>({
    eobHidden: document.querySelector('#editOnlyBtns')?.hidden,
    hasLogoutBottom: !!document.querySelector('#logoutBtnBottom'),
    qlinks: [...document.querySelectorAll('.qlink')].map(a=>a.textContent.trim())
  }));
  await p.evaluate(()=>document.querySelector('#editBtn').click());
  const r2 = await p.evaluate(()=>({ eobHiddenAfterEdit: document.querySelector('#editOnlyBtns')?.hidden }));

  await p.goto('file:///workspace/dept.html?id=1',{waitUntil:'networkidle2'});
  const r3 = await p.evaluate(()=>{
    const wrap=document.querySelector('.dept-cover-wrap');
    const row=document.querySelector('.dept-stats-row');
    return { lettersInCover: wrap?wrap.querySelectorAll('.b').length:-1,
             rowBelow: !!(row&&wrap&&(row.compareDocumentPosition(wrap)&Node.DOCUMENT_POSITION_PRECEDING)),
             rowLetters: row?row.querySelectorAll('.b').length:-1 };
  });

  // chats: delete/edit buttons on my message
  await p.goto('file:///workspace/chats.html',{waitUntil:'networkidle2'});
  const r5 = await p.evaluate(async ()=>{
    const btn=document.querySelector('.chat-item, [data-chat]'); if(btn) btn.click();
    await new Promise(r=>setTimeout(r,300));
    const del=document.querySelector('.msg.me .msg-del-btn');
    const ed=document.querySelector('.msg.me .msg-edit-btn');
    let removed=false;
    if(del){ const before=LocalMessages.list().length; window.confirm=()=>true; del.click(); removed = LocalMessages.list().length===before-1; }
    return { hasDel:!!del, hasEd:!!ed, removed };
  });

  // admin tabs visible+reachable on phone viewport
  await p.goto('file:///workspace/admin.html',{waitUntil:'networkidle2'});
  const r4 = await p.evaluate(()=>{
    const t=document.querySelector('.admin-tabs');
    const stats=[...t.querySelectorAll('[data-tab]')].find(x=>x.dataset.tab==='stats');
    const rect=stats.getBoundingClientRect();
    stats.click();
    return { tabCount:t.querySelectorAll('[data-tab]').length, statsVisible: rect.width>0, statsTabShown: !document.querySelector('#tab-stats').hidden };
  });
  console.log(JSON.stringify({r1,r2,r3,r4,r5,errs},null,1));
  await b.close();
})();
