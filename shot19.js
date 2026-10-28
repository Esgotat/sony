const puppeteer = require('puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.docx':'application/octet-stream'};
const srv = http.createServer((req,res)=>{
  let f = path.join('/workspace', req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r=>srv.listen(8139,r));
  const b = await puppeteer.launch({executablePath:'/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args:['--no-sandbox','--disable-dev-shm-usage']});
  const p = await b.newPage();
  await p.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  const docxB64 = fs.readFileSync('/workspace/test_docx_b64.txt','utf8');

  // login session — register a real user with 'res' role via the auth form
  await p.goto('http://localhost:8139/login.html?mode=reg',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>{
    document.querySelector('#rName').value='Тестов Тестович Тестов';
    document.querySelector('#rEmail').value='test@ou.ru';
    document.querySelector('#rPass').value='testpass1';
    document.querySelector('#regForm').requestSubmit();
  });
  await p.waitForNavigation({waitUntil:'networkidle2'}).catch(()=>{});
  await new Promise(r=>setTimeout(r,600));
  const sess = await p.evaluate(()=>localStorage.getItem('ou_session'));
  console.log('session id after reg:', sess);

  // module loaded?
  const hasEx = await p.evaluate(()=>!!(window.OU_extract && OU_extract.workPdfDataUrl && OU_extract.filterPubsByQuery && OU_extract.makeFirstPage));
  console.log('OU_extract loaded:', hasEx);

  // --- create publication with a .docx file via the form ---
  await p.goto('http://localhost:8139/new-publication.html',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,500));
  await p.evaluate((b64)=>{
    document.querySelector('#fTitle').value = 'Тестовая работа про квантовую статистику';
    document.querySelector('#fAbstract').value = 'Аннотация для теста.';
    // simulate file selection
    const dt = new DataTransfer();
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    dt.items.add(new File([arr], 'statya.docx', {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    const inp = document.querySelector('#fFileInput');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change'));
  }, docxB64);
  // wait for extraction to finish
  await p.waitForFunction(()=>/вычитано|Файл:/.test(document.querySelector('#fileHint')?.textContent||'') && !/вычитываю/.test(document.querySelector('#fileHint')?.textContent||''), {timeout:8000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,800));
  const hint = await p.evaluate(()=>document.querySelector('#fileHint').textContent);
  console.log('fileHint after extract:', JSON.stringify(hint));
  await p.evaluate(()=>document.querySelector('#pubForm').requestSubmit());
  await p.waitForNavigation({waitUntil:'networkidle2'}).catch(()=>{});
  await new Promise(r=>setTimeout(r,700));
  const url = p.url(); console.log('after submit URL:', url);

  // text stored in localStorage but not displayed on page?
  const store = await p.evaluate(()=>{
    const t = JSON.parse(localStorage.getItem('ou_pub_texts')||'{}');
    const bodyTxt = document.body.innerText;
    return { ids:Object.keys(t), sample:(Object.values(t)[0]||'').slice(0,120),
             textShownOnPage: /rassmatrivaetsya unikalnyy metod/.test(bodyTxt) };
  });
  console.log('stored texts:', JSON.stringify(store));

  // cover image on card?
  await p.goto('http://localhost:8139/publications.html',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,700));
  const cover = await p.evaluate(()=>{
    const c=[...document.querySelectorAll('.pub-card')].find(x=>x.textContent.includes('Тестовая работа'));
    return c ? {img: !!c.querySelector('.pub-cover-img'), pdf: !!c.querySelector('.pub-cover-pdf')} : null;
  });
  console.log('card cover:', JSON.stringify(cover));

  // search by word found only inside the file text
  await p.evaluate(()=>{
    const inp=document.querySelector('.search-input')||document.querySelector('#searchInput')||document.querySelector('input[type=search]');
    window.__si=inp;
  });
  const sel = await p.evaluate(()=>{
    const i=document.querySelector('header input, .hd input');
    if(!i) return null; i.value='shchurok'; i.dispatchEvent(new Event('input')); return true;
  });
  await new Promise(r=>setTimeout(r,400));
  const drop = await p.evaluate(()=>{
    const d=document.querySelector('.search-drop');
    return d? {hidden:d.hidden, txt:d.innerText.slice(0,200)} : null;
  });
  console.log('search drop for "shchurok":', JSON.stringify(drop));

  // publications list search via ?q=
  await p.goto('http://localhost:8139/publications.html?q=shchurok',{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,600));
  const cnt = await p.evaluate(()=>document.querySelector('#count').textContent);
  console.log('list search count:', cnt);

  // PDF download button on publication page
  const pid = await p.evaluate(()=>{
    const c=document.querySelector('.pub-card a, a.pub-card');
    const m=(c&&c.href||'').match(/id=(\d+)/); return m?m[1]:null;
  });
  if (pid){
    await p.goto('http://localhost:8139/publication.html?id='+pid,{waitUntil:'networkidle2'});
    await new Promise(r=>setTimeout(r,500));
    const btn = await p.evaluate(()=>{
      const b=[...document.querySelectorAll('.pdf-dl')][0];
      return b? b.textContent.trim():null;
    });
    console.log('pdf button present:', btn);
    // click and capture download dataURL
    const pdfInfo = await p.evaluate(async ()=>{
      const EX=window.OU_extract;
      const pub=(window.Store&&Store.pubs||[]).find(x=>String(x.id)===new URLSearchParams(location.search).get('id'));
      const uri=await EX.workPdfDataUrl(pub);
      return {len:uri.length, head:uri.slice(0,40)};
    });
    console.log('generated PDF:', JSON.stringify(pdfInfo));
    // save decoded pdf for validation
    const raw = await p.evaluate(async ()=>{
      const EX=window.OU_extract;
      const pub=(window.Store&&Store.pubs||[]).find(x=>String(x.id)===new URLSearchParams(location.search).get('id'));
      const uri=await EX.workPdfDataUrl(pub);
      return uri.split(',')[1];
    });
    fs.writeFileSync('/workspace/out_test.pdf', Buffer.from(raw,'base64'));
    console.log('saved out_test.pdf');
  }

  console.log('PAGE ERRORS:', errs.length? errs.slice(0,5): 'none');
  await b.close(); srv.close();
})().catch(e=>{console.error('TEST FAIL', e); process.exit(1);});
