# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

BetterJsonExplorer — VS Code 扩展，提供更好的 JSON 预览与编辑体验。已发布到 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=zekeChin.better-json-explorer) 与 [Open VSX](https://open-vsx.org/extension/zekeChin/better-json-explorer)。

## 常用命令

```bash
yarn compile          # TypeScript 编译到 out/
yarn watch            # 监听模式编译
yarn lint             # ESLint 检查
yarn pretest          # compile + lint
yarn test             # 运行测试（@vscode/test-cli + mocha）
yarn package          # vsce 本地打包出 .vsix
```

调试：按 F5 启动 Extension Development Host。

## 架构

源码拆分为 7 个职责清晰的模块，避免 `extension.ts` 膨胀：

| 文件 | 职责 |
|---|---|
| `src/extension.ts` | 仅 `activate`/`deactivate`、provider/command 注册、`onDidChangeTextDocument` 粘贴热路径、`Cmd+;` toggle |
| `src/jsonUtils.ts` | 纯函数：`formatJsonOrJsonString` / `stringifyJsonText` / `tryUnwrapJsonString`（JSON-only）/ `tryUnwrapStructured`（JSON 失败时兜底走 Python，返回 `sourceKind: 'json' \| 'python'`）/ `findStringValues` / `findNestedJsonStrings` / `detectStringFormat`（Markdown 启发式打分） |
| `src/pythonRepr.ts` | 纯函数 `pythonReprToJson(input)`：手写递归下降解析器，把 Python `repr(dict)` 字面量转为合法 JSON 文本。覆盖 `ast.literal_eval` 子集（dict/list/tuple/str/num/bool/None），遇到函数调用 / 对象 repr / bytes / set literal 整体放弃 |
| `src/textNormalize.ts` | 纯函数 `escapeQuotedLineBreaks(input)`：单趟扫描修复"字符串字面量内部含真换行"的输入（终端宽度折行造成）。识别 `"..."` 与 `'...'` 两类引号、honors `\\` 转义、CRLF 算单换行。string 外的换行原样保留。fast path：无换行直接返回 |
| `src/hoverProvider.ts` | `NestedJsonHoverProvider`：覆盖所有 string value，按内容分类渲染 JSON / Markdown / 纯文本。预览超 `MAX_PREVIEW_CHARS` 截断；浮窗顶部第二行与底部各放一个 "Open in side panel" 按钮（同一 token 复用）。按钮**不内嵌 content**，只带 `parseNestedCommand.ts` store 的 token（见下方开发注意事项）。根据 `hit.sourceKind` 区分显示 "Parsed JSON" 还是 "Parsed Python dict" |
| `src/codeLensProvider.ts` | `NestedJsonCodeLensProvider`（按 `sourceKind` 显示 `▸ Parse JSON` 或 `▸ Parse Python dict`）+ `parseNestedJsonCommand`（按 `kind` 决定 `.json`/`.md`/`.txt` + `Parsed-`/`Value-`/`Parsed-py-` 前缀，`ViewColumn.Beside` + `preview:false` 在右侧多 Tab 打开） |
| `src/logger.ts` | OutputChannel 包装，全模块共用 |

### 数据流

1. `parseTree` (jsonc-parser) → AST
2. `walkAllStrings` 遍历 AST，对每个 string value 调 `tryUnwrapStructured`：先 JSON 多层 unwrap（最多 4 层），失败再尝试 Python repr → JSON 转换；命中时附带 `sourceKind` 标识
3. `findStringValuesRaw` 返回 `{offset, length, keyPath, rawValue, parsedText?, sourceKind}`，Hover/CodeLens 在此基础上叠加 `vscode.Range` 并按 `sourceKind` 分支文案
4. `keyPath` 形如 `data.items[2].config`，用于命名右侧打开的 untitled 文档（Python 来源命名为 `Parsed-py-{keyPath}.json`）

**顶层粘贴入口（`formatJsonOrJsonString`）的预处理顺序**：
1. `trim()`
2. `escapeQuotedLineBreaks()` 修复跨行复制造成的非法 JSON（字符串内真换行）
3. JSON.parse 多层 unwrap
4. JSON 失败 → `pythonReprToJson()` 兜底

### 测试

- 单测在 `src/test/jsonUtils.test.ts` 与 `src/test/pythonRepr.test.ts`，覆盖所有纯函数（`tryUnwrapJsonString` / `tryUnwrapStructured` / `findStringValuesRaw` / `detectStringFormat` / `formatKeyPath` / `pythonReprToJson` 等）
- 通过 `@vscode/test-cli` 启 Extension Development Host 运行，文件匹配 `**.test.ts`，编译后输出到 `out/test/`
- Provider 类未做集成测试（成本高），靠 F5 手测

## 技术栈

- TypeScript strict 模式，ES2022 target，Node16 模块系统
- Yarn 包管理器（`.yarnrc` 设置 `--ignore-engines true`）
- ESLint 9 + typescript-eslint
- 运行时依赖：`jsonc-parser ^3.3.1`（VS Code 自身也在用，做位置精确的 AST 解析含 JSONC 容错）
- `engines.vscode`: `^1.105.0`，`@types/vscode` 用**精确版本** `1.105.0` 锁住（caret 范围会解析到 1.120.x，与 engines 不匹配会被 vsce 拒绝）

## 开发注意事项

- 所有 VS Code API 交互通过 `vscode` 模块
- 扩展激活时机由 `activationEvents` 控制：当前在 `plaintext`、`json`、`jsonc` 语言模式下激活
- `package.json` 的 `main` 指向 `./out/extension.js`
- 修改代码后需重新编译（`yarn compile`）或开 watch 模式
- **Hover 打开链接走 token、不内嵌 content**：大 string value 若把 content 塞进 `command:` URI，编码后可达 100KB+，**超出 hover 渲染层对 command href 的承载，点击时 args 会整体丢失**（命令收到全 `undefined`，旧版即因此在 `sanitize` 崩溃）。改由 `stashPendingOpen` 把完整 content 存进 `parseNestedCommand.ts` 的模块级 store（带 LRU 上限 `MAX_PENDING_OPENS`），URI 只带短 token，`PARSE_BY_TOKEN_COMMAND_ID` 命令用 `takePendingOpen` 取回；`MarkdownString.isTrusted` 须含 `[PARSE_BY_TOKEN_COMMAND_ID]`。**CodeLens 不受此限**（`command.arguments` 走宿主 RPC 可携带大 payload，仍用 `PARSE_COMMAND_ID` + 真 content）
- **`extension.ts` 中的 `formatInFlight` 锁**和 `firstNonWhitespaceChar` 提前过滤是粘贴热路径的关键优化，改 `onDidChangeTextDocument` 监听时不要破坏
- **`.vscodeignore` 不要写 `node_modules/**`** —— vsce 默认会自动只包含生产依赖，手写规则反而覆盖它，导致运行时报 `Cannot find module 'jsonc-parser'`（详见 `docs/PUBLISHING.md` 故障排查）

## 发布

完整发布流程参见 **[docs/PUBLISHING.md](docs/PUBLISHING.md)**：

- 一次性准备：Marketplace publisher + Azure DevOps PAT；Open VSX namespace + token；GitHub Secrets (`VSCE_PAT` / `OVSX_PAT`)
- 日常发布：`yarn version --new-version patch && git push origin main --follow-tags` 触发 `.github/workflows/release.yml`，自动跑测试 → `vsce package` → 双渠道发布 → GitHub Release
- CI（`.github/workflows/ci.yml`）：每次 push / PR 到 `main` 跑 lint + compile + test
- 应急本地发布与常见故障排查（jsonc-parser 漏打包 / `@types/vscode` 冲突 / Open VSX 503 / tag 不一致）
