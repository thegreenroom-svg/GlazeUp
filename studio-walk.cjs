/* Walk every screen of the studio app against a stand-in server that
   returns realistic shapes, and REFUSE to pass if any write is attempted. */
const express=require('express'), path=require('path'), P=require('puppeteer-core');
const app=express(); const D=__dirname;
const writes=[];
// The ONE sanctioned exception. Anything else non-GET is a failure.
const SANCTIONED='/api/packing/find-listed';
app.use((q,_r,n)=>{ if(q.method!=='GET' && q.path!==SANCTIONED) writes.push(q.method+' '+q.path); n(); });
app.get('/studio',(q,r)=>r.sendFile(path.join(D,'studio','index.html')));
app.use('/studio',express.static(path.join(D,'studio')));

const iso=(h,m)=>{const d=new Date();d.setHours(h,m,0,0);return d.toISOString();};
app.get('/api/staff/team-for-login',(q,r)=>r.json({team:[
 {id:'1',name:'Daisy',role:'General Manager',onShift:true},
 {id:'2',name:'Jenny',role:'Studio Executive'},
 {id:'3',name:'Ruby',role:'Studio Assistant'},
 {id:'4',name:'Lucy',role:'Ceramic Technician'}]}));
app.get('/api/bookings/day',(q,r)=>r.json({date:q.query.date,covers:11,bookings:[
 {customer_name:'Joy Davenport',session_start:iso(10,0),session_end:iso(12,0),table_number:8,
  party_size:4,space_name:'Pottery Painting Session *Family Friendly* Main Studio',
  customer_phone:'07700 900412',booking_code:'BK-1'},
 {customer_name:'Louise Morton',session_start:iso(10,0),session_end:iso(12,0),table_number:null,
  party_size:2,space_name:'Pottery Painting Session *Family Friendly* Main Studio',
  notes:'Painting a reserved Santa head jar',booking_code:'BK-2'},
 {customer_name:'Marcus Bell',session_start:iso(9,30),session_end:iso(11,30),table_number:null,
  party_size:2,space_name:'The Lounge Pottery Painting *Adult Only*',booking_code:'BK-3'},
 {customer_name:'The Sowerby Party',session_start:iso(13,0),session_end:iso(15,30),table_number:null,
  party_size:12,space_name:'The Vault - perfect for private parties!',booking_code:'BK-4'}]}));
app.get('/api/pos/items',(q,r)=>r.json({total:11,groups:[
 {category:'PB Mugs And Cups',items:[{name:'Mug',price:19.97}]},
 {category:'PB Plates & Platters',items:[{name:'Plate',price:26.42}]},
 {category:'PB Bowls & Pet Bowls',items:[{name:'Bowl',price:24.05}]},
 {category:'PB Vases',items:[{name:'Vase',price:27.24}]},
 {category:'S. Pottery Painting Sessions',items:[{name:'Session fee',price:10.74}]},
 {category:'S. Glazing',items:[{name:'Glazing',price:1.98}]},
 {category:'Hot Drinks',items:[{name:'Latte',price:3.4}]},
 {category:'Cold Drinks',items:[{name:'Iced tea',price:2.6}]},
 {category:'Cakes',items:[{name:'Brownie',price:4.03}]},
 {category:'Booking Fees',items:[{name:'Booking fee',price:36.44}]},
 {category:'Other',items:[{name:'Misc',price:12.35}]}]}));  // real 41-category shape, trimmed
