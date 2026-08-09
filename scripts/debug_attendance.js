const fs = require('fs');
const path = require('path');

const JST = 9 * 60 * 60 * 1000;
const now = new Date(Date.now() + JST);
const month = now.getUTCMonth() + 1;
const day = now.getUTCDate();
const todayStr = `${month}/${day}`;
const STORE = 'https://www.cityheaven.net/fukuoka/A4001/A400102/royallips21';

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

(async () => {
  const castsFile = path.join(__dirname, '..', 'casts.json');
  const casts = JSON.parse(fs.readFileSync(castsFile, 'utf8'));
  const gids = [...new Set(casts.map(c => c.gid).filter(Boolean))];

  console.log(`今日: ${todayStr}`);
  console.log(`確認するキャスト数: ${gids.length}`);
  console.log('');

  // 最初の3人だけデバッグ
  for (const gid of gids.slice(0, 3)) {
    const url = `${STORE}/girlid-${gid}/`;
    console.log(`--- girlid ${gid} ---`);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
      const text = extractText(await res.text());

      // ページ全体のテキストサンプルを表示（最初の500文字）
      console.log(`  テキスト冒頭: ${text.slice(0, 300)}`);
      console.log('  ...');

      // スケジュール・出勤・時刻に関するキーワード周辺
      const keywords = ['出勤', 'スケジュール', '時', '〜', '受付', `${month}/`, `${month}月`];
      for (const kw of keywords) {
        const idx = text.indexOf(kw);
        if (idx !== -1) {
          console.log(`  "${kw}" 発見: ...${text.slice(Math.max(0, idx - 20), idx + 60)}...`);
          break;
        }
      }

      // 日付検索
      const idx = text.indexOf(`${month}/${day}`);
      if (idx === -1) {
        const idx2 = text.indexOf(`${month}月${day}日`);
        if (idx2 === -1) {
          console.log(`  → "${month}/${day}" も "${month}月${day}日" も見つからず`);
        } else {
          console.log(`  → "${month}月${day}日" 形式で発見: ...${text.slice(idx2 - 10, idx2 + 80)}...`);
        }
      } else {
        console.log(`  → "${month}/${day}" 発見: ...${text.slice(idx - 10, idx + 80)}...`);
      }

      const dateRe = new RegExp(`0?${month}/0?${day}[^\\d]{0,30}?(\\d{1,2}:\\d{2})[\\s\\-〜～–—~]+?(\\d{1,2}:\\d{2})`);
      const m = text.match(dateRe);
      console.log(`  → 正規表現マッチ: ${m ? m[0] : 'なし'}`);
    } catch (e) {
      console.log(`  エラー: ${e.message}`);
    }
    console.log('');
  }
})();
