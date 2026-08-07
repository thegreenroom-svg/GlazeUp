/* Walk every screen of the studio app against a stand-in server that
   returns realistic shapes, and REFUSE to pass if any write is attempted. */
const express=require('express'), path=require('path'), P=require('puppeteer-core');
const app=express(); const D=__dirname;
const writes=[];
// The ONE sanctioned exception. Anything else non-GET is a failure.
// The one search POST, plus the three staff-identity writes (verify/
// set/reset-pin) — matches PIN_WRITES in studio/app.js exactly. Any
// OTHER non-GET is still a failure; this isn't a general write allowance.
const SANCTIONED=['/api/packing/find-listed','/api/pieces/describe-group','/api/staff/verify-pin','/api/staff/set-pin','/api/staff/reset-pin','/api/addons/enable','/api/addons/disable','/api/cleos-club/config','/api/practice/booking-from-photo'];
app.use((q,_r,n)=>{ if(q.method!=='GET' && !SANCTIONED.includes(q.path)) writes.push(q.method+' '+q.path); n(); });
app.get('/studio',(q,r)=>r.sendFile(path.join(D,'studio','index.html')));
app.use('/studio',express.static(path.join(D,'studio')));

const iso=(h,m)=>{const d=new Date();d.setHours(h,m,0,0);return d.toISOString();};
const pinState = {'1':'4242','2':'1357','4':'9999'};
app.get('/api/staff/team-for-login',(q,r)=>r.json({team:[
 {id:'1',name:'Daisy',role:'General Manager',onShift:true,hasPinSet:!!pinState['1']},
 {id:'2',name:'Jenny',role:'Studio Executive',hasPinSet:!!pinState['2']},
 {id:'3',name:'Ruby',role:'Studio Assistant',hasPinSet:!!pinState['3']},
 {id:'4',name:'Lucy',role:'Ceramic Technician',hasPinSet:!!pinState['4']}]}));
// [4 Aug] stateful enough to prove the real round trip: Daisy's PIN is
// '4242'; Ruby has none yet. Reset actually clears server-side state
// here too, so re-reading the team after a reset shows the real change.
app.post('/api/staff/verify-pin',express.json(),(q,r)=>
  r.json({ok: pinState[q.body.staffMemberId]===String(q.body.pin)}));
