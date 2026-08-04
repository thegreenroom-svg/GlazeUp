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
app.get('/api/pos/items',(q,r)=>r.json({total:0,groups:[]}));   // as the studio really is
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
app.get('/api/ai-usage',(q,r)=>r.json({today:0.02,month:0.39,model:'gpt-4o-mini'}));
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
  for(const v of ['floor','day','till','pack','money']){
    await p.evaluate(x=>go(x),v); await new Promise(r=>setTimeout(r,700)); await shot('3-'+v);
  }
  // exercise: add till items, open a booking, page the day
  await p.evaluate(()=>go('till')); await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>{document.querySelectorAll('.item')[0].click();
                       document.querySelectorAll('.item')[1].click();});
  await new Promise(r=>setTimeout(r,400)); await shot('4-ticket');
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>document.querySelector('.ev').click());
  await new Promise(r=>setTimeout(r,500)); await shot('5-booking');
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>$('next').click()); await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>$('prev').click()); await new Promise(r=>setTimeout(r,600));

  // THE PACKING FLOW: booking -> table photo -> photograph a shelf -> circles
  await p.evaluate(()=>go('pack')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>document.querySelector('[data-p]').click());
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:'/home/claude/shots/s-6-booking.png',fullPage:true});
  // a real file through the real input, so the iOS-safe path is exercised
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  require('fs').writeFileSync('/tmp/shelf.png',png);
  const inp=await p.$('#shelfshot'); await inp.uploadFile('/tmp/shelf.png');
  await new Promise(r=>setTimeout(r,1400));
  await p.screenshot({path:'/home/claude/shots/s-7-found.png',fullPage:true});
  console.log('search calls    :', searchCalls);
  console.log('rings drawn     :', await p.$$eval('circle',e=>e.length).catch(()=>0));
  console.log('result heading  :', await p.$$eval('.card h2',e=>e.map(x=>x.textContent).join(' | ')));
  // try to force a write through the guard
  const blocked=await p.evaluate(async()=>{ try{ await read('/api/pos/order'); return 'NOT BLOCKED'; }
    catch(e){ return e.message.slice(0,40); } });

  console.log('team read      :', names.join(', '));
  console.log('guard test     :', blocked);
  console.log('unsanctioned writes:', writes.length? '✗ '+writes.join(', ') : 'NONE ✓');
  console.log(errs.length? '✗ ERRORS:\n  '+errs.join('\n  ') : '✓ zero errors across all screens');
  await b.close(); srv.close(); process.exit(errs.length||writes.length?1:0);
});
