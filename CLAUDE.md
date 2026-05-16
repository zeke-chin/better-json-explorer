# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

BetterJsonExplorer — VS Code 扩展，提供更好的 JSON 预览与编辑体验。

## 常用命令

```bash
yarn compile          # TypeScript 编译到 out/
yarn watch            # 监听模式编译
yarn lint             # ESLint 检查
yarn pretest          # compile + lint
yarn test             # 运行测试（@vscode/test-cli + mocha）
```

调试：按 F5 启动 Extension Development Host。

## 架构

- **入口**：`src/extension.ts` — 导出 `activate`/`deactivate`，在此注册命令和事件监听
- **测试**：`src/test/` — mocha 测试，文件匹配 `**.test.ts`，编译后输出到 `out/test/`
- **构建产物**：`out/` 目录（由 `tsconfig.json` 的 `outDir` 控制）
- **扩展清单**：`package.json` 的 `contributes` 字段声明命令、菜单、快捷键等扩展点

## 技术栈

- TypeScript strict 模式，ES2022 target，Node16 模块系统
- Yarn 包管理器（`.yarnrc` 设置 `--ignore-engines true`）
- ESLint 9 + typescript-eslint
- VS Code Extension API runtime target `^1.105.0`

## 开发注意事项

- 所有 VS Code API 交互通过 `vscode` 模块
- 扩展激活时机由 `activationEvents` 控制：当前在 `plaintext`、`json`、`jsonc` 语言模式下激活
- `package.json` 的 `main` 指向 `./out/extension.js`
- 修改代码后需重新编译（`yarn compile`）或开 watch 模式
