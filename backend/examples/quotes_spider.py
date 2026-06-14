import requests
from bs4 import BeautifulSoup
import time

log("开始抓取 Quotes 网站...")

base_url = "https://quotes.toscrape.com"
headers = {"User-Agent": rules.user_agent}

page = 1
max_pages = min(rules.max_pages, 5)
count = 0

while page <= max_pages:
    url = f"{base_url}/page/{page}/"
    log(f"正在抓取第 {page} 页: {url}")

    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")

        for quote in soup.find_all("div", class_="quote"):
            text = quote.find("span", class_="text").get_text(strip=True)
            author = quote.find("small", class_="author").get_text(strip=True)
            tags = [t.get_text(strip=True) for t in quote.find_all("a", class_="tag")]

            save_item({
                "text": text,
                "author": author,
                "tags": tags,
                "page": page
            }, url)
            count += 1

        next_btn = soup.find("li", class_="next")
        if not next_btn:
            log("已到达最后一页")
            break

        page += 1
        time.sleep(rules.delay)

    except Exception as e:
        log(f"抓取失败 {url}: {str(e)}")
        break

log(f"抓取完成，共抓取 {count} 条名人名言")
