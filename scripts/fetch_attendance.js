const { chromium } = require('playwright');
const fs = require('fs');

const JST = 9 * 60 * 60 * 1000;
const now = new Date(Date.now() + JST);
const todayStr = `${now.getUTCMonth() + 1}/${now.getUTCDate()}`;
const URL = 'https://www.cityheaven.net/fukuoka/A4001/A400102/royallips21/attend/?shopmenu=2&lo=1';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

  console.log(`Fetching: ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

  const result = await page.evaluate((today) => {
    const ids = new Set();
    let parsedToday = false;

    for (const table of document.querySelectorAll('table')) {
      const headerRow = table.querySelector('tr');
      if (!headerRow) continue;
      const ths = [...headerRow.querySelectorAll('th,td')];
      const col = ths.findIndex(th => th.textContent.includes(today));
      if (col < 0) continue;

      for (const row of [...table.querySelectorAll('tr')].slice(1)) {
        const cells = [...row.querySelectorAll('td,th')];
        if (cells.length <= col) continue;
        const ct = cells[col].textContent.trim();
        if (!ct || ct === '-' || ct === '休' || ct === '　') continue;
        const a = row.querySelector('a[href*="girlid-"]');
        if (a) {
          const m = a.href.match(/girlid-(\d+)/);
          if (m) ids.add(m[1]);
        }
      }
      parsedToday = true;
      break;
    }

    if (!ids.size) {
      for (const a of document.querySelectorAll('a[href*="girlid-"]')) {
        const m = a.href.match(/girlid-(\d+)/);
        if (m) ids.add(m[1]);
      }
    }

    return { girlidList: [...ids], parsedToday };
  }, todayStr);

  await browser.close();

  const data = {
    girlidList: result.girlidList,
    updated: new Date(Date.now() + JST).toISOString(),
    date: todayStr,
    parsedToday: result.parsedToday,
    count: result.girlidList.length,
  };

  console.log(`Result (parsedToday=${data.parsedToday}): ${data.count} girls → ${data.girlidList}`);
  fs.writeFileSync('attend.json', JSON.stringify(data, null, 2));
})();
