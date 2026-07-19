const pptxgen = require('pptxgenjs');
const p = new pptxgen();
p.layout = 'LAYOUT_WIDE'; // 13.3 x 7.5

// The Kiln Cafe's own palette — the app IS this aesthetic
const BISQUE='F4ECE0', INK='2B2724', CLAY='B87946', TEAL='00897B',
      AMBER='F9A825', PLUM='5E35B1', CARD='FFFDF9', DUST='8A8175', WHITE='FFFFFF';
const T='Georgia', B='Calibri';

function bg(s){ s.background={color:BISQUE}; }
function title(s, txt, sub){
  s.addText(txt,{x:0.6,y:0.35,w:12.1,h:0.75,fontFace:T,fontSize:38,bold:true,color:INK,margin:0});
  if(sub) s.addText(sub,{x:0.6,y:1.05,w:12.1,h:0.4,fontFace:B,fontSize:15,color:DUST,margin:0});
}
function tile(s,x,y,w,h,fill,opts={}){
  s.addShape('roundRect',{x,y,w,h,fill:{color:fill},rectRadius:0.12,
    shadow:{type:'outer',color:'2B2724',opacity:0.18,blur:8,offset:3,angle:90},...opts});
}

// ── 1. TITLE ──────────────────────────────────────────────
let s=p.addSlide(); bg(s);
tile(s,0.9,1.5,11.5,3.4,CARD);
s.addText('GlazeUp',{x:1.4,y:2.0,w:10.5,h:1.1,fontFace:T,fontSize:60,bold:true,color:CLAY,margin:0});
s.addText('The Clean Build',{x:1.4,y:3.05,w:10.5,h:0.8,fontFace:T,fontSize:34,color:INK,margin:0});
s.addText('Architecture spec and staged rebuild plan  ·  The Kiln Cafe pilot  ·  19 July 2026',
  {x:1.4,y:3.85,w:10.5,h:0.5,fontFace:B,fontSize:15,color:DUST,margin:0});
s.addText('Every number in this deck measured from the live code and database — nothing estimated.',
  {x:0.9,y:5.4,w:11.5,h:0.4,align:'center',fontFace:B,fontSize:13,italic:true,color:DUST,margin:0});

// ── 2. WHERE WE STAND (verified) ─────────────────────────
s=p.addSlide(); bg(s);
title(s,'Where we stand — verified, not hoped','Functional audit run against the live build, 19 July, ~05:50');
const stats=[['51 / 51','tiles resolve to real, working code',TEAL],
             ['203 / 203','client API calls have live server routes',CLAY],
             ['0','dead-end screens anywhere in the app',PLUM],
             ['19','dead functions found and already stripped (8.6KB)',AMBER]];
stats.forEach((st,i)=>{
  const x=0.6+(i%2)*6.15, y=1.8+Math.floor(i/2)*2.5;
  tile(s,x,y,5.95,2.15,CARD);
  s.addText(st[0],{x:x+0.35,y:y+0.3,w:5.3,h:0.95,fontFace:T,fontSize:44,bold:true,color:st[2],margin:0});
  s.addText(st[1],{x:x+0.35,y:y+1.3,w:5.3,h:0.6,fontFace:B,fontSize:15,color:INK,margin:0});
});
s.addText('The app functions. The rebuild is about cleanliness and speed — not rescue.',
  {x:0.6,y:6.85,w:12.1,h:0.4,fontFace:B,fontSize:14,italic:true,color:DUST,margin:0});

// ── 3. THE DESIGN LAW ────────────────────────────────────
s=p.addSlide(); bg(s);
title(s,'The design law','Settled this week, in force everywhere — the fresh build inherits it whole');
const laws=[['Tiles only','Big glazed tiles all the way down. The Grid is gone — removed, verified unreachable.'],
 ['One tree each','Every person lands on their own home, built from their real role. No shared screens.'],
 ['Honest data','Live Square, read-only. No mock numbers, no example bookings, no placeholder staff. Empty means empty.'],
 ['Confess, never hang','Boot overlay names crashes. Watchdogs on login and home. Caches that can remember "empty".'],
 ['Cleo present','One shared voice resolver — junior voice everywhere, tour included.'],
 ['Floor plan is the hub','Hand-drawn, live tables, tap-through. The screensaver heart of the studio.']];
laws.forEach((l,i)=>{
  const x=0.6+(i%3)*4.15, y=1.75+Math.floor(i/3)*2.55;
  tile(s,x,y,3.95,2.25,CARD);
  s.addText(l[0],{x:x+0.3,y:y+0.25,w:3.35,h:0.5,fontFace:T,fontSize:19,bold:true,color:CLAY,margin:0});
  s.addText(l[1],{x:x+0.3,y:y+0.8,w:3.35,h:1.3,fontFace:B,fontSize:12.5,color:INK,margin:0});
});

