/* Walk every screen of the studio app against a stand-in server that
   returns realistic shapes, and REFUSE to pass if any write is attempted. */
const express=require('express'), path=require('path'), P=require('puppeteer-core');
const app=express(); const D=__dirname;
const writes=[];
app.use((q,_r,n)=>{ if(q.method!=='GET') writes.push(q.method+' '+q.path); n(); });
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
app.get('/api/pos/items',(q,r)=>r.json({total:5,groups:[
 {category:'PB Mugs And Cups',items:[{name:'Mug',price:19.97},{name:'Espresso cup',price:12.5}]},
 {category:'Hot Drinks',items:[{name:'Latte',price:3.4},{name:'Tea',price:2.6}]},
 {category:'S. Pottery Painting Sessions',items:[{name:'Studio fee',price:10.74}]}]}));
app.get('/api/packing/queue',(q,r)=>r.json({count:2,pieces:[
 {booking_id:'Lindsay Moulin',piece_type:'Hamster',status:'fired',notes:'NOT PAID — charge at collection'},
 {booking_id:'Olivia Smethhust',piece_type:'Bird dish',status:'fired'}]}));
app.get('/api/takings/today',(q,r)=>r.json({value:1284.5,label:'today',synced:true}));
app.get('/api/takings/breakdown',(q,r)=>r.json({categories:[
 {category:'PB Mugs And Cups',revenue_cents:42000},{category:'Hot Drinks',revenue_cents:19800}]}));
app.get('/api/floor/active',(q,r)=>r.json({bookings:[]}));

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
  // try to force a write through the guard
  const blocked=await p.evaluate(async()=>{ try{ await read('/api/pos/order'); return 'NOT BLOCKED'; }
    catch(e){ return e.message.slice(0,40); } });

  console.log('team read      :', names.join(', '));
  console.log('guard test     :', blocked);
  console.log('writes attempted:', writes.length? writes.join(', ') : 'NONE ✓');
  console.log(errs.length? '✗ ERRORS:\n  '+errs.join('\n  ') : '✓ zero errors across all screens');
  await b.close(); srv.close(); process.exit(errs.length||writes.length?1:0);
});
