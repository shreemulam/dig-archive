// Enriches every record's gallery up to 5 images (primary + 4) from
// AIC + Met open-access APIs and Wikimedia Commons. Legal-only, relevance-filtered.
// Run: node scripts/enrich-images.mjs
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('records.json','utf8'));
const R = data.records;
const sleep = ms => new Promise(r=>setTimeout(r, ms));
const UA = {headers:{'User-Agent':'dig-archive-enrich/1.0 (personal project)'}};
const wm = f => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(f) + '?width=900';
const BAD_EXT = /\.(pdf|djvu|svg|ogv|webm|ogg|oga|stl|mid|map|tiff?)$/i;
const TARGET = 5;

const toks = s => [...new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g)||[]))];
const lastName = name => { const parts = name.split(/\s+/); return (parts[parts.length-1]||'').toLowerCase(); };
const cleanCap = f => f.replace(/\.[a-z]{3,4}$/i,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().slice(0,64).toUpperCase();

async function aic(q, mustMatch){
  try{
    const r = await fetch(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&limit=8&fields=title,image_id,is_public_domain,artist_title,date_display`, UA);
    const d = await r.json();
    return (d.data||[])
      .filter(a=>a.is_public_domain && a.image_id && (!mustMatch || (a.artist_title||'').toLowerCase().includes(mustMatch)))
      .slice(0,3)
      .map(a=>({src:`https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
                cap:`${(a.title||'').slice(0,48).toUpperCase()}${a.date_display?' · '+a.date_display:''} · AIC`}));
  }catch(e){ return []; }
}

async function met(q, mustMatch){
  try{
    const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(q)}&hasImages=true`, UA);
    const ids = ((await r.json()).objectIDs||[]).slice(0,4);
    const out = [];
    for(const id of ids){
      await sleep(200);
      try{
        const o = await (await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, UA)).json();
        if(o.isPublicDomain && o.primaryImageSmall &&
           (!mustMatch || (o.artistDisplayName||'').toLowerCase().includes(mustMatch) || (o.title||'').toLowerCase().includes(mustMatch)))
          out.push({src:o.primaryImageSmall, cap:`${(o.title||'').slice(0,48).toUpperCase()}${o.objectDate?' · '+o.objectDate:''} · MET`});
        if(out.length>=2) break;
      }catch(e){}
    }
    return out;
  }catch(e){ return []; }
}

async function commons(q, keyToks, n){
  try{
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=10&format=json&srsearch=${encodeURIComponent(q)}`, UA);
    const d = await r.json();
    return (d.query?.search||[])
      .map(x=>x.title.replace(/^File:/,''))
      .filter(f=>!BAD_EXT.test(f) && keyToks.some(t=>f.toLowerCase().includes(t)))
      .slice(0,n)
      .map(f=>({src:wm(f), cap:cleanCap(f)}));
  }catch(e){ return []; }
}

let enriched=0, total=0;
for(const [id, rec] of Object.entries(R)){
  const existing = [rec.img, ...(rec.gallery||[]).map(g=>g.src)].filter(Boolean);
  if(existing.length >= TARGET){ console.log(id.padEnd(22),'already rich'); continue; }

  const name = rec.byline?.name || rec.title;
  const ln = lastName(name);
  const keyToks = [...new Set([...toks(rec.title), ...toks(name)])];
  let cands = [];

  if(rec.kind==='ARTIST'){
    cands = [...await aic(name, ln), ...await met(name, ln)];
    await sleep(1200);
    cands.push(...await commons(name, keyToks, 3));
  } else if(rec.kind==='ARTWORK'){
    cands = [...await aic(rec.title, null), ...await met(rec.title, null)];
    await sleep(1200);
    cands.push(...await commons(`${rec.title} ${ln!==rec.title.toLowerCase()?name:''}`, keyToks, 3));
  } else if(rec.kind==='ARCHITECTURE'){
    cands = await commons(rec.title, keyToks, 4);
    await sleep(1500);
    cands.push(...await commons(rec.title+' interior', keyToks, 2));
  } else {
    cands = await commons(rec.title, keyToks, 4);
    if(name && name!==rec.title && cands.length<3){
      await sleep(1500);
      cands.push(...await commons(name, keyToks, 3));
    }
  }

  // dedupe against existing + within candidates
  const seen = new Set(existing);
  const fresh = [];
  for(const c of cands){
    if(seen.has(c.src)) continue;
    seen.add(c.src); fresh.push(c);
  }
  const room = TARGET - existing.length;
  const add = fresh.slice(0, room);
  if(add.length){
    if(!rec.img){ const first = add.shift(); rec.img = first.src; rec.capRight = rec.capRight || first.cap; }
    if(add.length) rec.gallery = [...(rec.gallery||[]), ...add];
    enriched++; total += add.length + (existing.length===0?1:0);
  }
  console.log(id.padEnd(22), `+${add.length}`, `(now ${[rec.img,...(rec.gallery||[]).map(g=>g.src)].filter(Boolean).length})`);
  await sleep(1500);
}

fs.writeFileSync('records.json', JSON.stringify(data, null, 2));
const ids = Object.keys(R);
console.log(`\nenriched ${enriched} records (+${total} images)`);
console.log('records with 3+ images:', ids.filter(i=>[R[i].img,...(R[i].gallery||[])].filter(Boolean).length>=3).length, '/', ids.length);
console.log('records with no image:', ids.filter(i=>!R[i].img).length);
