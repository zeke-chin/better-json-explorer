# 性能优化记录

针对 `src/extension.ts` 的丝滑度优化。每项一份单独文档,记录"为什么这样改 + 行为是否一致 + 验证步骤"。

| # | 主题 | 影响 |
|---|---|---|
| [01](./01-paste-detection-cheap-filters.md) | `isWholeDocumentPaste` 廉价过滤 | 消除每次按键的全文 `getText()` 开销 |
| [02](./02-line-based-document-ends.md) | 用 `lineAt` 替换 `positionAt(getText().length)` | 替换全文操作不再分配整文档字符串 |
| [03](./03-format-in-flight-lock.md) | 把锁从内层提到事件入口 | 关闭 await gap 期间的并发竞态窗口 |

## 整体收益

- **键入 / IME 组字**:从「每次 O(n) 全文比较 + 大对象分配」降到 O(1) 短路。
- **粘贴自动格式化**:`switchToJsonAndReplace` + `revealDocumentEnd` 路径不再有任何冗余 `getText()` 调用。
- **粘贴期间继续编辑**:用户输入不再可能被 `applyEdit` 覆盖丢失。

## 行为保证

所有改动都按"对外可见行为零变化"原则实施。详见各文档的"行为是否一致"小节。