// ── 4. THE PIECE JOURNEY ─────────────────────────────────
s=p.addSlide(); bg(s);
title(s,'The piece journey','One pipeline, five stages — each stage already has its live screen');
const stages=[['Photograph','at the table — the piece is born',TEAL],
              ['Dip','Kiln screen · tick + mark dipped',CLAY],
              ['Fire','Kiln screen · load + fire session',AMBER],
              ['Pack','Packing · AI says whose it is',PLUM],
              ['Collect','Collections · tap when taken',TEAL]];
stages.forEach((st,i)=>{
  const x=0.6+i*2.56;
  tile(s,x,2.6,2.2,1.9,st[2]);
  s.addText(st[0],{x:x,y:2.85,w:2.2,h:0.6,align:'center',fontFace:T,fontSize:20,bold:true,color:WHITE,margin:0});
  s.addText(st[1],{x:x+0.12,y:3.5,w:1.96,h:0.85,align:'center',fontFace:B,fontSize:11,color:WHITE,margin:0});
  if(i<4) s.addShape('rightArrow',{x:x+2.24,y:3.32,w:0.3,h:0.45,fill:{color:INK}});
});
s.addText('Queues are empty today because no real piece has been logged yet — the demo data is fully deleted. '+
  'The first genuine photograph tomorrow starts the live flow end to end.',
  {x:0.6,y:5.1,w:12.1,h:0.8,fontFace:B,fontSize:14,color:INK,margin:0});
s.addText('AI throughout: whole-tray scan (Packing + Collections) · find-by-photo (Labels) · shape match (Catalogue) · Learning tile watching real usage.',
  {x:0.6,y:6.0,w:12.1,h:0.7,fontFace:B,fontSize:12.5,italic:true,color:DUST,margin:0});

// ── 5. WHO SEES WHAT (leadership + kiln room) ────────────
s=p.addSlide(); bg(s);
title(s,'Who sees what — measured from the live role maps (1 of 2)','Each home tree is exactly these tiles, in this order');
const roles1=[
 ['Daisy — General Manager','15 tiles','assistant · floor-plan · progress · team · packing · dashboard · staff · stock · music · training · health-safety · whats-on · customer-demo · trial-reset · setup',CLAY],
 ['Jenny — Studio Executive','13 tiles','assistant · packing · kiln · stock · collections · floor-plan · labels · printqueue · piecematch · catalogue · music · training · health-safety',TEAL],
 ['Lucy — Ceramic Technician','12 tiles','assistant · floor-plan · kiln · piecematch · packing · collections · shapes · catalogue · stock · labels · training · health-safety',AMBER]];
roles1.forEach((r,i)=>{
  const y=1.7+i*1.8;
  tile(s,0.6,y,12.1,1.55,CARD);
  s.addText(r[0],{x:0.95,y:y+0.15,w:8,h:0.45,fontFace:T,fontSize:18,bold:true,color:INK,margin:0});
  s.addText(r[1],{x:10.8,y:y+0.18,w:1.6,h:0.4,align:'right',fontFace:B,fontSize:14,bold:true,color:r[3],margin:0});
  s.addText(r[2],{x:0.95,y:y+0.65,w:11.4,h:0.8,fontFace:B,fontSize:12,color:DUST,margin:0});
});
s.addText('+ Tell Daisy promoted for every staff role',{x:0.6,y:7.0,w:12.1,h:0.35,fontFace:B,fontSize:12,italic:true,color:DUST,margin:0});

// ── 6. WHO SEES WHAT (2) ─────────────────────────────────
s=p.addSlide(); bg(s);
title(s,'Who sees what (2 of 2)','Smaller trees, sharper jobs');
const roles2=[
 ['Ruby — Studio Assistant','10 tiles','assistant · floor-plan · staff · menu · tablecards · collections · packing · piecematch · training · health-safety',PLUM],
 ['Elliott — Marketing & Host By Post','7 tiles','assistant · floor-plan · community · branding · customer-demo · whats-on · health-safety',TEAL],
 ['Barista','6 tiles','menu · floor-plan · assistant · staff · training · health-safety',CLAY],
 ['Cleo — Chief Taster','4 tiles','assistant · floor-plan · community · menu',AMBER]];
