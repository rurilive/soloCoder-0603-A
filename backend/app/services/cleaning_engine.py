import re
from typing import Dict, List, Any, Optional


class CleaningEngine:
    def __init__(self, rules: List[Dict[str, Any]] = None):
        self.rules = rules or []

    def clean_item(self, data: Dict[str, Any]) -> Dict[str, Any]:
        result = dict(data)
        for rule in self.rules:
            result = self._apply_rule(result, rule)
        return result

    def clean_items(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [self.clean_item(item) for item in items]

    def _apply_rule(self, data: Dict[str, Any], rule: Dict[str, Any]) -> Dict[str, Any]:
        rule_type = rule.get("rule_type", "")
        field_name = rule.get("field_name", "")
        params = rule.get("params", {})

        handlers = {
            "rename": self._handle_rename,
            "remove_field": self._handle_remove_field,
            "keep_fields": self._handle_keep_fields,
            "trim": self._handle_trim,
            "lowercase": self._handle_lowercase,
            "uppercase": self._handle_uppercase,
            "replace": self._handle_replace,
            "regex_replace": self._handle_regex_replace,
            "regex_extract": self._handle_regex_extract,
            "to_number": self._handle_to_number,
            "to_boolean": self._handle_to_boolean,
            "default_value": self._handle_default_value,
            "split": self._handle_split,
            "join": self._handle_join,
            "deduplicate": self._handle_deduplicate,
            "prefix": self._handle_prefix,
            "suffix": self._handle_suffix,
            "strip_chars": self._handle_strip_chars,
        }

        handler = handlers.get(rule_type)
        if handler:
            return handler(data, field_name, params)
        return data

    def _handle_rename(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        new_name = params.get("new_name", "")
        if field_name in data and new_name and new_name != field_name:
            data[new_name] = data.pop(field_name)
        return data

    def _handle_remove_field(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data:
            del data[field_name]
        return data

    def _handle_keep_fields(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        fields = params.get("fields", [])
        if fields:
            return {k: v for k, v in data.items() if k in fields}
        return data

    def _handle_trim(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            data[field_name] = data[field_name].strip()
        return data

    def _handle_lowercase(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            data[field_name] = data[field_name].lower()
        return data

    def _handle_uppercase(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            data[field_name] = data[field_name].upper()
        return data

    def _handle_replace(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            old = params.get("old", "")
            new = params.get("new", "")
            data[field_name] = data[field_name].replace(old, new)
        return data

    def _handle_regex_replace(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            pattern = params.get("pattern", "")
            replacement = params.get("replacement", "")
            if pattern:
                data[field_name] = re.sub(pattern, replacement, data[field_name])
        return data

    def _handle_regex_extract(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            pattern = params.get("pattern", "")
            group = params.get("group", 0)
            if pattern:
                match = re.search(pattern, data[field_name])
                if match:
                    try:
                        data[field_name] = match.group(group)
                    except IndexError:
                        pass
                else:
                    data[field_name] = params.get("default", "")
        return data

    def _handle_to_number(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data:
            value = data[field_name]
            try:
                if isinstance(value, (int, float)):
                    pass
                elif isinstance(value, str):
                    match = re.search(r'-?\d+\.?\d*', value)
                    if match:
                        number_str = match.group()
                        if "." in number_str:
                            data[field_name] = float(number_str)
                        else:
                            data[field_name] = int(number_str)
                    else:
                        data[field_name] = params.get("default", 0)
                else:
                    data[field_name] = params.get("default", 0)
            except (ValueError, TypeError):
                data[field_name] = params.get("default", 0)
        return data

    def _handle_to_boolean(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data:
            value = data[field_name]
            if isinstance(value, bool):
                pass
            elif isinstance(value, str):
                value_lower = value.strip().lower()
                true_values = {"true", "yes", "是", "1", "y"}
                false_values = {"false", "no", "否", "0", "n", ""}
                if value_lower in true_values:
                    data[field_name] = True
                elif value_lower in false_values:
                    data[field_name] = False
                else:
                    data[field_name] = params.get("default", False)
            else:
                data[field_name] = bool(value)
        return data

    def _handle_default_value(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        default = params.get("default", "")
        if field_name not in data or data[field_name] is None or data[field_name] == "":
            data[field_name] = default
        return data

    def _handle_split(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            separator = params.get("separator", ",")
            maxsplit = params.get("maxsplit", -1)
            data[field_name] = data[field_name].split(separator, maxsplit)
            if params.get("trim_items", True):
                data[field_name] = [item.strip() for item in data[field_name]]
        return data

    def _handle_join(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], list):
            separator = params.get("separator", ", ")
            data[field_name] = separator.join(str(item) for item in data[field_name])
        return data

    def _handle_deduplicate(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], list):
            seen = set()
            result = []
            for item in data[field_name]:
                item_key = str(item)
                if item_key not in seen:
                    seen.add(item_key)
                    result.append(item)
            data[field_name] = result
        return data

    def _handle_prefix(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            prefix = params.get("prefix", "")
            data[field_name] = prefix + data[field_name]
        return data

    def _handle_suffix(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            suffix = params.get("suffix", "")
            data[field_name] = data[field_name] + suffix
        return data

    def _handle_strip_chars(self, data: Dict[str, Any], field_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if field_name in data and isinstance(data[field_name], str):
            chars = params.get("chars", "")
            side = params.get("side", "both")
            if side == "left":
                data[field_name] = data[field_name].lstrip(chars)
            elif side == "right":
                data[field_name] = data[field_name].rstrip(chars)
            else:
                data[field_name] = data[field_name].strip(chars)
        return data


def get_available_rule_types() -> List[Dict[str, Any]]:
    return [
        {"type": "rename", "label": "重命名字段", "category": "字段操作", "has_field": True, "params": [
            {"name": "new_name", "label": "新字段名", "type": "text", "required": True}
        ]},
        {"type": "remove_field", "label": "删除字段", "category": "字段操作", "has_field": True, "params": []},
        {"type": "keep_fields", "label": "保留指定字段", "category": "字段操作", "has_field": False, "params": [
            {"name": "fields", "label": "保留字段列表（逗号分隔）", "type": "text", "required": True}
        ]},
        {"type": "trim", "label": "去除首尾空白", "category": "字符串处理", "has_field": True, "params": []},
        {"type": "lowercase", "label": "转小写", "category": "字符串处理", "has_field": True, "params": []},
        {"type": "uppercase", "label": "转大写", "category": "字符串处理", "has_field": True, "params": []},
        {"type": "replace", "label": "字符串替换", "category": "字符串处理", "has_field": True, "params": [
            {"name": "old", "label": "原字符串", "type": "text", "required": True},
            {"name": "new", "label": "新字符串", "type": "text", "required": True}
        ]},
        {"type": "regex_replace", "label": "正则替换", "category": "字符串处理", "has_field": True, "params": [
            {"name": "pattern", "label": "正则表达式", "type": "text", "required": True},
            {"name": "replacement", "label": "替换内容", "type": "text", "required": True}
        ]},
        {"type": "regex_extract", "label": "正则提取", "category": "字符串处理", "has_field": True, "params": [
            {"name": "pattern", "label": "正则表达式", "type": "text", "required": True},
            {"name": "group", "label": "捕获组索引", "type": "number", "default": 0},
            {"name": "default", "label": "默认值", "type": "text", "default": ""}
        ]},
        {"type": "prefix", "label": "添加前缀", "category": "字符串处理", "has_field": True, "params": [
            {"name": "prefix", "label": "前缀内容", "type": "text", "required": True}
        ]},
        {"type": "suffix", "label": "添加后缀", "category": "字符串处理", "has_field": True, "params": [
            {"name": "suffix", "label": "后缀内容", "type": "text", "required": True}
        ]},
        {"type": "strip_chars", "label": "去除指定字符", "category": "字符串处理", "has_field": True, "params": [
            {"name": "chars", "label": "要去除的字符", "type": "text", "required": True},
            {"name": "side", "label": "位置", "type": "select", "options": ["both", "left", "right"], "default": "both"}
        ]},
        {"type": "to_number", "label": "转换为数字", "category": "类型转换", "has_field": True, "params": [
            {"name": "default", "label": "转换失败默认值", "type": "number", "default": 0}
        ]},
        {"type": "to_boolean", "label": "转换为布尔值", "category": "类型转换", "has_field": True, "params": [
            {"name": "default", "label": "转换失败默认值", "type": "checkbox", "default": False}
        ]},
        {"type": "default_value", "label": "设置默认值", "category": "数据填充", "has_field": True, "params": [
            {"name": "default", "label": "默认值", "type": "text", "required": True}
        ]},
        {"type": "split", "label": "字符串拆分为数组", "category": "数组操作", "has_field": True, "params": [
            {"name": "separator", "label": "分隔符", "type": "text", "default": ","},
            {"name": "trim_items", "label": "去除每项空白", "type": "checkbox", "default": True}
        ]},
        {"type": "join", "label": "数组合并为字符串", "category": "数组操作", "has_field": True, "params": [
            {"name": "separator", "label": "分隔符", "type": "text", "default": ", "}
        ]},
        {"type": "deduplicate", "label": "数组去重", "category": "数组操作", "has_field": True, "params": []},
    ]
