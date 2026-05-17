# Changelog

本扩展遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-05-17

### Added
- **任意 string value 的 Hover 预览**：JSON 中所有 string 值支持鼠标悬停预览，按内容自动分类渲染
  - 嵌套 JSON 字符串 → 解析并以格式化 JSON 渲染
  - Markdown 文本（启发式检测：标题/列表/代码围栏/链接/表格等）→ 原生 markdown 渲染
  - 纯文本 / 代码 → 等宽 code block，转义字符按真实换行/制表展示
- **Hover 浮窗内嵌"右侧打开"链接**：点击在 `ViewColumn.Beside` 新开 untitled 文档（`Parsed-<key>.json` / `Value-<key>.md` / `Value-<key>.txt`），多次点击同一分栏多 Tab，新文档自身递归支持嵌套解析
- **嵌套 JSON 字符串 CodeLens**：可解析为 JSON 容器的字符串值上方显示 `▸ Parse JSON` 快捷入口
- 引入 `jsonc-parser` 做位置精确的 AST 遍历（含 JSONC 容错）

### Changed
- 拆分模块：`jsonUtils` / `hoverProvider` / `codeLensProvider` / `logger`，`extension.ts` 仅保留注册与既有热路径
- README 重写：新增功能矩阵、demo JSON 与预期行为对照表

## [0.0.1]

### Added
- 初始版本
- 粘贴自动识别 JSON / JSON 字符串并切换语言模式 + 格式化
- `Cmd+;` / `Ctrl+;` 在 JSON 格式与 JSON 字符串之间切换
