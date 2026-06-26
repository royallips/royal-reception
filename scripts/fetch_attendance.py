import requests, json, re, sys
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup

JST = timezone(timedelta(hours=9))
now = datetime.now(JST)
today_str = f"{now.month}/{now.day}"

URL = 'https://www.cityheaven.net/fukuoka/A4001/A400102/royallips21/attend/?shopmenu=2&lo=1'
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
    'Referer': 'https://www.cityheaven.net/fukuoka/A4001/A400102/royallips21/',
}

try:
    r = requests.get(URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    print(f"Fetched OK ({len(r.text)} bytes)")
except Exception as e:
    print(f"Fetch failed: {e}", file=sys.stderr)
    sys.exit(1)

soup = BeautifulSoup(r.text, 'html.parser')
girls = []
parsed_today = False

# Strategy 1: find today's column in the weekly schedule table
for table in soup.find_all('table'):
    header_row = table.find('tr')
    if not header_row:
        continue
    header_cells = header_row.find_all(['th', 'td'])
    today_col = next(
        (i for i, th in enumerate(header_cells) if today_str in th.get_text()),
        None
    )
    if today_col is None:
        continue
    for row in table.find_all('tr')[1:]:
        cells = row.find_all(['td', 'th'])
        if len(cells) <= today_col:
            continue
        cell_text = cells[today_col].get_text(strip=True)
        if not cell_text or cell_text in ('-', '　', '休'):
            continue
        m = re.search(r'girlid-(\d+)', str(row))
        if m:
            girls.append(m.group(1))
    parsed_today = True
    print(f"Parsed today's column (col={today_col}, date={today_str})")
    break

# Strategy 2: fallback — all girlids on page
if not girls:
    print("No today column found, using all girlids on page")
    girls = list(set(re.findall(r'girlid-(\d+)', r.text)))

girls = list(set(girls))
data = {
    'girlidList': girls,
    'updated': now.isoformat(),
    'date': today_str,
    'parsedToday': parsed_today,
    'count': len(girls),
}
print(f"Result: {len(girls)} girls → {girls}")
with open('attend.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
