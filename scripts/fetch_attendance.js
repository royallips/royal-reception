const fs = require('fs');

const JST = 9 * 60 * 60 * 1000;
const now = new Date(Date.now() + JST);
const month = now.getUTCMonth() + 1;
const day = now.getUTCDate();
const todayStr = `${month}/${day}`;
const STORE = 'https://www.cityheaven.net/fukuoka/A4001/A400102/royallips21';
const CONCURRENCY = 8;

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

async function fetchCastInfo(gid) {
  const url = `${STORE}/girlid-${gid}/`;
  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'ja-JP,ja;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { console.log(`${gid}: HTTP ${res.status}`); return null; }

    const text = extractText(await res.text());

    // 今日の確定出勤を探す: "6/29(月) 8:00～14:00" のような形式
    const dateRe = new RegExp(`${month}/${day}[^\\d〜～]{0,10}([\\d]{1,2}:[\\d]{2})[〜～～]([\\d]{1,2}:[\\d]{2})`);
    const scheduleMatch = text.match(dateRe);
    if (!scheduleMatch) return null;

    // 最短案内時刻: "最短XX:XX" のような形式（出勤中のみ表示）
    const earliestMatch = text.match(/最短[^\\d]{0,6}([\\d]{1,2}:[\\d]{2})/);

    return {
      shiftStart: scheduleMatch[1],
      shiftEnd: scheduleMatch[2],
      shiftTime: `${scheduleMatch[1]}〜${scheduleMatch[2]}`,
      earliest: earliestMatch ? earliestMatch[1] : null,
    };
  } catch (e) {
    console.error(`${gid}: ${e.message}`);
    return null;
  }
}

(async () => {
  const casts = JSON.parse(fs.readFileSync('casts.json', 'utf8'));
  const gids = [...new Set(casts.map(c => c.gid).filter(Boolean))];
  console.log(`Checking ${gids.length} casts for ${todayStr}...`);

  const results = new Map();
  for (let i = 0; i < gids.length; i += CONCURRENCY) {
    const batch = gids.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fetchCastInfo));
    batch.forEach((gid, j) => { if (batchResults[j]) results.set(gid, batchResults[j]); });
    console.log(`Processed ${Math.min(i + CONCURRENCY, gids.length)}/${gids.length}`);
  }

  const working = [...results.entries()];
  console.log(`Working today (${todayStr}): ${working.length} casts`);
  working.forEach(([gid, info]) =>
    console.log(`  ${gid}: ${info.shiftTime}${info.earliest ? ` 最短${info.earliest}` : ''}`)
  );

  const attendInfo = {};
  working.forEach(([gid, info]) => { attendInfo[gid] = info; });

  fs.writeFileSync('attend.json', JSON.stringify({
    girlidList: working.map(([gid]) => gid),
    attendInfo,
    updated: new Date(Date.now() + JST).toISOString(),
    date: todayStr,
    count: working.length,
  }, null, 2));
})();
