const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
const CHROME='/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome';const ROOT='/home/claude/GlazeUp';
(async()=>{
  const srv=http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/'||p==='/admin'||p==='/admin/')p='/admin/dashboard-local.html';fs.readFile(path.join(ROOT,p),(e,buf)=>{if(e){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':path.extname(p)==='.html'?'text/html':'text/plain'});res.end(buf);});});
  await new Promise(r=>srv.listen(4599,r));
  const browser=await puppeteer.launch({executablePath:CHROME,args:['--no-sandbox']});const page=await browser.newPage();
  await page.evaluateOnNewDocument(()=>{window.fetch=async(u)=>new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});});
  await page.setViewport({width:390,height:844});
  await page.goto('http://localhost:4599/admin/dashboard-local.html',{waitUntil:'networkidle2',timeout:20000});
  await new Promise(r=>setTimeout(r,700));
  const out = await page.evaluate(async () => {
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    openPackingGuide(); await sleep(60);
    const results = [];
    for (let i=0;i<JENNY_GUIDE_STEPS.length;i++){
      const overlay = document.getElementById('jg-overlay');
      const card = overlay.firstElementChild;
      const bodyEl = overlay.querySelector('div[style*="overflow-y:auto"]');
      results.push({
        step:i+1,
        cardHeightOK: card.getBoundingClientRect().height <= window.innerHeight*0.9,
        bodyTextLen: bodyEl.textContent.trim().length,
        hasUnclosedLookingTag: /<[a-z]+(?![^>]*\/>)[^>]*>[^<]*$/.test(bodyEl.innerHTML.slice(-50)) // crude tail check
      });
      const btn = Array.from(overlay.querySelectorAll('button')).find(b=>/Next|Take me/.test(b.textContent));
      if (btn) btn.click();
      await sleep(30);
    }
    return results;
  });
  console.log(JSON.stringify(out, null, 1));
  const allGood = out.every(r => r.cardHeightOK && r.bodyTextLen > 20);
  console.log(allGood ? '✅ every step: card fits the phone viewport, body text renders with real content' : '⚠️ review');
  // Screenshot step 5 (the richest one, with confidence badges) for visual sanity
  await page.evaluate(()=>{ _jg.i = 4; _jgRender(); });
  await new Promise(r=>setTimeout(r,100));
  await page.screenshot({path:'/tmp/guide_step5.png'});
  await browser.close();srv.close();
})();
