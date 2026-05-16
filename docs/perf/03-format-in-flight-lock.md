# 03 — 把锁从 `switchToJsonAndReplace` 提到事件入口

## 背景

原本有一把"防重入"的锁,但位置不对:

```ts
// 原 switchToJsonAndReplace
async function switchToJsonAndReplace(document, formatted) {
    const documentKey = document.uri.toString();
    if (processingDocuments.has(documentKey)) return;

    processingDocuments.add(documentKey);              // ← 加锁
    try {
        const jsonDocument = document.languageId === 'json'
            ? document
            : await vscode.languages.setTextDocumentLanguage(document, 'json');  // ← await
        // ... applyEdit, reveal
    } finally {
        processingDocuments.delete(documentKey);
    }
}
```

而事件入口长这样:

```ts
vscode.workspace.onDidChangeTextDocument((event) => {
    if (!isWholeDocumentPaste(event) || !shouldAutoFormatDocument(event.document)) return;
    formatDocumentIfPossible(event.document).then(...);   // ← 没有锁保护
});
```

## 两个真实问题

### 问题 A:加锁太晚,有 await gap

时间线:

```
t=0  用户粘贴 → onDidChange fires
t=1  isWholeDocumentPaste = true
t=2  调 formatDocumentIfPossible → switchToJsonAndReplace
t=3  await setTextDocumentLanguage ─────────  锁还没加
t=4  锁加上 (processingDocuments.add)
t=5  applyEdit → 又一次 onDidChange fires
```

`t=3` 到 `t=4` 之间事件循环是开放的,任何额外的 change(用户继续输入、其他扩展的编辑)都不会被锁挡住,会重新走一遍 `isWholeDocumentPaste` + 整片比较。

虽然 `t=5` 那次 applyEdit 自身的回环最终被 `shouldAutoFormatDocument`(languageId 已切到 `json`)挡住,但这是个**侧面保护**,逻辑上脆,改一行就可能失效。

### 问题 B:并发输入竞态

用户粘贴大 JSON 后立刻继续打字 → 在 `await setTextDocumentLanguage`、`await applyEdit` 期间用户的输入也会触发 onDidChange。这些事件:

- 在没修问题 1 之前 → 每次都做全文 `getText().trim()` 比较 → 卡顿叠加;
- 在修了问题 1 之后 → `rangeOffset !== 0` 已经能挡掉中间打字。但开头打字、IME 组字等仍然会绕过两道廉价过滤进入昂贵比较。

更糟的是,**format 异步路径里我们刚刚算出来要把整篇替换成 `formatted`,而用户的并发输入此刻在文档里产生新内容,applyEdit 一旦完成会把这些新内容覆盖丢失**。这是数据丢失级别的体感问题。

## 改法

把锁从 `switchToJsonAndReplace` 内部提到事件监听器的**最外层**,在 `await` 出现之前就 add,任何 in-flight 期间的 change 一律短路:

```ts
const formatInFlight = new Set<string>();

vscode.workspace.onDidChangeTextDocument((event) => {
    const documentKey = event.document.uri.toString();
    // 短路 in-flight 期间所有事件
    if (formatInFlight.has(documentKey)) return;

    if (!shouldAutoFormatDocument(event.document) || !isWholeDocumentPaste(event)) return;

    formatInFlight.add(documentKey);
    formatDocumentIfPossible(event.document)
        .catch((error) => logError('Failed to format pasted JSON.', error))
        .finally(() => formatInFlight.delete(documentKey));
});
```

同时把 `switchToJsonAndReplace` 内部的锁逻辑删掉(已经在外层保护,内层重复反而成了误导):

```ts
async function switchToJsonAndReplace(document, formatted) {
    const jsonDocument = document.languageId === 'json'
        ? document
        : await vscode.languages.setTextDocumentLanguage(document, 'json');
    const fullRange = getFullDocumentRange(jsonDocument);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(jsonDocument.uri, fullRange, formatted);
    await vscode.workspace.applyEdit(edit);
    revealDocumentEnd(jsonDocument);
}
```

## 顺手收的小毛病

- 把廉价的 `shouldAutoFormatDocument` 放到 `isWholeDocumentPaste` 之前,因为前者是单字段判断,后者最坏情况要走 `getText().trim()`。判断顺序反着写更省。
- `.then(undefined, errHandler)` 改成 `.catch(errHandler).finally(cleanup)`,因为我们需要无论成功失败都释放锁。

## 行为是否一致

| 场景 | 原行为 | 新行为 |
|---|---|---|
| 用户单次粘贴 → 触发格式化 | format 跑完;applyEdit 回环被 languageId 检查挡掉 | format 跑完;applyEdit 回环 + 用户并发输入都被锁挡掉 ✅ |
| 用户粘贴中 await gap 期间继续打字 | 这些 keystroke 重新走一遍 `isWholeDocumentPaste`,最坏情况触发并发 format → 数据可能被覆盖 | 锁挡掉 → 用户的输入仍正常落入文档,但不再触发并发 format。format 完成后用户可继续编辑 ✅ |
| toggle 命令(JSON ↔ string) | 完全不走 `switchToJsonAndReplace`,无影响 | 同上,无影响 ✅ |
| 极端:format 自身抛错 | 锁会卡死(原代码 try/finally 保护,但只在内层) | `.finally` 保证释放 ✅ |

## 验证

- `yarn compile` ✅
- `yarn lint` ✅
- `grep` 确认无 `processingDocuments` 残留引用
