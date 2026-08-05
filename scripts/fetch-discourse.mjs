// Bakes real internet discussion into records.json.
// Sources: Hacker News (Algolia API) + Bluesky public search. Run: node scripts/fetch-discourse.mjs
import fs from 'node:fs';

const QUERIES = {
  kiss:'Klimt The Kiss', wave:'Hokusai Great Wave', starry:'Van Gogh Starry Night',
  scream:'Munch The Scream painting', pearl:'Girl with a Pearl Earring', adele:'Klimt Woman in Gold',
  'nazi-loot':'nazi looted art restitution', 'degenerate-art':'degenerate art exhibition nazi',
  'monuments-men':'monuments men looted art', gurlitt:'Gurlitt art trove',
  japonisme:'japonisme', 'ukiyo-e':'ukiyo-e prints', 'prussian-blue':'prussian blue pigment',
  ultramarine:'ultramarine lapis lazuli pigment', 'camera-obscura':'camera obscura Vermeer',
  krakatoa:'Krakatoa eruption 1883', expressionism:'german expressionism art',
  eiffel:'Eiffel Tower history', fallingwater:'Fallingwater Frank Lloyd Wright',
  bauhaus:'Bauhaus design school', helvetica:'Helvetica typeface',
  'chanel-lbd':'Chanel little black dress', jordan1:'Air Jordan 1 banned',
  'red-lipstick':'red lipstick history war', 'warhol-soup':'Warhol soup cans',
  hiphop:'hip hop 1973 Kool Herc', 'worlds-fair-1889':'1889 worlds fair Paris',
  schiaparelli:'Elsa Schiaparelli', westwood:'Vivienne Westwood punk',
  dior:'Dior New Look 1947', balenciaga:'Cristobal Balenciaga couture',
  ysl:'Yves Saint Laurent Le Smoking', mcqueen:'Alexander McQueen fashion',
  kawakubo:'Rei Kawakubo Comme des Garcons', genji:'Tale of Genji',
  origin:'Origin of Species Darwin', 'orwell-1984':'Orwell 1984 novel',
  'silent-spring':'Silent Spring Rachel Carson', frankenstein:'Frankenstein Mary Shelley',
  gutenberg:'Gutenberg printing press', penguin:'Penguin books cover design',
  dali:'Salvador Dali', duchamp:'Duchamp Fountain urinal', basquiat:'Basquiat',
  banksy:'Banksy shredder auction', 'mona-lisa':'Mona Lisa theft 1911',
  'art-heists':'Gardner museum heist', 'ghent-altarpiece':'Ghent Altarpiece stolen',
  'rose-valland':'Rose Valland art', 'yves-klein':'Yves Klein blue IKB',
  monet:'Monet Giverny water lilies', mondrian:'Mondrian De Stijl grid',
  debussy:'Debussy La Mer', caligari:'Cabinet of Dr Caligari',
  photography:'first photograph Niepce daguerreotype', emoji:'emoji history MoMA',
  manga:'manga history Hokusai Tezuka', streetwear:'Supreme drop streetwear resale',
  tschichold:'Jan Tschichold typography',
};

// StackExchange site per record — only where a genuinely good site exists
const SE_SITES = {
  helvetica:'graphicdesign', bauhaus:'graphicdesign', penguin:'graphicdesign',
  'nazi-loot':'history', 'degenerate-art':'history', 'monuments-men':'history',
  gurlitt:'history', 'worlds-fair-1889':'history', eiffel:'history',
  gutenberg:'history', krakatoa:'history', 'red-lipstick':'history',
  japonisme:'history', 'ukiyo-e':'history', expressionism:'history',
  kiss:'history', wave:'history', starry:'history', scream:'history', pearl:'history',
  frankenstein:'literature', 'orwell-1984':'literature', genji:'literature',
  origin:'literature', 'silent-spring':'literature',
  'camera-obscura':'photo', 'prussian-blue':'chemistry', ultramarine:'chemistry',
  fallingwater:'engineering',
  'mona-lisa':'history', 'art-heists':'history', 'ghent-altarpiece':'history',
  'rose-valland':'history', dali:'history', duchamp:'history', monet:'history',
  photography:'photo', caligari:'movies', manga:'anime', debussy:'music',
  tschichold:'graphicdesign', mondrian:'graphicdesign',
};

const sleep = ms => new Promise(r=>setTimeout(r, ms));
const clean = t => t.replace(/\s+/g,' ').trim()
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');

async function se(q, site){
  if(!site) return [];
  try{
    const r = await fetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&q=${encodeURIComponent(q)}&site=${site}&pagesize=4`);
    const d = await r.json();
    return (d.items||[])
      .filter(i=>i.score>=4)
      .slice(0,2)
      .map(i=>({src:'SE', text:clean(i.title), by:site+'.stackexchange', score:i.score,
                comments:i.answer_count||0, url:i.link}));
  }catch(e){ return []; }
}

async function hn(q){
  try{
    const r = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=4`);
    const d = await r.json();
    return (d.hits||[])
      .filter(h=>h.title && h.points>=25)
      .slice(0,2)
      .map(h=>({src:'HN', text:clean(h.title), by:h.author, score:h.points,
                comments:h.num_comments||0,
                url:`https://news.ycombinator.com/item?id=${h.objectID}`}));
  }catch(e){ return []; }
}

async function bsky(q){
  try{
    const r = await fetch(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=12&sort=top`);
    const d = await r.json();
    return (d.posts||[])
      .filter(p=>{
        const t = p.record?.text||'';
        return (p.likeCount||0)>=40 && t.length>=40 && t.length<=300 && !/^RT /.test(t);
      })
      .slice(0,2)
      .map(p=>{
        const rkey = p.uri.split('/').pop();
        return {src:'BSKY', text:clean(p.record.text), by:'@'+p.author.handle,
                score:p.likeCount, comments:p.replyCount||0,
                url:`https://bsky.app/profile/${p.author.handle}/post/${rkey}`};
      });
  }catch(e){ return []; }
}

const data = JSON.parse(fs.readFileSync('records.json','utf8'));
let filled = 0;
for(const [id, q] of Object.entries(QUERIES)){
  if(!data.records[id]) continue;
  const s = await se(q, SE_SITES[id]);
  const [h, b] = [await hn(q), await bsky(q)];
  // substance first (SE questions, HN threads), chatter after (Bluesky)
  const items = [...s, ...h, ...b].slice(0,4);
  if(items.length){ data.records[id].discourse = items; filled++; }
  else delete data.records[id].discourse;
  console.log(id.padEnd(18), s.length+' se', h.length+' hn', b.length+' bsky');
  await sleep(700);
}
fs.writeFileSync('records.json', JSON.stringify(data, null, 2));
console.log(`\ndiscourse baked for ${filled}/${Object.keys(QUERIES).length} records`);
