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

  // デバッグ用: スクリーンショットとHTML保存
  await page.screenshot({ path: 'debug_screenshot.png', fullPage: true });
  const pageHtml = await page.content();
  fs.writeFileSync('debug_page.html', pageHtml);
  console.log(`Page title: ${await page.title()}`);
  console.log(`Page URL after load: ${page.url()}`);
  console.log(`HTML size: ${pageHtml.length} bytes`);

  const result = await page.evaluate((today) => {
    const ids = new Set();
    let parsedToday = false;

    // デバッグ: テーブル構造を出力
    const tables = document.querySelectorAll('table');
    const debugInfo = {
      tableCount: tables.length,
      allText: document.body ? document.body.innerText.slice(0, 500) : '',
      girlidLinks: [...document.querySelectorAll('a[href*="girlid-"]')].map(a => a.href).slice(0, 10),
    };

    for (const table of tables) {
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

    return { girlidList: [...ids], parsedToday, debugInfo };
  }, todayStr);

  console.log(`Debug: tables=${result.debugInfo.tableCount}, girlidLinks=${result.debugInfo.girlidLinks.length}`);
  console.log(`Debug allText: ${result.debugInfo.allText}`);
  if (result.debugInfo.girlidLinks.length) {
    console.log(`Debug girlidLinks: ${result.debugInfo.girlidLinks.join(', ')}`);
  }

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
