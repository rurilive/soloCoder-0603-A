import requests
import json

base_url = "http://localhost:8000/api"

def test_rule_types():
    print("=== 测试规则类型列表 ===")
    resp = requests.get(f"{base_url}/cleaning/rule-types")
    print(f"状态码: {resp.status_code}")
    types = resp.json()
    print(f"规则类型数量: {len(types)}")
    for t in types[:3]:
        print(f"  - {t['type']}: {t['label']} ({t['category']})")
    print()

def test_create_pipeline():
    print("=== 测试创建清洗管道 ===")
    data = {
        "name": "测试清洗管道",
        "description": "用于测试的清洗管道",
        "rules": [
            {
                "rule_type": "trim",
                "field_name": "title",
                "params": {},
                "order_index": 0
            },
            {
                "rule_type": "to_number",
                "field_name": "price",
                "params": {"default": 0},
                "order_index": 1
            }
        ]
    }
    resp = requests.post(f"{base_url}/cleaning/pipelines", json=data)
    print(f"状态码: {resp.status_code}")
    if resp.status_code != 200:
        print(f"错误内容: {resp.text}")
        return None
    result = resp.json()
    print(f"管道ID: {result.get('id')}")
    print(f"管道名称: {result.get('name')}")
    print(f"规则数量: {len(result.get('rules', []))}")
    return result.get('id')

def test_preview():
    print("=== 测试预览功能 ===")
    data = {
        "rules": [
            {"rule_type": "trim", "field_name": "title", "params": {}, "order_index": 0},
            {"rule_type": "to_number", "field_name": "price", "params": {"default": 0}, "order_index": 1}
        ],
        "sample_data": [
            {"title": "  测试标题  ", "price": " 199.99 ", "other": "value"}
        ]
    }
    resp = requests.post(f"{base_url}/cleaning/preview", json=data)
    print(f"状态码: {resp.status_code}")
    result = resp.json()
    print(f"原始数据: {json.dumps(result['original'], ensure_ascii=False)}")
    print(f"清洗后数据: {json.dumps(result['cleaned'], ensure_ascii=False)}")
    print()

def test_list_pipelines():
    print("=== 测试管道列表 ===")
    resp = requests.get(f"{base_url}/cleaning/pipelines")
    print(f"状态码: {resp.status_code}")
    pipelines = resp.json()
    print(f"管道数量: {len(pipelines)}")
    for p in pipelines:
        print(f"  - #{p['id']} {p['name']} ({len(p.get('rules', []))} 条规则)")
    print()

if __name__ == "__main__":
    test_rule_types()
    test_create_pipeline()
    test_preview()
    test_list_pipelines()
    print("所有测试完成!")
