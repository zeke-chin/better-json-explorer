<p align="center">
  <img src="images/icon.png" alt="BetterJsonExplorer" width="160" />
</p>

# BetterJsonExplorer

VS Code 扩展：更好的 JSON 预览与编辑工具。

## 功能演示

### 1. 智能识别与格式化
![Auto Paste Format](images/auto-paste-format.gif)

### 2. JSON 格式一键切换（默认 Cmd+;）
![Toggle Format](images/json-string-toggle.gif)

### 3. 任意字符串 Hover 预览与嵌套解析
![Smart Hover Preview](images/smart-hover-preview.gif)

## 功能

1. **智能识别与格式化**：在 plaintext 文件粘贴时，扩展会按内容分三类处理：

   | 内容类型 | 默认行为 | 可通过设置改成"粘贴即转" |
   |---|---|---|
   | 合法 JSON 或 JSON 字符串 | **自动**切换语言模式并格式化 | — |
   | Python `repr(dict)` 字面量（单引号/`True/False/None`/tuple 等） | 顶部显示按钮 **`▸ Convert Python dict to JSON`**，点击或按 `Cmd+;` 转换 | ✓ |
   | 含字符串内真换行的 JSON（终端/日志聚合工具复制场景，JSON.parse 会报 `Bad control character in string literal`） | 顶部显示按钮 **`▸ Convert to JSON (fix line breaks)`**，点击或按 `Cmd+;` 修复并转换 | ✓ |

   后两类默认走"显示按钮 → 用户确认"模式，避免静默改写可能是真实 Python 源码 / 待检查内容的输入；用户可以通过配置改成"粘贴即转"。

2. **JSON 格式切换**：JSON/JSONC 文件中使用默认快捷键 `Cmd+;`（Windows/Linux 为 `Ctrl+;`）在 JSON 格式和 JSON 字符串之间切换；在 plaintext 文件中（当顶部转换按钮可见时）该快捷键等价于点击按钮，转换后语言模式切到 JSON，再按一次即进入上述 toggle 链路
3. **任意字符串值的 Hover 预览**：JSON 中所有 string 值都支持鼠标悬停预览，并按内容智能选择渲染方式
   - **嵌套 JSON**（如 `"{\"a\":1}"`）→ 展开为格式化 JSON 渲染
   - **Python dict 字符串**（如 `"{'a': 1, 'ok': True}"`）→ 转为 JSON 后展开渲染，Hover 标题为 "Parsed Python dict"
   - **Markdown 文本**（标题/列表/代码围栏/链接/表格等）→ 直接以 markdown 渲染
   - **纯文本/代码** → code block 等宽显示，转义字符（`\n`/`\t`）按真实换行/制表展示
   - Hover 浮窗底部带 `▸ Open ... in side panel` 链接，点击在右侧分栏新开 untitled 文档：
     - 嵌套 JSON → `Parsed-<keyPath>.json`
     - Python dict → `Parsed-py-<keyPath>.json`
     - Markdown → `Value-<keyPath>.md`（可用 `Cmd+Shift+V` 触发 markdown 预览）
     - 纯文本 → `Value-<keyPath>.txt`
   - 多次点击会在右侧同一分栏增加 Tab，互不覆盖；新文档本身也是 JSON / Markdown 文档，因此**递归支持任意深度嵌套**
4. **嵌套 JSON 字符串 CodeLens**：可解析为 JSON 对象/数组的字符串值上方会显示 `▸ Parse JSON`（或 `▸ Parse Python dict`）行内按钮，等价于 Hover 链接的快捷入口（纯文本/markdown 不会显示 CodeLens，避免噪音）

### Python dict 支持范围

支持 `ast.literal_eval` 的子集：`dict` / `list` / `tuple`（转为数组） / `str`（单/双/三引号） / `int` / `float` / `True` / `False` / `None`。下列**不支持**，输入会被原样保留（不会误转、不会报错）：

- 含函数调用（如 `datetime(2024, 1, 1)`、`UUID('...')`、`Decimal('1.5')`）
- 含对象引用（如 `<Foo object at 0x100>`）
- bytes 字面量（`b'...'`）
- set 字面量（`{1, 2, 3}` 无键值对形式）
- 非字符串 key 的 dict（如 `{1: 'a'}`，因 JSON 仅支持字符串 key）

