// Fixes what Commons keyword search gets wrong:
//  1. ARTIST records lead with the artist's ARTWORK, not their face (portraits demoted to gallery)
//  2. Everything else leads with Wikipedia's human-curated lead image (Commons-hosted = free)
//  3. Near-duplicate files ("X.jpg" vs "X (cropped).jpg") collapse to one
// Run: node scripts/hero-images.mjs
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('records.json','utf8'));
const R = data.records;
const sleep = ms => new Promise(r=>setTimeout(r, ms));
const UA = {headers:{'User-Agent':'dig-archive-hero/1.0 (personal project)'}};
const lastName = n => (n.split(/\s+/).pop()||'').toLowerCase();
const toks = s => [...new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g)||[]))];

// collapse "Foo (cropped).jpg", "Foo 2.jpg", "Foo, 1923.jpg" to a comparable stem
function stem(url){
  let f = decodeURIComponent(url).split('FilePath/')[1] || url;
  f = f.split('?')[0].replace(/\.[a-z]{3,4}$/i,'').toLowerCase();
  f = f.replace(/\((cropped|crop|detail|edit|retouched|colou?rized|small|large|\d+)\)/g,'');
  f = f.replace(/[_\-,]/g,' ').replace(/\b(cropped|crop|detail|edit|retouched)\b/g,'');
  f = f.replace(/\b(1[6-9]\d\d|20[0-2]\d)\b/g,'').replace(/\s+/g,' ').trim();
  return f;
}
const PORTRAIT_RE = /portrait|photo of|passport|self-?portrait|headshot|\bby [A-Z]/i;
const isPortraitish = cap => /portrait|passport|photo|headshot/i.test(cap||'');

async function artworksBy(name){
  const ln = lastName(name), out = [];
  try{
    const d = await (await fetch(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(name)}&limit=10&fields=title,image_id,is_public_domain,artist_title,date_display`, UA)).json();
    for(const a of (d.data||[])){
      if(a.is_public_domain && a.image_id && (a.artist_title||'').toLowerCase().includes(ln))
        out.push({src:`https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
                  cap:`${(a.title||'').slice(0,46).toUpperCase()}${a.date_display?' · '+a.date_display:''} · AIC`});
      if(out.length>=3) break;
    }
  }catch(e){}
  await sleep(350);
  if(out.length<3){
    try{
      const ids = ((await (await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(name)}&hasImages=true`, UA)).json()).objectIDs||[]).slice(0,6);
      for(const id of ids){
        await sleep(180);
        try{
          const o = await (await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, UA)).json();
          if(o.isPublicDomain && o.primaryImageSmall && (o.artistDisplayName||'').toLowerCase().includes(ln))
            out.push({src:o.primaryImageSmall, cap:`${(o.title||'').slice(0,46).toUpperCase()}${o.objectDate?' · '+o.objectDate:''} · MET`});
          if(out.length>=4) break;
        }catch(e){}
      }
    }catch(e){}
  }
  return out;
}

// Wikipedia lead image — human-curated; only accept Commons-hosted files (free by definition)
async function wikiLead(title, extraTok){
  try{
    const s = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&origin=*&srsearch=${encodeURIComponent(title)}`, UA)).json();
    const hits = (s.query?.search||[]).map(x=>x.title);
    for(const t of hits){
      await sleep(250);
      const sum = await (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`, UA)).json();
      if(sum.type === 'disambiguation') continue;
      const src = sum.originalimage?.source || sum.thumbnail?.source;
      if(!src || !src.includes('/wikipedia/commons/')) continue;   // en-local = non-free
      const blob = ((sum.title||'')+' '+(sum.description||'')+' '+(sum.extract||'')).toLowerCase();
      const need = toks(title).concat(extraTok?toks(extraTok):[]);
      const hitCount = need.filter(k=>blob.includes(k)).length;
      if(hitCount < Math.min(2, need.length)) continue;
      // upgrade thumbnail to a reasonable width
      const url = src.replace(/\/\d+px-/, '/900px-');
      return {src: url, cap: (sum.title||title).toUpperCase().slice(0,52)};
    }
  }catch(e){}
  return null;
}

async function openverse(q, n=2){
  try{
    const d = await (await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm,by,by-sa&page_size=8`, UA)).json();
    const need = toks(q);
    return (d.results||[])
      .filter(r=>r.url && need.filter(k=>((r.title||'')+' '+(r.tags||[]).map(t=>t.name).join(' ')).toLowerCase().includes(k)).length >= Math.min(2, need.length))
      .slice(0,n)
      .map(r=>({src:r.url, cap:((r.title||q).slice(0,44)+' · '+(r.license||'cc').toUpperCase()).toUpperCase()}));
  }catch(e){ return []; }
}