roles2.forEach((r,i)=>{
  const y=1.7+i*1.32;
  tile(s,0.6,y,12.1,1.12,CARD);
  s.addText(r[0],{x:0.95,y:y+0.1,w:8,h:0.4,fontFace:T,fontSize:16,bold:true,color:INK,margin:0});
  s.addText(r[1],{x:10.8,y:y+0.12,w:1.6,h:0.35,align:'right',fontFace:B,fontSize:13,bold:true,color:r[3],margin:0});
  s.addText(r[2],{x:0.95,y:y+0.5,w:11.4,h:0.5,fontFace:B,fontSize:11.5,color:DUST,margin:0});
});
s.addText('By design: Studio Setup lives with GM + co-director only. Staff trees carry their job, not the admin.',
  {x:0.6,y:7.0,w:12.1,h:0.35,fontFace:B,fontSize:12.5,italic:true,color:INK,margin:0});

// ── 7. CUT TONIGHT ───────────────────────────────────────
s=p.addSlide(); bg(s);
title(s,'Already cut — nothing old is load-bearing','Every removal verified unreachable before deletion');
const cuts=[
 ['The Grid','Both buttons removed — header and the emergency fallback (now reloads). Zero live callers to the old system.'],
 ['19 dead functions','Abandoned drag suite, superseded logins, legacy voice picker, dead setup paths. 8.6KB gone, each re-verified zero-reference at the moment of removal.'],
 ['All demo data','4 bookings, 21 pieces, alerts, tasks, photos, sessions — swept from all 22 referencing tables. Fully deleted at Daisy\u2019s instruction, not archived.'],
 ['Every fake fallback','Mock revenue, example floor-plan covers, placeholder DEMO_STAFF login. The app now shows truth or says "couldn\u2019t load" — never fiction.']];
cuts.forEach((c,i)=>{
  const x=0.6+(i%2)*6.15, y=1.75+Math.floor(i/2)*2.5;
  tile(s,x,y,5.95,2.2,CARD);
  s.addText(c[0],{x:x+0.32,y:y+0.22,w:5.3,h:0.5,fontFace:T,fontSize:19,bold:true,color:CLAY,margin:0});
  s.addText(c[1],{x:x+0.32,y:y+0.78,w:5.3,h:1.3,fontFace:B,fontSize:12.5,color:INK,margin:0});
});
s.addText('Kept deliberately: 18 look-alike "orphans" that are genuinely wired via events — the tray scanner, AI cameras, floor-plan renderer. A blind strip would have killed them.',
  {x:0.6,y:6.75,w:12.1,h:0.6,fontFace:B,fontSize:12,italic:true,color:DUST,margin:0});

// ── 8. RE-ARCHITECTURE ───────────────────────────────────
s=p.addSlide(); bg(s);
title(s,'Re-architecture — combine where possible, measured','Counted in the live file this morning. Each pattern collapses into one shared helper.');
const rows=[
 ['316','raw fetch() calls','one api() — auth, timeout, JSON, errors in a single place'],
 ['69','catch { alert(...) } blocks','one toast() — consistent, glazed, never a browser alert'],
 ['50','hand-built full-screen modals','one glazedModal() — every dialog identical by construction'],
 ['17 + 12','FileReader blocks + camera launchers','one captureAndSend() — the whole photo-AI path in one function'],
 ['8','cache paint/save sites','one instantCache — the "remember empty" fix lives once, for every screen'],
 ['3,720','inline style attributes','shared tile + button classes — restyle the app in one file']];
rows.forEach((r,i)=>{
  const y=1.72+i*0.86;
  tile(s,0.6,y,12.1,0.72,i%2?CARD:'EFE5D6');
  s.addText(r[0],{x:0.85,y:y+0.1,w:1.5,h:0.5,fontFace:T,fontSize:20,bold:true,color:TEAL,margin:0});
  s.addText(r[1],{x:2.5,y:y+0.16,w:4.4,h:0.42,fontFace:B,fontSize:13,bold:true,color:INK,margin:0});
  s.addText('\u2192  '+r[2],{x:7.0,y:y+0.16,w:5.5,h:0.42,fontFace:B,fontSize:12,color:DUST,margin:0});
});
s.addText('Target modules: boot+auth · nav+tree · journey screens · AI capture · data+cache · Cleo+voice · admin. 873 functions become a few hundred, each with one home.',
  {x:0.6,y:6.95,w:12.1,h:0.45,fontFace:B,fontSize:12.5,italic:true,color:INK,margin:0});