## 设置

在 VS Code 中打开 **Settings**（`Cmd+,` / `Ctrl+,`），搜索 `betterJsonExplorer` 可看到两项开关：

| 配置项 | 默认 | 含义 |
|---|---|---|
| `betterJsonExplorer.pythonRepr.autoConvert` | `false`（显示按钮） | `true` 时粘贴 Python repr 即转 JSON，不再显示 `▸ Convert Python dict to JSON` 按钮 |
| `betterJsonExplorer.lineBreakRepair.autoConvert` | `false`（显示按钮） | `true` 时粘贴含字符串内真换行的 JSON 即修复并转 JSON，不再显示 `▸ Convert to JSON (fix line breaks)` 按钮 |

也可以直接编辑 `settings.json`：

```json
{
  "betterJsonExplorer.pythonRepr.autoConvert": true,
  "betterJsonExplorer.lineBreakRepair.autoConvert": true
}
```

配置变化即时生效，无需重启。

## 快捷键

- 默认快捷键：macOS `Cmd+;`，Windows/Linux `Ctrl+;`
- 在 **JSON/JSONC 文件**中：JSON ⇄ JSON 字符串 切换
- 在 **plaintext 文件**中（当顶部转换按钮可见时）：等价于点击按钮，转换为 JSON 并切换语言模式；按钮不可见时（普通文本、干净 JSON、或已通过配置改成"粘贴即转"）状态栏提示 `nothing to convert`，不做事
- 如需修改，请使用 VS Code 自带的 **Keyboard Shortcuts**，搜索命令 `BetterJsonExplorer: Toggle Current Document JSON Format/String`
- 对应的 command ID 是 `better-json-explorer.toggleCurrentDocument`

如果想直接在 `keybindings.json` 中重绑，可以添加类似配置：

```json
{
  "key": "cmd+alt+j",
  "command": "better-json-explorer.toggleCurrentDocument",
  "when": "editorTextFocus && (editorLangId == json || editorLangId == jsonc || editorLangId == plaintext)"
}
```

## 示例

把下面这段贴进一个 JSON 文件，悬停每个 string 值观察 Hover 不同表现：

````json
{
    "test_id": 1024,
    "status": "success",
    "data": {
        "plain_str": "这是一个普通的字符串，没有任何特殊格式。",
        "markdown_str": "# 标题一\n这是一段 **Markdown** 测试文本。\n\n- 列表项 A\n- 列表项 B\n\n> 这是一个引用块。\n\n`inline code` 和代码块：\n\n```python\nprint('hello world')\n```",
        "json_str": "{\"user_id\": 123, \"roles\": [\"admin\", \"editor\"], \"settings\": {\"theme\": \"dark\", \"notifications\": true}}",
        "mixed_list": [
            "简单文本",
            "**加粗文本**",
            "{\"key\": \"value\"}"
        ]
    },
    "metadata": {
        "created_at": "2023-10-27T10:00:00Z",
        "version": "1.0.0"
    }
}
````

预期 Hover 行为：

| 字段 | Hover 类型 | 右侧打开为 |
|---|---|---|
| `status` / `metadata.version` / `data.plain_str` / `data.mixed_list[0]` | **String value**（code block 等宽） | `.txt` |
| `data.markdown_str` | **Markdown**（标题/列表/引用/代码块原生渲染） | `.md` |
| `data.json_str` / `data.mixed_list[2]` | **Parsed JSON**（同时显示 CodeLens `▸ Parse JSON`） | `.json` |
| `data.mixed_list[1]` `"**加粗文本**"` | **String value**（长度不足 20 字符 + 单一信号，归类为 text） | `.txt` |

## 开发

```bash
yarn install          # 安装依赖
yarn compile          # 编译 TypeScript
yarn watch            # 监听模式编译
yarn lint             # ESLint 检查
yarn test             # 运行测试（需先 compile + lint）
```

按 F5 启动 Extension Development Host 调试。
