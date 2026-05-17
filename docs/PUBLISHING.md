# 发布流程

> 本扩展通过 **GitHub Actions** 在推送 `v*.*.*` tag 时自动发布到 [VS Code Marketplace](https://marketplace.visualstudio.com/) 与 [Open VSX Registry](https://open-vsx.org/)，并同时挂出带 `.vsix` 附件的 GitHub Release。

---

## 一次性准备

### 1. VS Code Marketplace（微软）

#### a. 微软账号 + Publisher
1. 任意邮箱注册微软账号：https://login.microsoftonline.com
2. 打开 [Marketplace 管理后台](https://marketplace.visualstudio.com/manage) → `Create publisher`
3. **Publisher ID 必须是 `zeke-chin`**（与 `package.json` 字段一致，首次发布后不可更改）

#### b. Azure DevOps PAT
1. 用同一个微软账号登录 https://dev.azure.com（首次会要求创建 organization，名字随意）
2. 右上头像 → `Personal access tokens` → `New Token`
3. 关键参数：
   - **Name**: `vsce-publish`
   - **Organization**: 务必选 **All accessible organizations**（不是某个具体 org）
   - **Expiration**: 1 year
   - **Scopes**: `Show all scopes` → **Marketplace → Manage**
4. 点 `Create`，**立即复制** token（关闭弹窗后无法再次查看）

---

### 2. Open VSX Registry（Eclipse 基金会）

#### a. 注册 + 拿 Token
1. 用 GitHub 账号登录 https://open-vsx.org
2. 右上头像 → `Settings` → `Access Tokens` → `Generate New Token`
3. 复制 token（`ovsxat_*` 形式）

#### b. 创建 namespace
首次发布前必须创建 namespace（与 publisher 同名）：

```bash
export OVSX_PAT=<你的 token>
npx ovsx create-namespace zeke-chin
# 输出：🚀 Created namespace zeke-chin
```

---

### 3. 把 PAT 写进 GitHub Secrets

进 https://github.com/zeke-chin/better-json-explorer/settings/secrets/actions → **New repository secret**：

| Name | Value |
|---|---|
| `VSCE_PAT` | 上面 Azure DevOps 拿到的 PAT |
| `OVSX_PAT` | 上面 open-vsx.org 拿到的 token |

只配置其中一个也能工作 —— release workflow 会跳过对应渠道并打 warning，不阻塞其他步骤。

---

## 日常发布流程（推 tag 自动）

### 标准步骤

```bash
# 1. 改完代码并合并到 main，记得更新 CHANGELOG.md
git pull origin main

# 2. 选语义化版本（patch / minor / major）
yarn version --new-version patch   # 0.1.1 → 0.1.2
# 或显式指定
yarn version --new-version 0.2.0

# 3. 推送 main + tag
git push origin main --follow-tags
```

`yarn version` 自动完成：
1. 改 `package.json` 的 `version`
2. 创建 commit（消息为 `vX.Y.Z`）
3. 创建 git tag（`vX.Y.Z`）

### CI/CD 自动执行的步骤

`git push --follow-tags` 触发 `.github/workflows/release.yml`，按顺序执行：

1. **版本校验** — git tag 与 `package.json` 版本必须一致，否则 fail
2. **完整测试** — `yarn lint && yarn compile && xvfb-run yarn test`
3. **打包** — `vsce package`，输出 `better-json-explorer-X.Y.Z.vsix`
4. **Marketplace 发布**（仅 `VSCE_PAT` 存在时；带 `--skip-duplicate`，重复版本不报错）
5. **Open VSX 发布**（仅 `OVSX_PAT` 存在时；shell 级检测 "already published" → warning 跳过）
6. **GitHub Release** — `if: always()` 始终执行，挂上 `.vsix` 文件 + 自动生成的 commit 列表

### 验证发布结果

- Marketplace：https://marketplace.visualstudio.com/items?itemName=zeke-chin.better-json-explorer （5-15 分钟审核）
- Open VSX：https://open-vsx.org/extension/zeke-chin/better-json-explorer （1-2 分钟 CDN 刷新）
- GitHub Release：https://github.com/zeke-chin/better-json-explorer/releases

---

## 手动本地发布（应急）

CI 挂掉或网络问题时使用：

```bash
# 1. 把全局 bin 加进 PATH（yarn global 默认装在这）
export PATH="$(yarn global bin):$PATH"

# 2. 装工具
yarn global add @vscode/vsce ovsx

# 3. 打包
vsce package
# 检查输出文件清单是否包含 node_modules/jsonc-parser/

# 4. 加载 token（从 .env，已在 .gitignore）
export VSCE_PAT=$(grep '^VSCETokenkey=' .env | cut -d= -f2-)
export OVSX_PAT=$(grep '^OpenVSXToken=' .env | cut -d= -f2-)

# 5. 双渠道发布
vsce publish --pat "$VSCE_PAT"
ovsx publish *.vsix --pat "$OVSX_PAT"
```

---

## CI（pull request / push 到 main）

`.github/workflows/ci.yml` 在以下场景触发：

- push 到 `main`
- 任何针对 `main` 的 PR

执行 `yarn install --frozen-lockfile → lint → compile → test`，确保提交不会破坏构建。

---

## 故障排查

### `Cannot find module 'jsonc-parser'`（运行时）
`.vscodeignore` 误写了 `node_modules/**`，覆盖了 vsce 自动包含生产依赖的智能行为。**不要在 `.vscodeignore` 写 `node_modules/**`**。

每次发布前先 `vsce package` 看一遍清单：
```
└─ node_modules/
   └─ jsonc-parser/   ← 这一项必须出现
```

### `@types/vscode @vscode/X.Y.Z greater than engines.vscode ^A.B.C`
`@types/vscode` 解析到的版本大于 `engines.vscode` 的最低支持版本。两种解法：

- 把 `engines.vscode` 拉到与 types 一致（更激进）
- 把 `@types/vscode` 用 **精确版本**（去掉 caret）锁到 `engines.vscode` 对应的版本（更兼容）

### Open VSX 503 backend write error
他们 CDN/后端偶尔抖动，直接重跑 release workflow（Actions 页 → Re-run failed jobs）或本地 `ovsx publish` 重试即可。

### 已经发过同版本号怎么办
- **CI 中触发**：release workflow 对 Marketplace 用 `--skip-duplicate`、对 Open VSX 做 shell 级 `already published` 检测，**会自动跳过并 warning**，不阻塞 GitHub Release 步骤
- **本地手动触发**：删本地 / 远端 tag，bump 版本号到下一个 patch，重走标准流程；不可在同一版本号上"覆盖"发布

### Tag 与 package.json 版本不一致
release workflow 第一步会拦截。本地修复：

```bash
git tag -d vX.Y.Z              # 删本地错误 tag
git push origin :refs/tags/vX.Y.Z   # 删远程错误 tag
yarn version --new-version X.Y.Z    # 重新走一遍标准流程
git push origin main --follow-tags
```

### 发布成功但搜不到
- Marketplace：5-15 分钟审核中。审核失败会发邮件，去 https://marketplace.visualstudio.com/manage 看后台
- Open VSX：1-2 分钟 CDN 刷新，等等就好

---

## 版本号策略

按 [Semantic Versioning](https://semver.org/lang/zh-CN/)：

- `patch`（0.1.1 → 0.1.2）：bug 修复，不引入新功能
- `minor`（0.1.x → 0.2.0）：新功能，但向后兼容（用户配置/快捷键不破坏）
- `major`（0.x.x → 1.0.0）：破坏性改动（命令重命名、配置项移除等）

发布前务必在 `CHANGELOG.md` 顶部添加新版本条目，按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的 `### Added / Changed / Fixed / Removed` 分类。