// ── 9. STAGED EXECUTION ──────────────────────────────────
s=p.addSlide(); bg(s);
title(s,'The safe path — staged, gated, never all at once','Tonight proved the rule: every break followed a big sweep. So the rebuild ships in verified stages.');
const stg=[
 ['1','Build the shared helpers','api(), toast(), glazedModal(), captureAndSend(), instantCache — added alongside the old code, changing nothing yet.',TEAL],
 ['2','Adopt screen by screen','Each screen moves to the helpers one at a time. Gate: parse + all handlers resolve + a real screenshot from the studio phone.',CLAY],
 ['3','Split into modules','The one 29k-line file becomes the seven modules — mechanical moves only, behaviour already proven identical.',AMBER],
 ['4','Delete the legacy','Only now. Every old path verified zero-reference, same discipline as the 19 already stripped.',PLUM]];
stg.forEach((t,i)=>{
  const x=0.6+i*3.13;
  tile(s,x,1.9,2.95,3.6,CARD);
  s.addShape('roundRect',{x:x+0.25,y:2.15,w:0.62,h:0.62,rectRadius:0.1,fill:{color:t[3]}});
  s.addText(t[0],{x:x+0.25,y:2.19,w:0.62,h:0.55,align:'center',fontFace:T,fontSize:24,bold:true,color:WHITE,margin:0});
  s.addText(t[1],{x:x+0.25,y:2.95,w:2.45,h:0.75,fontFace:T,fontSize:15.5,bold:true,color:INK,margin:0});
  s.addText(t[2],{x:x+0.25,y:3.7,w:2.45,h:1.6,fontFace:B,fontSize:11,color:DUST,margin:0});
});
s.addText('One stage per session. The app stays working at every gate — Jenny never opens a broken screen.',
  {x:0.6,y:5.9,w:12.1,h:0.45,fontFace:B,fontSize:13.5,bold:true,color:INK,margin:0});

// ── 10. STILL OPEN ───────────────────────────────────────
s=p.addSlide(); bg(s);
title(s,'Still open — the honest list','Nothing hidden; each item has an owner and a shape');
const open=[
 ['Financials','One tap: "Pull all real Square history" on the Dashboard. Table now exists; 365 days of genuine takings land on first press. Owner: Daisy, 10 seconds.'],
 ['Staff messaging','Genuinely unbuilt — needs its own table, unread state, UI. A Stage-2 build, not a patch.'],
 ['Swipe navigation','In the code, untested on a real phone. First calm-morning device check.'],
 ['Drag-to-customise','Tap version live and saving. The grow-as-you-drag gesture needs on-device work.'],
 ['Token rotation','The GitHub token is still the old one. Rotate before anything else ships. Owner: Daisy.'],
 ['Square scopes','403 INSUFFICIENT_SCOPES on team-members — reconnect with wider read scopes when convenient.']];
open.forEach((o,i)=>{
  const x=0.6+(i%2)*6.15, y=1.7+Math.floor(i/2)*1.75;
  tile(s,x,y,5.95,1.5,CARD);
  s.addText(o[0],{x:x+0.3,y:y+0.14,w:5.35,h:0.42,fontFace:T,fontSize:16,bold:true,color:CLAY,margin:0});
  s.addText(o[1],{x:x+0.3,y:y+0.58,w:5.35,h:0.85,fontFace:B,fontSize:11,color:INK,margin:0});
});

// ── 11. TOMORROW ─────────────────────────────────────────
s=p.addSlide(); bg(s);
tile(s,0.9,1.3,11.5,4.6,CARD);
s.addText('Tomorrow morning',{x:1.4,y:1.7,w:10.5,h:0.8,fontFace:T,fontSize:40,bold:true,color:INK,margin:0});
s.addText([
 {text:'9:00 — the app works now. ',options:{bold:true,color:TEAL}},
 {text:'Login, trees, kiln, packing, collections: all live, all verified tonight.\n\n',options:{color:INK}},
 {text:'First real piece ',options:{bold:true,color:CLAY}},
 {text:'photographed at a table starts the genuine pipeline — the queues fill with truth.\n\n',options:{color:INK}},
 {text:'One tap ',options:{bold:true,color:AMBER}},
 {text:'on "Pull all real Square history" and a year of real takings appears on the dashboard.\n\n',options:{color:INK}},
 {text:'Then Stage 1 ',options:{bold:true,color:PLUM}},
 {text:'— the shared helpers — in the next session, in daylight, one gate at a time.',options:{color:INK}},
],{x:1.4,y:2.6,w:10.4,h:2.9,fontFace:B,fontSize:16,margin:0,lineSpacing:22});
s.addText('Built and measured overnight, 18–19 July 2026 · The Kiln Cafe · GlazeUp',
  {x:0.9,y:6.3,w:11.5,h:0.4,align:'center',fontFace:B,fontSize:12,italic:true,color:DUST,margin:0});

p.writeFile({fileName:'/mnt/user-data/outputs/GlazeUp-Clean-Build-Spec.pptx'})
 .then(()=>console.log('deck written'));