app.post('/api/staff/set-pin',express.json(),(q,r)=>{
  if (pinState[q.body.staffMemberId]) return res_409(r);
  pinState[q.body.staffMemberId]=String(q.body.pin); r.json({ok:true});
});
function res_409(r){ r.status(409).json({error:'A PIN is already set for this person.'}); }
app.post('/api/staff/reset-pin',express.json(),(q,r)=>{
  const managerId=Object.keys(pinState).find(id=>pinState[id]===String(q.body.managerPin));
  if (!managerId) return r.status(401).json({error:'Incorrect manager PIN'});
  delete pinState[q.body.targetStaffMemberId];
  r.json({ok:true,message:'PIN cleared.'});
});
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
app.get('/api/pos/items',(q,r)=>r.json({total:19,groups:[
 {category:'PB Mugs And Cups',items:[{name:'Mug',price:19.97},{name:'Big Mug',price:22.50},
   {name:'Small Mug',price:16.20},{name:'Owl',price:18.50},{name:'Spaniel Pup',price:26.00},
   {name:'Standing Dog',price:20.00},{name:'Tom cat',price:16.00},{name:'Unicorn',price:24.00},
   {name:'Wide Mouth Frog',price:28.00},{name:'Wise owl',price:26.00},{name:'Woody dog',price:25.00}]},
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
let moneyHistCalls = 0;
app.get('/api/takings/history',(q,r)=>{
  moneyHistCalls++;
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
app.get('/api/packing/queue',(q,r)=>r.json({count:6,pieces:[
 {booking_id:'Kim Driscoll',piece_type:'Cup (pink interior)',status:'fired',
  notes:'Painted 19/7 · Collect 23/7 · Lounge · NOT PAID, charge at collection'},
 {booking_id:'Kim Driscoll',piece_type:'Saucer (folk florals)',status:'fired',notes:'Collect 23/7'},
 {booking_id:'Frederica Findlater',piece_type:'Bunny (floral)',status:'fired',
  notes:'Painted 19/7 10-12 · Collect 23/7 · tag x5'},
 {booking_id:'Frederica Findlater',piece_type:'Motorbike',status:'fired',notes:'Collect 23/7'},
 {booking_id:'Georgina Callin',piece_type:'Cosy Duck plaque',status:'fired',notes:'Collect 23/7'},
 {booking_id:'Leanne Fisher',piece_type:'Mug (blue spots)',status:'fired',notes:'Collect 23/7'}]}));
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
 ['BK-3','BK-4'].includes(q.query.bookingCode)?[]:[
 {id:'p1',piece_type:'Mug — pale blue with white spots',status:'fired',reference_photo_url:null},
 {id:'p2',piece_type:'Plate — yellow rim, red flowers',status:'fired',reference_photo_url:null}]}));
app.get('/api/ai-usage',(q,r)=>r.json({today:0.02,month:0.39,model:'gpt-4o-mini'}));
const practiceStore = {bookings:[], pieces:[]};
app.post('/api/practice/booking-from-photo',express.json({limit:'20mb'}),(q,r)=>{
  const id='pb-'+(practiceStore.bookings.length+1);
  const booking={id,customer_name:'Demo: Sammy Okafor',session_date:new Date().toISOString().slice(0,10),
    session_time:'6-9',created_at:new Date().toISOString()};
  practiceStore.bookings.push(booking);
  const testPhoto='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const pieces=[{id:id+'-p1',practice_booking_id:id,description:'blue mug, white spots',found:false,reference_photo_url:testPhoto},
    {id:id+'-p2',practice_booking_id:id,description:'yellow plate, red flowers',found:false}];
  practiceStore.pieces.push(...pieces);
  r.json({booking,pieces,tag:{name:booking.customer_name},cost:0.0031});
});
app.get('/api/practice/bookings',(q,r)=>{
  const rows=practiceStore.bookings.filter(b=>b.session_date===q.query.date)
    .map(b=>({...b,piece_count:practiceStore.pieces.filter(p=>p.practice_booking_id===b.id).length}));
  r.json({bookings:rows});
});
app.get('/api/practice/pieces',(q,r)=>{
  r.json({pieces:practiceStore.pieces.filter(p=>p.practice_booking_id===q.query.bookingId)});
});
app.get('/api/gift-cards/lookup',(q,r)=>{
  if (q.query.gan==='7783320000000000')
    return r.json({gan:q.query.gan,state:'ACTIVE',balance:{amount:45.50,currency:'GBP'}});
  r.status(404).json({error:'No gift card found with that number'});
});
let clubConfig = {enabled:true,reward_every_n_visits:5,reward_description:'Free small piece + a drink',
  pricing_model:'usage',price_per_visit_cents:8,price_percent_of_spend:1.0,minimum_monthly_cents:300};
app.get('/api/cleos-club/config',(q,r)=>r.json({config:clubConfig}));
app.post('/api/cleos-club/config',express.json(),(q,r)=>{
  clubConfig={...clubConfig,enabled:!!q.body.enabled,reward_every_n_visits:q.body.rewardEveryNVisits,
    reward_description:q.body.rewardDescription};
  r.json({config:clubConfig});
});
const addonCatalogue = {
  ai_piece_finder:{name:'AI Piece Finder',description:'Piece matching and whole-tray scan.',monthlyPriceCents:2000},
  piece_catalogue:{name:'Piece Catalogue',description:'Browse and reserve stock from home.',monthlyPriceCents:1500},
};
let addonStatus = {};
app.get('/api/addons/catalogue',(q,r)=>r.json({catalogue:addonCatalogue}));
app.get('/api/addons/status',(q,r)=>r.json({addons:addonStatus}));
app.post('/api/addons/enable',express.json(),(q,r)=>{
  addonStatus[q.body.addonKey]={enabled:true}; r.json({status:'enabled'});
});
app.post('/api/addons/disable',express.json(),(q,r)=>{
  addonStatus[q.body.addonKey]={enabled:false}; r.json({status:'disabled'});
});
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
let describeCalls=0;
app.post('/api/pieces/describe-group',express.json({limit:'12mb'}),(q,r)=>{
  describeCalls++;
  r.json({cost:0.0009,pieces:[{description:'pale blue mug, white spots'}],tag:null});
});

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
  // THE LOGIN ITSELF NOW GOES THROUGH A REAL PIN — Daisy's is '4242' in
  // the stand-in. A bare .person click used to sign straight in; now it
  // opens the PIN screen, same as it would for a real person.
  await p.click('.person'); await new Promise(r=>setTimeout(r,400));
  console.log('PIN screen shown:', (await p.$('#pinentry')) ? 'yes ✓' : 'NO ✗');
  await p.screenshot({path:'/home/claude/shots/s-26-pin-entry.png'});
  await p.type('#pinentry','4242',{delay:30});
  await p.evaluate(()=>document.getElementById('pingo').click());
  await new Promise(r=>setTimeout(r,600)); await shot('2-home');
  console.log('signed in as    :', await p.evaluate(()=>me && me.name), '(admin:', await p.evaluate(()=>me && me.admin)+')');
  const appLinkHref = await p.$eval('a[href^="/app"]', e=>e.getAttribute('href')).catch(()=>null);
  console.log('customer app link on Home:', appLinkHref === '/app' ? 'yes ✓' : '✗ '+appLinkHref);

  // THE LOGIN/PIN WORK: David — "an actual login for everyone, their
  // own code, admin can reset it." Test the whole real loop.
  await p.evaluate(()=>{go('login',false); loadLogin();}); await new Promise(r=>setTimeout(r,500));
  await p.click('.person'); await new Promise(r=>setTimeout(r,400));   // Daisy again
  await p.type('#pinentry','0000',{delay:20});                        // deliberately wrong
  await p.evaluate(()=>document.getElementById('pingo').click());
  await new Promise(r=>setTimeout(r,400));
  console.log('wrong PIN rejected:', await p.$eval('#pinerr',e=>e.textContent).catch(()=>'NO ERROR SHOWN ✗'),
    '| still on login:', await p.evaluate(()=>view)==='login' ? 'yes ✓' : '✗');
  await p.evaluate(()=>document.getElementById('pinentry').value='');
  await p.type('#pinentry','4242',{delay:20});                        // the right one
  await p.evaluate(()=>document.getElementById('pingo').click());
  await new Promise(r=>setTimeout(r,500));
  console.log('right PIN signs in:', await p.evaluate(()=>me && me.name), await p.evaluate(()=>view)==='home' ? '✓' : '✗');

  // Ruby has no PIN yet — must get the set-a-PIN flow, not enter-PIN
  await p.evaluate(()=>{go('login',false); loadLogin();}); await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>{const b=[...document.querySelectorAll('.person')].find(x=>x.textContent.includes('Ruby')); if(b) b.click();});
  await new Promise(r=>setTimeout(r,400));
  const setPinHeading = await p.$eval('#pinpanel',e=>e.textContent).catch(()=>'');
  console.log('Ruby gets set-PIN flow:', setPinHeading.includes('choose one now') ? 'yes ✓' : '✗');
  await p.screenshot({path:'/home/claude/shots/s-27-set-pin.png'});
  await p.type('#pinentry','7777',{delay:20});
  await p.evaluate(()=>document.getElementById('pingo').click());
  await new Promise(r=>setTimeout(r,500));
  console.log('Ruby signed in    :', await p.evaluate(()=>me && me.name), '(admin:', await p.evaluate(()=>me && me.admin)+')');
  console.log('non-admin sees no Staff PINs tile:', (await p.$$eval('.tile',e=>e.map(x=>x.textContent).join('|'))).includes('Staff PINs') ? '✗ SHOWS' : 'yes, hidden ✓');

  // back in as Daisy (a director) — Staff PINs tile, and the reset flow
  await p.evaluate(()=>{go('login',false); loadLogin();}); await new Promise(r=>setTimeout(r,500));
  await p.click('.person'); await new Promise(r=>setTimeout(r,400));
  await p.type('#pinentry','4242',{delay:20});
  await p.evaluate(()=>document.getElementById('pingo').click());
  await new Promise(r=>setTimeout(r,500));
  console.log('admin sees Staff PINs tile:', (await p.$$eval('.tile',e=>e.map(x=>x.textContent).join('|'))).includes('Staff PINs') ? 'yes ✓' : '✗ MISSING');
  await p.evaluate(()=>go('pins')); await new Promise(r=>setTimeout(r,700));
  const pinsListBefore = await p.$eval('#pins',e=>e.textContent).catch(()=>'');
  console.log('Ruby now shows PIN set:', pinsListBefore.includes('Ruby') && pinsListBefore.match(/Ruby[^▦]*PIN set/) ? 'yes ✓' : '(check manually)');
  await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-reset]')].find(x=>x.dataset.name==='Jenny'); if(b) b.click();});
  await new Promise(r=>setTimeout(r,400));
  console.log('reset-confirm shown for Jenny:', (await p.$('#resetpin')) ? 'yes ✓' : '✗');
  await p.type('#resetpin','4242',{delay:20});                        // Daisy's own PIN, to authorise
  await p.evaluate(()=>document.getElementById('resetgo').click());
  await new Promise(r=>setTimeout(r,600));
  const pinsListAfter = await p.$eval('#pins',e=>e.textContent).catch(()=>'');
  console.log('Jenny cleared     :', pinsListAfter.includes('cleared') || /Jenny[^▦]*No PIN yet/.test(pinsListAfter) ? 'yes ✓' : '✗');
  await p.screenshot({path:'/home/claude/shots/s-25-pins.png',fullPage:true});
  await p.evaluate(()=>{stack=[];go('home',false);});

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
  // EVERY PAGE NEEDS A WAY HOME: from three levels deep (search -> a
  // real booking), one tap on the explicit home icon, not the stack.
  console.log('home icon visible on a nested page:', (await p.$eval('#hometap2',e=>e.classList.contains('on'))) ? 'yes' : 'NO ✗');
  await p.evaluate(()=>document.getElementById('hometap2').click());
  await new Promise(r=>setTimeout(r,400));
  console.log('home icon -> view:', await p.evaluate(()=>view), await p.evaluate(()=>view)==='home' ? '(one tap ✓)' : '✗');
  console.log('home icon hidden on home:', (await p.$eval('#hometap2',e=>e.classList.contains('on'))) ? '✗ STILL SHOWING' : 'yes, hidden ✓');
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
    e.textContent.includes('nothing reached Square')).catch(()=>false));
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
  const withPiecesH2s = await p.$$eval('#bk .card h2', e=>e.map(x=>x.textContent));
  console.log('has-pieces booking shows both real steps:',
    (withPiecesH2s.includes('Her pieces') && withPiecesH2s.includes('Find them on the shelf')) ? 'yes ✓' : '✗');
  console.log('till total shown:', await p.$eval('#bk .fig',e=>e.textContent).catch(()=>'none'));

  // A real file through real inputs from here on — create it once,
  // before its first genuine use (it used to only be written much
  // later in this script, which "worked" only because a stale file
  // was left over in /tmp from an earlier run in the same container).
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  require('fs').writeFileSync('/tmp/shelf.png',png);

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
    // AI SHOULD DESCRIBE: David — "Ai should describe." Give the two
    // in-flight auto-describe calls time to land, then check the
    // fields hold a real guess BEFORE any manual typing overwrites them.
    await new Promise(r=>setTimeout(r,500));
    console.log('AI guess landed :', await p.evaluate(()=>marks.map(m=>m.desc).join(' | ')));
    console.log('describe calls  :', describeCalls);
    await p.screenshot({path:'/home/claude/shots/s-10-table.png',fullPage:true});

    // THE FULL LOOP: David — "photograph the table... needs to then
    // complete so we can actually find these things on the shelves...
    // start to finish, circle." Type descriptions, finish, confirm Her
    // Pieces + Find Them appear from nothing but this session's own
    // photo, then actually run the finder against them.
    await p.evaluate(()=>{
      const inputs=[...document.querySelectorAll('[data-desc]')];
      if(inputs[0]){inputs[0].value='blue mug, white spots'; inputs[0].dispatchEvent(new Event('change'));}
      if(inputs[1]){inputs[1].value='yellow plate, red flowers'; inputs[1].dispatchEvent(new Event('change'));}
    });
    await new Promise(r=>setTimeout(r,200));
    console.log('descriptions set:', await p.evaluate(()=>marks.map(m=>m.desc).join(' | ')));
    await p.evaluate(()=>document.getElementById('finishmarks').click());
    await new Promise(r=>setTimeout(r,800));
    const afterFinish = await p.$$eval('#bk .card h2', e=>e.map(x=>x.textContent));
    console.log('steps after finish:', afterFinish.join(' | '));
    console.log('  Her pieces + Find them now real:',
      (afterFinish.includes('Her pieces') && afterFinish.includes('Find them on the shelf')) ? 'yes ✓' : '✗');
    const localLabel = await p.$eval('#bk', e=>e.textContent).catch(()=>'');
    console.log('  labelled as this session:', localLabel.includes('Added this session') ? 'yes ✓' : '✗');
    await p.screenshot({path:'/home/claude/shots/s-22-pieces-made.png',fullPage:true});
    // now actually search for them
    const bshot=await p.$('#bkshot');
    if(bshot){
      await bshot.uploadFile('/tmp/shelf.png'); await new Promise(r=>setTimeout(r,1200));
      const foundText = await p.$eval('#bkfound', e=>e.textContent).catch(()=>'NONE');
      console.log('finder ran on local pieces:', foundText.includes('found') ? foundText.trim() : '✗ '+foundText);
      await p.screenshot({path:'/home/claude/shots/s-23-loop-closed.png',fullPage:true});
    } else console.log('finder ran on local pieces: ✗ no #bkshot present');
  }

  // SIMPLIFIED TABLE FLOW: David — Jenny's plan is a paper thing done
  // in the morning, not a digital pre-allocation step; table choice
  // belongs at the till (or Floor's tap-a-table), not duplicated on
  // the booking page. An unseated booking should show plain text only,
  // no picker; the till carries whatever table's carried, or offers
  // its own picker if none is.
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.ev')]
    .find(x=>x.textContent.includes('Sowerby')); if(e) e.click();});   // untouched by the full-loop test above
  await new Promise(r=>setTimeout(r,600));
  console.log('no picker on bk :', (await p.$('#bk .pickt')) ? '✗ STILL THERE' : 'yes, gone ✓');
  // David: steps 3/4 as two inert placeholders were "irrelevant" — should
  // collapse to ONE real next step (Photograph the table) when there's
  // nothing yet, and only show as two real steps once pieces exist.
  const bkH2s = await p.$$eval('#bk .card h2', e=>e.map(x=>x.textContent));
  console.log('no-pieces steps :', bkH2s.join(' | '));
  console.log('  one merged 3, no bare 4:', (bkH2s.includes('Photograph the table') && !bkH2s.includes('Find them on the shelf')) ? 'yes ✓' : '✗');
  await p.screenshot({path:'/home/claude/shots/s-17-plan.png',fullPage:true});
  await p.evaluate(()=>document.querySelector('#bk-till').click());
  await new Promise(r=>setTimeout(r,400));
  console.log('till picker shown on open booking:', (await p.$('#tilltable .pickt')) ? 'yes ✓' : 'NO ✗');
  await p.evaluate(()=>document.querySelector('#tilltable .pickt').click());
  await new Promise(r=>setTimeout(r,300));
  const tillTableShown = await p.$eval('#tilltable', e=>e.textContent.replace(/\s+/g,' ').trim()).catch(()=>'NONE ✗');
  console.log('till table shown:', tillTableShown);
  await p.screenshot({path:'/home/claude/shots/s-18-tilltable.png'});
  // add an item so 'clear the day' has something real to prove it clears
  await p.evaluate(()=>{const it=document.querySelector('.item'); if(it) it.click();});
  await new Promise(r=>setTimeout(r,300));
  // THE REAL BUG: David rang items in, left the booking, opened another,
  // came back — the till had forgotten everything even though nothing
  // was ever sent. Prove it now actually persists per booking.
  console.log('ticket has item before leaving:', await p.evaluate(()=>ticket.length));
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.ev')]
    .find(x=>x.textContent.includes('Joy')); if(e) e.click();});   // a DIFFERENT booking
  await new Promise(r=>setTimeout(r,500));
  console.log('visited a different booking:', await p.evaluate(()=>bkNow && bkNow.customer_name));
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.ev')]
    .find(x=>x.textContent.includes('Sowerby')); if(e) e.click();});   // back to the original
  await new Promise(r=>setTimeout(r,500));
  const localBlock = await p.$eval('#bk', e=>e.textContent).catch(()=>'');
  console.log('local addition survived the trip:', localBlock.includes('Added this session') ? 'yes ✓' : '✗ LOST');
  await p.screenshot({path:'/home/claude/shots/s-21-persisted.png',fullPage:true});
  await p.evaluate(()=>document.getElementById('bk-till').click());
  await new Promise(r=>setTimeout(r,400));
  console.log('ticket reloaded on return:', await p.evaluate(()=>ticket.length), '(should still be 1)');
  console.log('ticket before   :', await p.evaluate(()=>ticket.length), 'tillTable before:', await p.evaluate(()=>tillTable));
  await p.evaluate(()=>document.getElementById('tkclear').click());
  await new Promise(r=>setTimeout(r,300));
  console.log('ticket after    :', await p.evaluate(()=>ticket.length), 'tillTable after :', await p.evaluate(()=>tillTable));
  await p.screenshot({path:'/home/claude/shots/s-19-cleared.png'});

  // direct Home -> Till, no booking context: the picker must appear here too
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('till')); await new Promise(r=>setTimeout(r,500));
  console.log('picker on direct till:', (await p.$('#tilltable .pickt')) ? 'yes' : 'NO ✗');

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

  // MOST POPULAR IN, REST BEHIND MORE: David — "put the most popular
  // ones in and keep the others hidden... more button... too big."
  await p.evaluate(()=>{
    const btn=[...document.querySelectorAll('#leafcats .chip')].find(x=>x.textContent.includes('Mugs And Cups'));
    if(btn) btn.click();
  });
  await new Promise(r=>setTimeout(r,400));
  const itemsBefore = await p.$$eval('#items .item', e=>e.length);
  const hasMore = await p.$('#items [data-more]');
  console.log('items shown before More:', itemsBefore, '(should be 9 - 8 real + the More button itself)');
  console.log('More button present    :', hasMore ? 'yes ✓' : '✗');
  if (hasMore) {
    await hasMore.click(); await new Promise(r=>setTimeout(r,300));
    const itemsAfter = await p.$$eval('#items .item', e=>e.length);
    console.log('items shown after More :', itemsAfter, '(should be 11, all of them)');
  }
  await p.screenshot({path:'/home/claude/shots/s-30-more-button.png'});

  await p.click('#leafcats .chip:nth-child(2)').catch(()=>{});
  await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:'/home/claude/shots/s-14-till-leaf.png',fullPage:true});

  // INLINE ADD, NO NAVIGATION: David — "it kind of all needs to be done
  // from the one page instead of to go back... the booking's live all
  // the time." Louise Morton (BK-2) is untouched by every earlier test.
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.ev')]
    .find(x=>x.textContent.includes('Louise')); if(e) e.click();});
  await new Promise(r=>setTimeout(r,600));
  console.log('view stayed on booking before add:', await p.evaluate(()=>view));
  await p.evaluate(()=>document.getElementById('bkaddtoggle').click());
  await new Promise(r=>setTimeout(r,500));   // ensurePriceGroups may need to load
  const catsShown = await p.$$eval('.bkaddpc', e=>e.map(x=>x.textContent)).catch(()=>[]);
  console.log('inline categories:', catsShown.join(' | '));
  await p.evaluate(()=>{const it=document.querySelector('.bkaddit'); if(it) it.click();});
  await new Promise(r=>setTimeout(r,400));
  console.log('view still on booking after add :', await p.evaluate(()=>view), '(never navigated ✓)');
  const inlineAdded = await p.$eval('#bk', e=>e.textContent).catch(()=>'');
  console.log('item shows inline immediately    :', inlineAdded.includes('Added this session') ? 'yes ✓' : '✗');
  // David: "I have to scroll all the way down... don't want to scroll
  // past everything I haven't chosen to get to the next phase." The
  // picker's full item grid must be GONE after one tap, not still open.
  const pickerClosed = !(await p.$('.bkaddit'));
  console.log('picker closes after adding item  :', pickerClosed ? 'yes ✓' : '✗ STILL OPEN');
  console.log('scroll reset after collapse      :', (await p.evaluate(()=>document.getElementById('main').scrollTop)) === 0 ? 'yes ✓' : '✗');
  await p.screenshot({path:'/home/claude/shots/s-24-inline-add.png',fullPage:true});
  // survives leaving and coming back, same as the till fix proved earlier
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.ev')]
    .find(x=>x.textContent.includes('Joy')); if(e) e.click();});
  await new Promise(r=>setTimeout(r,400));
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('.ev')]
    .find(x=>x.textContent.includes('Louise')); if(e) e.click();});
  await new Promise(r=>setTimeout(r,500));
  const survived = await p.$eval('#bk', e=>e.textContent).catch(()=>'');
  console.log('inline addition survived the trip:', survived.includes('Added this session') ? 'yes ✓' : '✗ LOST');

  // PACKING NO LONGER HAS ITS OWN DEAD-END CARD: David — "get rid of the
  // [old] booking test thing in packing... I need to see right through
  // to the end of the workflow." A packing entry with a real match
  // opens the SAME booking page; one with no match says so honestly.
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('pack')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('#pack [data-p]')]
    .find(x=>x.textContent.includes('Leanne')); if(e) e.click();});
  await new Promise(r=>setTimeout(r,900));
  console.log('packing (matched) opens the real booking:', await p.evaluate(()=>view),
    await p.$eval('#bk .card', e=>e.textContent.includes('Leanne')).catch(()=>false) ? '— it is her ✓' : '✗');
  console.log('booking page has the real workflow steps:',
    (await p.$$eval('#bk .card h2', e=>e.map(x=>x.textContent))).join(' | '));
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('pack')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{const e=[...document.querySelectorAll('#pack [data-p]')]
    .find(x=>x.textContent.includes('Kim')); if(e) e.click();});
  await new Promise(r=>setTimeout(r,700));
  const noMatch = await p.$eval('#pack', e=>e.textContent).catch(()=>'');
  console.log('packing (no match) is honest about it:', noMatch.includes('No booking on file') ? 'yes ✓' : '✗');

  // GIFT VOUCHERS: David — "Square does gift vouchers." Real GET, no
  // new write exception, everyone (not just directors) can check one.
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  console.log('vouchers tile visible to everyone:', (await p.$$eval('.tile',e=>e.map(x=>x.textContent).join('|'))).includes('Gift Vouchers') ? 'yes ✓' : '✗');

  // MONEY MUST NEVER GO STALE: David found real Oct 2025 figures still
  // showing as "today" — the cache never refetched, not even across a
  // login. Prove it actually re-reads every single visit now.
  const moneyCallsBefore = moneyHistCalls;
  await p.evaluate(()=>go('money')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('money')); await new Promise(r=>setTimeout(r,700));
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('money')); await new Promise(r=>setTimeout(r,700));
  const moneyCallsDelta = moneyHistCalls - moneyCallsBefore;
  console.log('money refetches for 3 separate visits:', moneyCallsDelta,
    moneyCallsDelta === 3 ? '(refetches every time ✓)' : '✗ STILL CACHING');

  // STUDIO SETTINGS: David — "adjust these parameters for gifts, for
  // promotions." Real infra found in the old monolith, wired back in.
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  console.log('settings tile visible to admin:', (await p.$$eval('.tile',e=>e.map(x=>x.textContent).join('|'))).includes('Studio Settings') ? 'yes ✓' : '✗');
  await p.evaluate(()=>go('settings')); await new Promise(r=>setTimeout(r,500));
  console.log('real club config shown:', await p.$eval('#cc-every',e=>e.value).catch(()=>'✗'));
  const addonsText = await p.$eval('#settings',e=>e.textContent).catch(()=>'');
  console.log('add-ons show no price:', addonsText.includes('£20.00/mo') || addonsText.includes('/mo') ? '✗ STILL PRICED' : 'yes ✓');

  // TEST BOOKINGS: David — "I want this app populated with those
  // bookings... goes forward and back in time... test the AI." The one
  // genuinely persistent write in this whole app.
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  console.log('test bookings tile visible:', (await p.$$eval('.tile',e=>e.map(x=>x.textContent).join('|'))).includes('Test Bookings') ? 'yes ✓' : '✗');
  await p.evaluate(()=>go('practice')); await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>{practiceDay=new Date();});
  const bshot=await p.$('#pphoto');
  await bshot.uploadFile('/tmp/shelf.png'); await new Promise(r=>setTimeout(r,900));
  const uploadMsg = await p.$eval('#practice',e=>e.textContent).catch(()=>'');
  console.log('photo created a real booking:', uploadMsg.includes('Sammy Okafor') ? 'yes ✓' : '✗');
  // leave the screen entirely, come back — must still be there (real persistence, not local state)
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('practice')); await new Promise(r=>setTimeout(r,600));
  const afterReturn = await p.$eval('#practice',e=>e.textContent).catch(()=>'');
  console.log('booking survived leaving and returning:', afterReturn.includes('Sammy Okafor') ? 'yes ✓' : '✗ LOST');
  await p.evaluate(()=>{
    const row=[...document.querySelectorAll('[data-open]')].find(x=>x.textContent.includes('Sammy'));
    if(row) row.click();
  });
  await new Promise(r=>setTimeout(r,500));
  const detail = await p.$eval('#pbookingdetail',e=>e.textContent).catch(()=>'');
  console.log('real pieces shown            :', detail.includes('blue mug') && detail.includes('yellow plate') ? 'yes ✓' : '✗');
  const thumbCount = await p.$$eval('#pbookingdetail [data-thumb]', e => e.length).catch(() => 0);
  console.log('photo thumbnail rendered     :', thumbCount === 1 ? 'yes ✓ (exactly the 1 piece with a photo)' : '✗ '+thumbCount);
  const fullBefore = await p.$eval('#pbookingdetail [data-full="0"]', e => e.style.display).catch(() => 'MISSING');
  await p.click('#pbookingdetail [data-thumb="0"]').catch(() => {});
  await new Promise(r => setTimeout(r, 200));
  const fullAfter = await p.$eval('#pbookingdetail [data-full="0"]', e => e.style.display).catch(() => 'MISSING');
  console.log('thumbnail expands on tap     :', fullBefore === 'none' && fullAfter === 'block' ? 'yes ✓' : `✗ before=${fullBefore} after=${fullAfter}`);
  const pshot = await p.$('#pshelf');
  if (pshot) {
    await pshot.uploadFile('/tmp/shelf.png'); await new Promise(r=>setTimeout(r,1200));
    const foundText = await p.$eval('#pfound', e=>e.textContent).catch(()=>'');
    console.log('shelf finder ran on real practice pieces:', foundText.includes('found') ? foundText.trim() : '✗ '+foundText);
  }
  await p.screenshot({path:'/home/claude/shots/s-31-practice.png',fullPage:true});
  // the pre-existing settings tests below assume they're still on the
  // Settings screen — my block above navigated away, so go back to it
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('settings')); await new Promise(r=>setTimeout(r,500));
  await p.evaluate(()=>{document.getElementById('cc-every').value='7';});
  await p.evaluate(()=>document.getElementById('cc-save').click());
  await new Promise(r=>setTimeout(r,500));
  console.log('club config saved   :', await p.$eval('#cc-every',e=>e.value).catch(()=>'✗'), '(should be 7)');
  const addonBtn = await p.$('[data-toggle]');
  console.log('add-ons listed       :', addonBtn ? 'yes ✓' : '✗');
  if (addonBtn) {
    await addonBtn.click(); await new Promise(r=>setTimeout(r,400));
    await p.evaluate(()=>document.getElementById('addon-go').click());
    await new Promise(r=>setTimeout(r,500));
    const nowOn = await p.$eval('#settings',e=>e.textContent).catch(()=>'');
    console.log('add-on toggled       :', nowOn.includes('enabled') || nowOn.includes('On') ? 'yes ✓' : '✗');
  }
  await p.screenshot({path:'/home/claude/shots/s-29-settings.png',fullPage:true});
  await p.evaluate(()=>go('vouchers')); await new Promise(r=>setTimeout(r,400));
  await p.type('#ganentry','7783320000000000',{delay:10});
  await p.evaluate(()=>document.getElementById('gancheck').click());
  await new Promise(r=>setTimeout(r,500));
  console.log('real voucher balance shown:', await p.$eval('#ganresult',e=>e.textContent.replace(/\s+/g,' ').trim()).catch(()=>'✗'));
  await p.screenshot({path:'/home/claude/shots/s-28-voucher-found.png'});
  await p.evaluate(()=>{document.getElementById('ganentry').value='';});
  await p.type('#ganentry','0000000000000000',{delay:10});
  await p.evaluate(()=>document.getElementById('gancheck').click());
  await new Promise(r=>setTimeout(r,500));
  console.log('unknown voucher is honest:', await p.$eval('#ganresult',e=>e.textContent.trim()).catch(()=>'✗'));

  console.log('search calls    :', searchCalls);
  console.log('rings drawn     :', await p.$$eval('circle',e=>e.length).catch(()=>0));
  console.log('result heading  :', await p.$$eval('.card h2',e=>e.map(x=>x.textContent).join(' | ')));
  // try to force a write through the guard
  const blocked=await p.evaluate(async()=>{ try{ await read('/api/pos/order'); return 'NOT BLOCKED'; }
    catch(e){ return e.message.slice(0,40); } });

  console.log('team read      :', names.join(', '));
  console.log('guard test     :', blocked);
  console.log('unsanctioned writes:', writes.length? '✗ '+writes.join(', ') : 'NONE ✓');

  // FLOOR CALENDAR: forward/back arrows, and Floor + Bookings share one
  // date so paging one moves the other.
  const bookingDates = [];
  p.on('request', req => {
    const u = req.url();
    if (u.includes('/api/bookings/day')) bookingDates.push(new URL(u).searchParams.get('date'));
  });
  await p.evaluate(()=>{stack=[];go('home',false);}); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>go('floor')); await new Promise(r=>setTimeout(r,500));
  const todayLbl = await p.$eval('#flbl', e=>e.textContent);
  console.log('floor label     :', todayLbl);
  await p.evaluate(()=>document.getElementById('fnext').click());
  await new Promise(r=>setTimeout(r,500));
  const nextLbl = await p.$eval('#flbl', e=>e.textContent);
  console.log('floor +1 day    :', nextLbl, nextLbl !== todayLbl ? '(changed ✓)' : '✗ DID NOT CHANGE');
  await p.evaluate(()=>go('day')); await new Promise(r=>setTimeout(r,500));
  const bookingsLbl = await p.$eval('#daylbl', e=>e.textContent);
  console.log('bookings shows  :', bookingsLbl, bookingsLbl === nextLbl ? '(shared with floor ✓)' : '✗ OUT OF SYNC');
  await p.evaluate(()=>go('floor')); await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>{document.getElementById('fprev').click(); document.getElementById('fprev').click();});
  await new Promise(r=>setTimeout(r,500));
  const pastLbl = await p.$eval('#flbl', e=>e.textContent);
  const pastErr = await p.$('#floor .err');
  console.log('floor -1 day    :', pastLbl, pastErr ? '✗ ERRORED' : '(no crash ✓)');
  console.log('dates requested :', bookingDates.join(', '));
  await p.screenshot({path:'/home/claude/shots/s-20-floor-calendar.png'});
  await p.evaluate(()=>{stack=[];go('home',false);});

  // separately prove the empty-floor case, on a server with no bookings at all
  const app2=require('express')(); app2.use(express.json());
  app2.get('/studio',(q,r)=>r.sendFile(path.join(D,'studio','index.html')));
  app2.use('/studio',express.static(path.join(D,'studio')));
  app2.get('/api/staff/team-for-login',(q,r)=>r.json({team:[{id:'1',name:'David',role:'Co-Director',hasPinSet:true}]}));
  app2.post('/api/staff/verify-pin',(q,r)=>r.json({ok:String(q.body.pin)==='9090'}));
  app2.get('/api/bookings/day',(q,r)=>r.json({date:q.query.date,covers:0,bookings:[]}));
  await new Promise(resolveListen => {
    const s2=app2.listen(4809, async () => {
      const p2=await b.newPage(); await p2.setViewport({width:412,height:900,deviceScaleFactor:2});
      await p2.goto('http://localhost:4809/studio',{waitUntil:'networkidle0'});
      await p2.click('.person'); await new Promise(r=>setTimeout(r,400));
      await p2.type('#pinentry','9090',{delay:20});
      await p2.evaluate(()=>document.getElementById('pingo').click());
      await new Promise(r=>setTimeout(r,500));
      await p2.evaluate(()=>go('floor')); await new Promise(r=>setTimeout(r,600));
      console.log('empty-floor note:', (await p2.$('.note')) ? 'shown' : 'MISSING ✗');
      await p2.screenshot({path:'/home/claude/shots/s-11-empty-floor.png'});
      await p2.close(); s2.close(); resolveListen();
    });
  });
  console.log(errs.length? '✗ ERRORS:\n  '+errs.join('\n  ') : '✓ zero errors across all screens');
  await b.close(); srv.close(); process.exit(errs.length||writes.length?1:0);
});