app.get('/api/takings/history',(q,r)=>{
  const days=[],months=[],years=[];
  for(let i=400;i>=0;i--){const d=new Date(Date.now()-i*864e5);
    days.push({date:d.toISOString().slice(0,10),
      revenue: (i%7===1||i%7===2)?0:Math.round(400+Math.random()*1400),
      txns: Math.round(10+Math.random()*70)});}
  const bm={}; days.forEach(d=>{const k=d.date.slice(0,7); bm[k]=(bm[k]||0)+d.revenue;});
  Object.entries(bm).forEach(([m,v])=>months.push({month:m,revenue:v}));
  const by={}; days.forEach(d=>{const y=d.date.slice(0,4); by[y]=(by[y]||0)+d.revenue;});
  Object.entries(by).forEach(([y,v])=>years.push({year:y,revenue:v}));
  const tot=days.reduce((s,d)=>s+d.revenue,0), tr=days.filter(d=>d.revenue>0);
  r.json({days,months,years,
    weekdays:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
      .map((w,i)=>({day:w,average:300+i*140,count:57})),
    stats:{total:tot,daysRecorded:days.length,tradingDays:tr.length,
      earliest:days[0].date,latest:days[days.length-1].date,
      averageTradingDay:tot/tr.length,
      bestDay:days.reduce((a,b)=>b.revenue>a.revenue?b:a,days[0]),
      bestMonth:months.reduce((a,b)=>b.revenue>a.revenue?b:a,months[0]),
      bestYear:years[0],totalTxns:days.reduce((s,d)=>s+d.txns,0)}});
});
app.get('/api/packing/queue',(q,r)=>r.json({count:5,pieces:[
 {booking_id:'Kim Driscoll',piece_type:'Cup (pink interior)',status:'fired',
  notes:'Painted 19/7 · Collect 23/7 · Lounge · NOT PAID, charge at collection'},
 {booking_id:'Kim Driscoll',piece_type:'Saucer (folk florals)',status:'fired',notes:'Collect 23/7'},
 {booking_id:'Frederica Findlater',piece_type:'Bunny (floral)',status:'fired',
  notes:'Painted 19/7 10-12 · Collect 23/7 · tag x5'},
 {booking_id:'Frederica Findlater',piece_type:'Motorbike',status:'fired',notes:'Collect 23/7'},
 {booking_id:'Georgina Callin',piece_type:'Cosy Duck plaque',status:'fired',notes:'Collect 23/7'}]}));
app.get('/api/takings/today',(q,r)=>r.json({value:1284.5,label:'today',synced:true}));
app.get('/api/takings/breakdown',(q,r)=>r.json({groups:[
 {group:'Paint your own — by shape',revenue:407316,items:20418,categories:[
   {category:'PB Mugs And Cups',revenue:80300,items:4021},
   {category:'PB Plates & Platters',revenue:52840,items:2000}]},
 {group:'Unclassified in Square',revenue:324497,items:26268,categories:[
   {category:'Other',revenue:324497,items:26268}]},
 {group:'Studio sessions & fees',revenue:113000,items:10087,categories:[
   {category:'S. Pottery Painting Sessions',revenue:108334,items:10087}]},
 {group:'Drinks',revenue:44100,items:15580,categories:[
   {category:'Hot Drinks',revenue:33150,items:11714}]}]}));
app.get('/api/floor/active',(q,r)=>r.json({bookings:[]}));
app.get('/api/floor/items/:code',(q,r)=>r.json({items:[
 {item_name:'PB Mugs And Cups',price_cents:1997,qty:2},
 {item_name:'S. Pottery Painting Sessions',price_cents:1074,qty:4},
 {item_name:'Hot Drinks',price_cents:283,qty:3}]}));
app.get('/api/pieces/for-booking',(q,r)=>r.json({pieces:
 q.query.bookingCode==='BK-3'?[]:[
 {id:'p1',piece_type:'Mug — pale blue with white spots',status:'fired',reference_photo_url:null},
 {id:'p2',piece_type:'Plate — yellow rim, red flowers',status:'fired',reference_photo_url:null}]}));
app.get('/api/ai-usage',(q,r)=>r.json({today:0.02,month:0.39,model:'gpt-4o-mini'}));
app.get('/api/bookings/search',(q,r)=>{
  const term=(q.query.q||'').toLowerCase();
  const all=[{customer_name:'Leanne Fisher',booking_code:'BK-99',table_number:3,
    session_start:new Date().toISOString(),customer_email:'leanne@example.com'}];
  r.json({bookings:all.filter(b=>b.customer_name.toLowerCase().includes(term)||String(b.table_number)===term)});
});
app.get('/api/floor/tables',(q,r)=>r.json({tables:[
 {name:'Table 1',room:'Main Studio',capacity:6,sort_order:1,grid_row:1,grid_col:0},
 {name:'Table 2',room:'Main Studio',capacity:4,sort_order:2,grid_row:2,grid_col:0},
 {name:'Table 3',room:'Main Studio',capacity:4,sort_order:3,grid_row:3,grid_col:0},
 {name:'Table 4',room:'Main Studio',capacity:6,sort_order:4,grid_row:4,grid_col:0},
 {name:'Table 5',room:'Main Studio',capacity:6,sort_order:5,grid_row:4,grid_col:2},
 {name:'Table 6',room:'Main Studio',capacity:4,sort_order:6,grid_row:2,grid_col:2},
 {name:'Table 7',room:'Main Studio',capacity:4,sort_order:7,grid_row:1,grid_col:2},
 {name:'Table 8',room:'Main Studio',capacity:8,sort_order:8,grid_row:0,grid_col:1},
 {name:'Lounge 1',room:'Lounge',capacity:4,sort_order:1,grid_row:0,grid_col:0},
 {name:'Lounge 2',room:'Lounge',capacity:4,sort_order:2,grid_row:1,grid_col:0},
 {name:'Lounge 3',room:'Lounge',capacity:4,sort_order:3,grid_row:2,grid_col:0},
 {name:'Lounge 4',room:'Lounge',capacity:4,sort_order:4,grid_row:0,grid_col:2},
 {name:'Lounge 5',room:'Lounge',capacity:4,sort_order:5,grid_row:1,grid_col:2},
 {name:'Lounge 6',room:'Lounge',capacity:4,sort_order:6,grid_row:2,grid_col:2},
 {name:'The Vault',room:'The Vault',capacity:14,sort_order:15,grid_row:0,grid_col:0}]}));
