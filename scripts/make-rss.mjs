// Generates rss.xml from drops.json + records.json. Run after adding a drop.
import fs from 'node:fs';
const drops = JSON.parse(fs.readFileSync('drops.json','utf8'));
const R = JSON.parse(fs.readFileSync('records.json','utf8')).records;
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const items = drops.slice().reverse().flatMap(d =>
  d.ids.filter(i=>R[i]).map(i=>`  <item>
    <title>${esc(R[i].title)} — new on DIG.ARCHIVE</title>
    <link>https://dig-archive.vercel.app/#/${i}</link>
    <guid isPermaLink="false">dig-${i}-${d.date}</guid>
    <pubDate>${new Date(d.date+'T12:00:00Z').toUTCString()}</pubDate>
    <description>${esc(R[i].fact)}</description>
  </item>`)).join('\n');
fs.writeFileSync('rss.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>DIG.ARCHIVE — new acquisitions</title>
  <link>https://dig-archive.vercel.app</link>
  <description>Weekly record drops from the culture rabbit-hole engine.</description>
${items}
</channel></rss>`);
console.log('rss.xml written,', drops.length, 'drops');
