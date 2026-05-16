# BetterJsonExplorer

VS Code 扩展：更好的 JSON 预览与编辑工具。

## 功能

1. **智能识别与格式化**：新建文件时，粘贴内容若为合法 JSON 或 JSON 字符串，自动切换语言模式为 JSON 并格式化
2. **JSON 格式切换**：JSON/JSONC 文件中使用 `Cmd+;`（Windows/Linux 为 `Ctrl+;`）在 JSON 格式和 JSON 字符串之间切换
3. **JSON 字符串解析**：对 JSON 中嵌套的 JSON 字符串，提供可点击按钮直接解析为展开的 JSON（后续计划）

## 开发

```bash
yarn install          # 安装依赖
yarn compile          # 编译 TypeScript
yarn watch            # 监听模式编译
yarn lint             # ESLint 检查
yarn test             # 运行测试（需先 compile + lint）
```

按 F5 启动 Extension Development Host 调试。
