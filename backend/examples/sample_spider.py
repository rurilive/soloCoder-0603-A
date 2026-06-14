import requests
from bs4 import BeautifulSoup
import time

log("开始执行示例爬虫...")
log(f"起始URL: {rules.start_urls}")

headers = {
    "User-Agent": rules.user_agent,
    **rules.custom_headers
}

for url in rules.start_urls:
    try:
        log(f"正在抓取: {url}")
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")

        title = soup.title.string if soup.title else "No title"

        save_item({
            "title": title,
            "url": url,
            "status_code": response.status_code,
            "content_length": len(response.text)
        }, url)

        if rules.follow_links:
            for link in soup.find_all("a", href=True):
                href = link["href"]
                if href.startswith("http"):
                    log(f"发现链接: {href}")

        time.sleep(rules.delay)

    except Exception as e:
        log(f"抓取失败 {url}: {str(e)}")

log(f"抓取完成，共抓取 {len(results)} 条数据")
