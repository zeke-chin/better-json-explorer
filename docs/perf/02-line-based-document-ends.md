# 02 — 用 `lineAt` 替换 `positionAt(getText().length)`

## 背景

代码里有三处需要拿到「整个文档的末尾位置」或「覆盖整个文档的 Range」:

- `revealDocumentEnd` —— 把光标移到文档末尾
- `replaceEditorText` —— 用 `editor.edit` 替换全文
- `switchToJsonAndReplace` —— 用 `WorkspaceEdit` 替换全文

原实现统一用 `document.positionAt(document.getText().length)`:

```ts
// 原 revealDocumentEnd
const endPosition = document.positionAt(document.getText().length);

// 原 replaceEditorText
const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
);
```

## 为什么这是性能问题

`document.getText()` 不是免费的:

- VS Code 内部用 piece-tree 表示文档,`getText()` 会遍历 piece-tree 并把所有片段拼接成一个**新分配**的 JS string。
- 对几百 KB 的文档,这一步本身就要 O(n) 时间 + 一次大对象分配 + 一次 GC 压力。
- 我们调用 `getText()` 只是为了拿 `.length`,这个 string 立刻被丢弃,完全浪费。

`positionAt(N)` 接着在 piece-tree 上做一次二分查找把 offset 映射为 `(line, character)`,这步是 O(log n),开销可控,但前面那次大字符串分配才是真正的成本。

「替换全文」是个低频操作(toggle 命令、粘贴格式化),但每次都做一次完全不必要的 O(n) 分配,而且大粘贴恰好就是文档最大的时候 —— 越大越慢。

## 改法

抽出两个工具函数,基于 VS Code 文档行模型直接拿末尾位置:

```ts
function getDocumentEndPosition(document: vscode.TextDocument): vscode.Position {
    return document.lineAt(document.lineCount - 1).range.end;
}

function getFullDocumentRange(document: vscode.TextDocument): vscode.Range {
    return new vscode.Range(new vscode.Position(0, 0), getDocumentEndPosition(document));
}
```

三处调用全部改用这两个函数。

### 为什么 `lineAt` 更便宜

- `document.lineCount` 直接读 piece-tree 缓存的行数,O(1)。
- `document.lineAt(n)` 通过行索引定位到对应节点,**不分配字符串**,代价基本 O(1) ~ O(log n)。
- `line.range.end` 是预先算好的 `Position` 字面值。

整条路径不再有任何全文字符串分配。

## 行为是否一致

VS Code `TextDocument` 的契约保证:

- `lineCount` 始终至少为 1(空文档也是 1 行)。
- `lineAt(lineCount - 1).range.end` 严格等于 `positionAt(getText().length)`。
  - 空文档:两者都是 `(0, 0)`。
  - 普通文档:两者都是最后一个非空行的尾部 `(lineCount-1, lastLineLength)`。
  - 以 `\n` 结尾的文档:VS Code 行模型在结尾追加一个虚拟空行,`lineCount` 计入,`lineAt(lineCount - 1).range.end` 是该虚拟空行的 `(line, 0)`;`positionAt(getText().length)` 也指向同一位置。

`new vscode.Position(0, 0)` 也严格等于 `positionAt(0)`,这是定义。

因此 `WorkspaceEdit.replace` / `editor.edit` 的目标 Range、`revealRange` 的目标位置、`editor.selection` 的位置**逐字段相同**,对外可见行为零变化。

## 收益估算

| 操作 | 原 getText 次数 | 新 getText 次数 |
|---|---|---|
| toggle JSON ↔ string(`replaceEditorText`) | 2 次 | 0 次 |
| 粘贴自动格式化(`switchToJsonAndReplace` + `revealDocumentEnd`) | 2 次 | 0 次 |
| 任意 reveal(`revealDocumentEnd` 单独调用) | 1 次 | 0 次 |

每次 `getText` 省下的就是一次对当前文档规模的字符串分配。配合本次粘贴的文档往往是文档最大态,这块的实际收益比次数看起来要大。

## 验证

- `yarn compile` ✅
- `yarn lint` ✅