// context images for artists whose own work is still in copyright
async function artistContext(name){
  const out = [];
  for(const q of [`${name} studio`, `${name} house museum`, `${name} grave`]){
    const hits = await openverse(q, 1);
    out.push(...hits);
    if(out.length>=2) break;
    await sleep(400);
  }
  return out;
}

let artFixed=0, leadFixed=0, deduped=0, ovAdded=0, ctxAdded=0;
const ids = Object.keys(R);
for(const id of ids){
  const r = R[id];
  const name = r.byline?.name || r.title;
  let list = [ ...(r.img?[{src:r.img, cap:r.capRight||''}]:[]), ...(r.gallery||[]) ];

  if(r.kind === 'ARTIST'){
    const works = await artworksBy(name);
    if(works.length){
      const known = new Set(list.map(x=>x.src));
      const fresh = works.filter(w=>!known.has(w.src));
      list = [...fresh, ...list];            // their art leads, portraits follow
      if(fresh.length) artFixed++;
    } else if(list.length < 4){
      // work is under copyright — show where they made it instead
      const ctx = await artistContext(name);
      const known = new Set(list.map(x=>x.src));
      const fresh = ctx.filter(c=>!known.has(c.src));
      if(fresh.length){ list = [...list, ...fresh]; ctxAdded++; }
    }
  } else if(!r.img || /sunset|geograph|aerial|panorama|from the air/i.test(decodeURIComponent(r.img))){
    const lead = await wikiLead(r.title, name!==r.title?name:'');
    if(lead){
      const known = new Set(list.map(x=>x.src));
      if(!known.has(lead.src)){ list = [lead, ...list]; leadFixed++; }
      else { list = [lead, ...list.filter(x=>x.src!==lead.src)]; }
    }
  }
  if(list.length < 3 && r.kind !== 'ARTIST'){
    const ov = await openverse(r.title, 3 - list.length);
    const known = new Set(list.map(x=>x.src));
    const fresh = ov.filter(o=>!known.has(o.src));
    if(fresh.length){ list = [...list, ...fresh]; ovAdded++; }
  }

  // dedupe by filename stem, cap at 5
  const seenStem = new Set(), out = [];
  for(const item of list){
    const st = stem(item.src);
    if(seenStem.has(st)){ deduped++; continue; }
    seenStem.add(st); out.push(item);
  }
  const capped = out.slice(0,5);
  if(capped.length){
    r.img = capped[0].src;
    r.capRight = capped[0].cap || r.capRight;
    if(capped.length>1) r.gallery = capped.slice(1); else delete r.gallery;
  }
  console.log(id.padEnd(24), `${capped.length} imgs`, r.kind==='ARTIST'?'(artist)':'');
  await sleep(400);
}

fs.writeFileSync('records.json', JSON.stringify(data, null, 2));
console.log(`\nartworks promoted: ${artFixed} | wiki leads: ${leadFixed} | dupes collapsed: ${deduped} | openverse: ${ovAdded} | artist-context: ${ctxAdded}`);
console.log('imaged:', ids.filter(i=>R[i].img).length, '/', ids.length);
