const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const TYPES = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.ico':'image/x-icon'};
http.createServer((req,res)=>{
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/admin/dashboard-local.html';
  // API stubs — return empty-ish JSON so front-end doesn't hard-fail on fetch
  if (u.startsWith('/api/')) {
    res.writeHead(200,{'Content-Type':'application/json'});
    // shape a few common ones
    if (u.includes('/floor/active')) return res.end(JSON.stringify({bookings:[],tables:[]}));
    if (u.includes('/floor/tables')) return res.end(JSON.stringify({tables:[]}));
    return res.end(JSON.stringify({ok:true,data:[],items:[],transactions:[]}));
  }
  let fp = path.join(ROOT, u);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp,(err,buf)=>{
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200,{'Content-Type':TYPES[path.extname(fp)]||'application/octet-stream'});
    res.end(buf);
  });
}).listen(4173,()=>console.log('serving on 4173'));
