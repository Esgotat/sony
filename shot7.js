const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({args:['--no-sandbox']});
  const themes = ['default','dark','night','tiffany','greenery','tangerine','estate','cashmere','oxford','burgundy','emerald'];
  for (const t of themes) {
    const page = await browser.newPage();
    await page.setViewport({width:1280,height:900});
    await page.goto('http://localhost:8099/publications.html', {waitUntil:'networkidle0'});
    await page.evaluate((t)=>{ localStorage.setItem('ou_theme', t); }, t);
    await page.reload({waitUntil:'networkidle0'});
    await new Promise(r=>setTimeout(r,400));
    const res = await page.evaluate(() => {
      function parseColor(s){
        const m = s.match(/rgba?\(([^)]+)\)/); if(!m) return null;
        const p = m[1].split(',').map(x=>parseFloat(x));
        return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};
      }
      function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)}
      function comp(bgs){let out={r:0,g:0,b:0};
        for(let i=bgs.length-1;i>=0;i--){const c=bgs[i];if(!c)continue;const a=c.a==null?1:c.a;
          out={r:out.r*(1-a)+c.r*a,g:out.g*(1-a)+c.g*a,b:out.b*(1-a)+c.b*a};}
        return out;}
      function bgStack(el){const st=[];let e=el;
        while(e&&e!==document.documentElement){st.push(parseColor(getComputedStyle(e).backgroundColor));e=e.parentElement;}
        return st.filter(Boolean);}
      const out=[];
      document.querySelectorAll('.pub-card').forEach(card=>{
        card.querySelectorAll('*').forEach(el=>{
          const txt=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim())[0];
          if(!txt)return;
          const cs=getComputedStyle(el);
          const fg=parseColor(cs.color); if(!fg)return;
          const bgs=bgStack(el); if(!bgs.length)return;
          const bg=comp(bgs);
          const L1=lum(fg),L2=lum(bg);
          const cr=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
          const small=parseFloat(cs.fontSize)<18;
          if(cr<(small?4.5:3))out.push({cls:String(el.className).slice(0,42),cr:+cr.toFixed(2),color:cs.color,bg:`rgb(${bg.r|0},${bg.g|0},${bg.b|0})`});
        });
      });
      const seen={},ded=[];for(const o of out){if(!seen[o.cls]){seen[o.cls]=1;ded.push(o)}}
      return ded;
    });
    console.log('THEME', t, JSON.stringify(res));
    await page.close();
  }
  await browser.close();
})();