let searchCalls=0;
app.post('/api/packing/find-listed',express.json({limit:'12mb'}),(q,r)=>{
  searchCalls++;
  const w=q.body.wanted||[];
  r.json({cost:0.0031,allPottery:['pale pink cottage jar','blue speckled mug'],
    found:w.slice(0,2).map((x,i)=>({id:x.id,cell:['C4','E6'][i]})),
    diag:{returned:w.length,kept:Math.min(2,w.length),withCell:Math.min(2,w.length)}});});

const srv=app.listen(4801,async()=>{
  const b=await P.launch({executablePath:'/opt/google/chrome/chrome',
    args:['--no-sandbox','--disable-dev-shm-usage'],headless:'new'});
  const p=await b.newPage(); await p.setViewport({width:390,height:844,deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGE: '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  p.on('requestfailed',r=>errs.push('FAILED: '+r.url()));
  p.on('response',r=>{ if(r.status()>=400) errs.push('HTTP '+r.status()+' '+r.url()); });
  const shot=n=>p.screenshot({path:`/home/claude/shots/s-${n}.png`});

  await p.goto('http://localhost:4801/studio',{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,500)); await shot('1-login');
  const names=await p.$$eval('.person .n',e=>e.map(x=>x.textContent));
  await p.click('.person'); await new Promise(r=>setTimeout(r,600)); await shot('2-home');

  // THE FRONT DOOR: type a walk-in's name, one tap onto her full session
  await p.type('#findbox','Leanne',{delay:40});
  await new Promise(r=>setTimeout(r,500));
  const findRows = await p.$$eval('#findresults .findrow',e=>e.map(x=>x.textContent.trim()));
  console.log('search results  :', findRows.join(' | ') || 'NONE ✗');
  await p.screenshot({path:'/home/claude/shots/s-15-search.png'});
  await p.click('#findresults .findrow');
  await new Promise(r=>setTimeout(r,700));
  console.log('landed on view  :', await p.evaluate(()=>view));
  console.log('landed on       :', await p.$eval('#bk .card',e=>e.textContent.trim().slice(0,40)).catch(()=>'NOTHING ✗'));
  await p.screenshot({path:'/home/claude/shots/s-16-onehop.png',fullPage:true});
  await p.evaluate(()=>{stack=[];go('home',false);});
  for(const v of ['floor','day','till','pack','money']){
    await p.evaluate(x=>go(x),v); await new Promise(r=>setTimeout(r,700)); await shot('3-'+v);
  }
  // exercise: add till items, open a booking, page the day
  await p.evaluate(()=>go('till')); await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>{
    const items = document.querySelectorAll('.item');
    if (items[0]) items[0].click();
    if (items[1]) items[1].click(); else if (items[0]) items[0].click(); // add a 2nd line either way
  });
  await new Promise(r=>setTimeout(r,400)); await shot('4-ticket');
  // the demo send must complete the flow and reach nothing
  await p.evaluate(()=>$('tksend').click()); await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:'/home/claude/shots/s-9-receipt.png',fullPage:true});
  console.log('receipt shown   :', (await p.$('#demo-receipt')) ? 'yes' : 'NO ✗');
  console.log('receipt warns   :', await p.$eval('#demo-receipt .err',e=>
    e.textContent.includes('not sent')).catch(()=>false));
  console.log('ticket cleared  :', await p.evaluate(()=>ticket.length===0));
  // demo send: the flow must complete and reach nothing
  await p.evaluate(()=>$('tksend').click()); await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:'/home/claude/shots/s-9-receipt.png',fullPage:true});
  console.log('receipt shown   :', await p.$eval('#demo-receipt .err',e=>e.textContent.trim().slice(0,44)).catch(()=>'NONE'));
  console.log('ticket cleared  :', await p.evaluate(()=>ticket.length===0));
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>document.querySelector('.ev').click());
  await new Promise(r=>setTimeout(r,500)); await shot('5-booking');
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>$('next').click()); await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>$('prev').click()); await new Promise(r=>setTimeout(r,600));

  // THE BOOKING AS A WORKFLOW: seated -> till total -> pieces -> find
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>document.querySelector('.ev').click());
  await new Promise(r=>setTimeout(r,900));
  await p.screenshot({path:'/home/claude/shots/s-8-workflow.png',fullPage:true});
  console.log('workflow steps  :', await p.$$eval('#bk .card h2',e=>e.map(x=>x.textContent).join(' | ')));
  console.log('till total shown:', await p.$eval('#bk .fig',e=>e.textContent).catch(()=>'none'));

  // a booking with no pieces yet -> the photograph-the-table step
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.ev')]
    .find(x=>x.textContent.includes('Marcus')); if(e) e.click();});
  await new Promise(r=>setTimeout(r,900));
  console.log('table step shown:', (await p.$('#tableshot')) ? 'yes' : 'NO ✗');
  const ti=await p.$('#tableshot');
  if(ti){ await ti.uploadFile('/tmp/shelf.png'); await new Promise(r=>setTimeout(r,600));
    // paintTableMark() replaces #tableimg on every tap, so the element
    // must be re-fetched each time — reusing one handle across two taps
    // hits a detached node on the second, which the app's own zero-size
    // guard then (correctly) refuses. Re-query to test the real path.
    for (const [fx,fy] of [[0.3,0.4],[0.7,0.6]]) {
      await p.evaluate(([fx,fy])=>{ const i=$('tableimg'); if(!i) return;
        const r=i.getBoundingClientRect();
        i.onclick({clientX:r.left+r.width*fx,clientY:r.top+r.height*fy}); }, [fx,fy]);
      await new Promise(r=>setTimeout(r,250));
    }
    console.log('pieces marked   :', await p.evaluate(()=>marks.length));
    await p.screenshot({path:'/home/claude/shots/s-10-table.png',fullPage:true}); }

  // JENNY'S TABLE PLAN: an unseated booking offers a local table pick,
  // carries into a practice ticket, and one tap clears everything.
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.ev')]
    .find(x=>x.textContent.includes('Marcus')); if(e) e.click();});
  await new Promise(r=>setTimeout(r,600));
  console.log('picker shown    :', (await p.$('#bk .pickt')) ? 'yes' : 'NO ✗');
  await p.evaluate(()=>document.querySelector('#bk .pickt').click());
  await new Promise(r=>setTimeout(r,300));
  const planChip = await p.$eval('#bk .chip.on', e=>e.textContent.trim()).catch(()=>'NONE ✗');
  console.log('table planned   :', planChip);
  await p.screenshot({path:'/home/claude/shots/s-17-plan.png',fullPage:true});
  await p.evaluate(()=>document.querySelector('#bk-till').click());
  await new Promise(r=>setTimeout(r,400));
  const tillTableShown = await p.$eval('#tilltable', e=>e.textContent.replace(/\s+/g,' ').trim()).catch(()=>'NONE ✗');
  console.log('till table shown:', tillTableShown);
  await p.screenshot({path:'/home/claude/shots/s-18-tilltable.png'});
  // add an item so 'clear the day' has something real to prove it clears
  await p.evaluate(()=>{const it=document.querySelector('.item'); if(it) it.click();});
  await new Promise(r=>setTimeout(r,300));
  console.log('ticket before   :', await p.evaluate(()=>ticket.length), 'tillTable before:', await p.evaluate(()=>tillTable));
  await p.evaluate(()=>document.getElementById('tkclear').click());
  await new Promise(r=>setTimeout(r,300));
  console.log('ticket after    :', await p.evaluate(()=>ticket.length), 'tillTable after :', await p.evaluate(()=>tillTable));
  await p.screenshot({path:'/home/claude/shots/s-19-cleared.png'});

  // direct Home -> Till, no booking context: the picker must appear here too
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('till')); await new Promise(r=>setTimeout(r,500));
  console.log('picker on direct till:', (await p.$('#tilltable .pickt')) ? 'yes' : 'NO ✗');

  // THE PACKING FLOW: booking -> table photo -> photograph a shelf -> circles
  await p.evaluate(()=>go('pack')); await new Promise(r=>setTimeout(r,700));
  const clickErr = await p.evaluate(()=>{
    try { document.querySelector('#pack [data-p]').click(); return null; }
    catch(e){ return e.message + '\n' + e.stack; }
  });
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:'/home/claude/shots/s-6-booking.png',fullPage:true});
  // a real file through the real input, so the iOS-safe path is exercised
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  require('fs').writeFileSync('/tmp/shelf.png',png);
  const inp=await p.$('#shelfshot'); await inp.uploadFile('/tmp/shelf.png');
  await new Promise(r=>setTimeout(r,1400));
  await p.screenshot({path:'/home/claude/shots/s-7-found.png',fullPage:true});
  // POSITIONED FLOOR: prove the Lounge lays out 2 cols x 3 rows, not 3-per-row
  await p.evaluate(()=>go('floor')); await new Promise(r=>setTimeout(r,700));
  await p.screenshot({path:'/home/claude/shots/s-12-floor-real.png',fullPage:true});
  const gp = await p.$('.gridpos');
  console.log('positioned grid :', gp ? 'used' : 'MISSING ✗ (fell back to flat grid3)');

  // SUBGROUPED TILL: prove 41 flat categories become parent chips, not one giant row
  await p.evaluate(()=>go('till')); await new Promise(r=>setTimeout(r,700));
  await p.screenshot({path:'/home/claude/shots/s-13-till-real.png',fullPage:true});
  const parentChips = await p.$$eval('#cats .chip', e => e.map(x => x.textContent));
  console.log('parent chips    :', parentChips.join(' | '));
  console.log('parent count    :', parentChips.length, parentChips.length <= 6 ? '(OK, not 41)' : 'STILL FLAT ✗');
  await p.click('#leafcats .chip:nth-child(2)').catch(()=>{});
  await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:'/home/claude/shots/s-14-till-leaf.png',fullPage:true});

  console.log('search calls    :', searchCalls);
  console.log('rings drawn     :', await p.$$eval('circle',e=>e.length).catch(()=>0));
  console.log('result heading  :', await p.$$eval('.card h2',e=>e.map(x=>x.textContent).join(' | ')));
  // try to force a write through the guard
  const blocked=await p.evaluate(async()=>{ try{ await read('/api/pos/order'); return 'NOT BLOCKED'; }
    catch(e){ return e.message.slice(0,40); } });

  console.log('team read      :', names.join(', '));
  console.log('guard test     :', blocked);
  console.log('unsanctioned writes:', writes.length? '✗ '+writes.join(', ') : 'NONE ✓');

  // separately prove the empty-floor case, on a server with no bookings at all
  const app2=require('express')(); app2.use(express.json());
  app2.get('/studio',(q,r)=>r.sendFile(path.join(D,'studio','index.html')));
  app2.use('/studio',express.static(path.join(D,'studio')));
  app2.get('/api/staff/team-for-login',(q,r)=>r.json({team:[{id:'1',name:'David',role:'Co-Director'}]}));
  app2.get('/api/bookings/day',(q,r)=>r.json({date:q.query.date,covers:0,bookings:[]}));
  await new Promise(resolveListen => {
    const s2=app2.listen(4809, async () => {
      const p2=await b.newPage(); await p2.setViewport({width:412,height:900,deviceScaleFactor:2});
      await p2.goto('http://localhost:4809/studio',{waitUntil:'networkidle0'});
      await p2.click('.person'); await new Promise(r=>setTimeout(r,400));
      await p2.evaluate(()=>go('floor')); await new Promise(r=>setTimeout(r,600));
      console.log('empty-floor note:', (await p2.$('.note')) ? 'shown' : 'MISSING ✗');
      await p2.screenshot({path:'/home/claude/shots/s-11-empty-floor.png'});
      await p2.close(); s2.close(); resolveListen();
    });
  });
  console.log(errs.length? '✗ ERRORS:\n  '+errs.join('\n  ') : '✓ zero errors across all screens');
  await b.close(); srv.close(); process.exit(errs.length||writes.length?1:0);
});
