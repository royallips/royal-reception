const fs = require('fs');
const path = require('path');

const JST = 9 * 60 * 60 * 1000;
const now = new Date(Date.now() + JST);
const month = now.getUTCMonth() + 1;
const day = now.getUTCDate();
const todayStr = `${month}/${day}`;
const STORE = 'https://www.cityheaven.net/fukuoka/A4001/A400102/royallips21';
const REPO = 'royallips/royal-reception';
const CONCURRENCY = 8;

// config.local.json があればWindowsPC（ローカル）モード
const configPath = path.join(__dirname, '..', 'config.local.json');
const isLocalMode = fs.existsSync(configPath);
const config = isLocalMode ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;

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

    const dateRe = new RegExp(`${month}/${day}[^\\d〜～]{0,10}([\\d]{1,2}:[\\d]{2})[〜～～~]([\\d]{1,2}:[\\d]{2})`);
    const scheduleMatch = text.match(dateRe);
    if (!scheduleMatch) return null;

    const earliestMatch = text.match(/最短[^\d]{0,6}(\d{1,2}:\d{2})/);

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

async function getFileFromGitHub(filePath) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}`,
    { headers: { 'Authorization': `token ${config.githubToken}`, 'Accept': 'application/vnd.github.v3+json' } }
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

async function pushToGitHub(filePath, content) {
  const current = await getFileFromGitHub(filePath);
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${config.githubToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Update attendance [skip ci]',
        content: Buffer.from(content).toString('base64'),
        sha: current.sha,
      }),
    }
  );
  if (!res.ok) throw new Error(`GitHub push error: ${res.status}`);
}

(async () => {
  // casts.jsonを取得（ローカルモードはGitHubから、GitHub Actionsはローカルファイル）
  let casts;
  if (isLocalMode) {
    console.log('ローカルモード: GitHubからcasts.jsonを取得中...');
    const file = await getFileFromGitHub('casts.json');
    casts = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  } else {
    casts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'casts.json'), 'utf8'));
  }

  const gids = [...new Set(casts.map(c => c.gid).filter(Boolean))];
  console.log(`${gids.length}人のシティヘブンページを確認中 (${todayStr})...`);

  const results = new Map();
  for (let i = 0; i < gids.length; i += CONCURRENCY) {
    const batch = gids.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fetchCastInfo));
    batch.forEach((gid, j) => { if (batchResults[j]) results.set(gid, batchResults[j]); });
    process.stdout.write(`\r${Math.min(i + CONCURRENCY, gids.length)}/${gids.length}件処理済み`);
  }
  console.log();

  const working = [...results.entries()];
  console.log(`本日出勤 (${todayStr}): ${working.length}人`);
  working.forEach(([gid, info]) =>
    console.log(`  ${gid}: ${info.shiftTime}${info.earliest ? ` 最短${info.earliest}` : ''}`)
  );

  const attendInfo = {};
  working.forEach(([gid, info]) => { attendInfo[gid] = info; });

  const data = {
    girlidList: working.map(([gid]) => gid),
    attendInfo,
    updated: new Date(Date.now() + JST).toISOString(),
    date: todayStr,
    count: working.length,
  };

  const json = JSON.stringify(data, null, 2);

  if (isLocalMode) {
    console.log('GitHubにattend.jsonをpush中...');
    await pushToGitHub('attend.json', json);
    console.log('完了');
  } else {
    fs.writeFileSync(path.join(__dirname, '..', 'attend.json'), json);
    console.log('attend.jsonを書き込みました');
  }
})();
