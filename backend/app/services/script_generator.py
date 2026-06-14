from typing import Dict, Any
from ..schemas import (
    VisualCrawlConfig as VisualCrawlConfigSchema,
    ListCrawlConfig,
    DetailCrawlConfig,
    CommonCrawlConfig,
    FieldSelector,
)


class ScriptGenerator:
    @staticmethod
    def generate_script(config: VisualCrawlConfigSchema) -> str:
        crawl_type = config.crawl_type
        list_config = config.list_config
        detail_config = config.detail_config
        common_config = config.common_config

        if crawl_type == "list":
            return ScriptGenerator._generate_list_script(
                list_config, common_config, config.name
            )
        elif crawl_type == "detail":
            return ScriptGenerator._generate_detail_script(
                detail_config, common_config, config.name
            )
        elif crawl_type == "list_detail":
            return ScriptGenerator._generate_list_detail_script(
                list_config, detail_config, common_config, config.name
            )
        else:
            raise ValueError(f"Unknown crawl type: {crawl_type}")

    @staticmethod
    def _generate_common_header(config_name: str) -> str:
        return f'''# ===== 可视化配置生成的爬虫脚本 =====
# 配置名称: {config_name}
# 生成方式: 可视化配置自动生成
#
# 可用变量:
#   rules             - 抓取规则配置对象
#
# 可用函数:
#   save_item(data, url="")   - 保存一条抓取结果
#   log(message)              - 输出日志
#   auto_crawl()              - 一键自动爬取
#   fetch_page(url)           - 抓取单个页面，返回 BeautifulSoup 对象

log("开始执行可视化配置爬虫...")
'''

    @staticmethod
    def _generate_list_script(
        list_config: ListCrawlConfig,
        common_config: CommonCrawlConfig,
        config_name: str,
    ) -> str:
        header = ScriptGenerator._generate_common_header(config_name)

        extract_fields_code = ScriptGenerator._generate_extract_fields_code(
            list_config.fields
        )

        pagination_code = ScriptGenerator._generate_pagination_code(list_config)

        main_code = f'''
# ===== 列表页爬取配置 =====
# 列表URL: {list_config.list_url}
# 条目选择器: {list_config.item_selector}
# 最大页数: {list_config.max_pages}

import requests
from bs4 import BeautifulSoup
import time
from urllib.parse import urljoin, urlparse

headers = {{"User-Agent": rules.user_agent}}
if rules.custom_headers:
    headers.update(rules.custom_headers)

results = []
current_url = rules.start_urls[0] if rules.start_urls else {list_config.list_url!r}
page_count = 0

while current_url and page_count < {list_config.max_pages}:
    log(f"正在抓取列表页 [{{page_count + 1}}/{list_config.max_pages}]: {{current_url}}")
    
    try:
        resp = requests.get(current_url, headers=headers, timeout={common_config.timeout})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        log(f"请求失败: {{str(e)}}")
        break
    
    page_count += 1
    
    # 提取列表条目
    items = soup.select({list_config.item_selector!r})
    log(f"找到 {{len(items)}} 个条目")
    
    for idx, item in enumerate(items):
{extract_fields_code}
        if item_data:
            save_item(item_data, current_url)
            log(f"  条目 {{idx + 1}}: 提取成功")
    
    # 翻页处理
{pagination_code}
    
    if rules.delay > 0:
        time.sleep(rules.delay)

log(f"列表爬取完成，共抓取 {{page_count}} 页，{{len(results)}} 条结果")
'''
        return header + main_code

    @staticmethod
    def _generate_detail_script(
        detail_config: DetailCrawlConfig,
        common_config: CommonCrawlConfig,
        config_name: str,
    ) -> str:
        header = ScriptGenerator._generate_common_header(config_name)

        extract_fields_code = ScriptGenerator._generate_extract_fields_code(
            detail_config.fields, is_detail=True
        )

        follow_links_code = ""
        if detail_config.follow_links:
            follow_links_code = f'''
    # 追踪链接
    if {detail_config.follow_links}:
        link_selector = {detail_config.link_selector!r}
        if link_selector:
            links = soup.select(link_selector)
            log(f"  发现 {{len(links)}} 个待追踪链接")
            for link in links:
                href = link.get("href", "")
                if href:
                    full_url = urljoin(current_url, href)
                    log(f"    追踪链接: {{full_url}}")
                    # 可在此处添加递归抓取逻辑
'''

        main_code = f'''
# ===== 详情页爬取配置 =====

import requests
from bs4 import BeautifulSoup
import time
from urllib.parse import urljoin

headers = {{"User-Agent": rules.user_agent}}
if rules.custom_headers:
    headers.update(rules.custom_headers)

for url in rules.start_urls:
    log(f"正在抓取详情页: {{url}}")
    
    try:
        resp = requests.get(url, headers=headers, timeout={common_config.timeout})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        log(f"请求失败: {{str(e)}}")
        continue
    
    current_url = url
    item_data = {{}}
{extract_fields_code}
{follow_links_code}
    if item_data:
        save_item(item_data, url)
        log(f"  提取完成: {{len(item_data)}} 个字段")
    
    if rules.delay > 0:
        time.sleep(rules.delay)

log("详情页爬取完成")
'''
        return header + main_code

    @staticmethod
    def _generate_list_detail_script(
        list_config: ListCrawlConfig,
        detail_config: DetailCrawlConfig,
        common_config: CommonCrawlConfig,
        config_name: str,
    ) -> str:
        header = ScriptGenerator._generate_common_header(config_name)

        list_extract_code = ScriptGenerator._generate_extract_fields_code(
            list_config.fields, indent_level=2
        )
        detail_extract_code = ScriptGenerator._generate_extract_fields_code(
            detail_config.fields, is_detail=True, indent_level=3
        )

        pagination_code = ScriptGenerator._generate_pagination_code(
            list_config, indent_level=1
        )

        main_code = f'''
# ===== 列表+详情页爬取配置 =====
# 先抓列表页获取详情链接，再抓每个详情页

import requests
from bs4 import BeautifulSoup
import time
from urllib.parse import urljoin, urlparse
from collections import deque

headers = {{"User-Agent": rules.user_agent}}
if rules.custom_headers:
    headers.update(rules.custom_headers)

detail_urls = deque()
visited_urls = set()

# ===== 第一步：抓取列表页获取详情链接 =====
current_url = rules.start_urls[0] if rules.start_urls else {list_config.list_url!r}
page_count = 0
max_pages = {list_config.max_pages}

log("===== 第一步：抓取列表页 =====")

while current_url and page_count < max_pages:
    log(f"正在抓取列表页 [{{page_count + 1}}/{max_pages}]: {{current_url}}")
    
    try:
        resp = requests.get(current_url, headers=headers, timeout={common_config.timeout})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        log(f"请求失败: {{str(e)}}")
        break
    
    page_count += 1
    
    # 提取详情链接
    items = soup.select({list_config.item_selector!r})
    log(f"找到 {{len(items)}} 个条目")
    
    for item in items:
        url_elem = item.select_one({list_config.url_selector!r}) if {list_config.url_selector!r} else item
        if url_elem:
            href = url_elem.get({list_config.url_attribute!r}, "")
            if href:
                detail_url = urljoin(current_url, href)
                if detail_url not in visited_urls:
                    detail_urls.append(detail_url)
                    visited_urls.add(detail_url)
    
    # 可选：提取列表页字段
{list_extract_code}
    
    # 翻页
{pagination_code}
    
    if rules.delay > 0:
        time.sleep(rules.delay)

log(f"列表页抓取完成，共获取 {{len(detail_urls)}} 个详情链接")

# ===== 第二步：抓取详情页 =====
log("===== 第二步：抓取详情页 =====")

detail_count = 0
while detail_urls:
    detail_url = detail_urls.popleft()
    detail_count += 1
    
    log(f"正在抓取详情页 [{{detail_count}}/{{len(visited_urls)}}]: {{detail_url}}")
    
    try:
        resp = requests.get(detail_url, headers=headers, timeout={common_config.timeout})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        log(f"请求失败: {{str(e)}}")
        continue
    
    current_url = detail_url
    item_data = {{"_list_url": current_url}}
{detail_extract_code}
    if item_data:
        save_item(item_data, detail_url)
        log(f"  提取完成: {{len(item_data)}} 个字段")
    
    if rules.delay > 0:
        time.sleep(rules.delay)

log(f"全部爬取完成，共抓取 {{page_count}} 个列表页，{{detail_count}} 个详情页")
'''
        return header + main_code

    @staticmethod
    def _generate_extract_fields_code(
        fields: list[FieldSelector], is_detail: bool = False, indent_level: int = 2
    ) -> str:
        indent = "    " * indent_level
        if not fields:
            return f"{indent}# 未配置提取字段\n{indent}item_data = {{}}\n"

        code_lines = []
        if is_detail:
            code_lines.append(f"{indent}item_data = {{}}")
        else:
            code_lines.append(f"{indent}item_data = {{}}")

        for field in fields:
            field_name = field.name
            selector = field.selector
            attribute = field.attribute
            required = field.required

            if attribute == "text":
                extract_code = f'''{indent}try:
{indent}    elem = item.select_one({selector!r}) if not is_detail else soup.select_one({selector!r})
{indent}    if elem:
{indent}        item_data[{field_name!r}] = elem.get_text(strip=True)
{indent}    elif {required}:
{indent}        log(f"  警告: 必要字段 {field_name} 未找到")
{indent}except Exception as e:
{indent}    log(f"  提取字段 {field_name} 失败: {{str(e)}}")
'''
            else:
                extract_code = f'''{indent}try:
{indent}    elem = item.select_one({selector!r}) if not is_detail else soup.select_one({selector!r})
{indent}    if elem:
{indent}        item_data[{field_name!r}] = elem.get({attribute!r}, "")
{indent}    elif {required}:
{indent}        log(f"  警告: 必要字段 {field_name} 未找到")
{indent}except Exception as e:
{indent}    log(f"  提取字段 {field_name} 失败: {{str(e)}}")
'''
            code_lines.append(extract_code)

        return "\n".join(code_lines)

    @staticmethod
    def _generate_pagination_code(
        list_config: ListCrawlConfig, indent_level: int = 0
    ) -> str:
        indent = "    " * indent_level
        pagination_type = list_config.pagination_type
        selector = list_config.pagination_selector

        if pagination_type == "none":
            return f"{indent}# 无翻页配置\n{indent}current_url = None"
        elif pagination_type == "next_page":
            return f'''{indent}# 下一页翻页
{indent}next_elem = soup.select_one({selector!r})
{indent}if next_elem:
{indent}    next_href = next_elem.get("href", "")
{indent}    if next_href:
{indent}        current_url = urljoin(current_url, next_href)
{indent}    else:
{indent}        current_url = None
{indent}else:
{indent}    current_url = None'''
        elif pagination_type == "page_number":
            return f'''{indent}# 页码翻页
{indent}all_pages = soup.select({selector!r})
{indent}next_url = None
{indent}for page_elem in all_pages:
{indent}    page_num = page_elem.get_text(strip=True)
{indent}    if page_num.isdigit() and int(page_num) == page_count + 1:
{indent}        next_href = page_elem.get("href", "")
{indent}        if next_href:
{indent}            next_url = urljoin(current_url, next_href)
{indent}        break
{indent}current_url = next_url'''
        elif pagination_type == "infinite_scroll":
            return f"{indent}# 无限滚动需要 JavaScript 支持，此处停止翻页\n{indent}current_url = None"
        else:
            return f"{indent}# 未知翻页类型\n{indent}current_url = None"

    @staticmethod
    def generate_scrape_rules(
        config: VisualCrawlConfigSchema,
    ) -> Dict[str, Any]:
        common = config.common_config
        start_urls = []

        if config.crawl_type in ["list", "list_detail"]:
            if config.list_config.list_url:
                start_urls.append(config.list_config.list_url)

        extract_patterns = {}
        if config.crawl_type == "detail":
            for field in config.detail_config.fields:
                extract_patterns[field.name] = field.selector
        elif config.crawl_type == "list":
            for field in config.list_config.fields:
                extract_patterns[field.name] = field.selector
        elif config.crawl_type == "list_detail":
            for field in config.detail_config.fields:
                extract_patterns[field.name] = field.selector

        return {
            "start_urls": start_urls,
            "allowed_domains": common.allowed_domains,
            "follow_links": config.detail_config.follow_links,
            "max_pages": config.list_config.max_pages,
            "delay": common.delay,
            "user_agent": common.user_agent,
            "custom_headers": common.custom_headers,
            "extract_patterns": extract_patterns,
        }
