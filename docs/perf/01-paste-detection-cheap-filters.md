# 01 — `isWholeDocumentPaste` 廉价过滤

## 背景

扩展在 `activate` 里注册了 `vscode.workspace.onDidChangeTextDocument` 监听器,用于检测「整片粘贴 JSON 到 plaintext 文档」的场景,并自动切换语言模式 + 格式化。

```ts
// 原 isWholeDocumentPaste
function isWholeDocumentPaste(event) {
    if (event.contentChanges.length !== 1) return false;
    const change = event.contentChanges[0];
    const insertedText = change.text.trim();
    if (insertedText.length === 0) return false;
    return event.document.getText().trim() === insertedText;
}
```

## 为什么这是热路径瓶颈

`onDidChangeTextDocument` 在以下情况都会触发:

- 每一次键盘输入(每个字符一次)
- 每一次 IME 组字事件
- 每一次自动补全 / 格式化产生的编辑
- 每一次扩展自身 `applyEdit` 的回环

每次触发时,原实现会执行:

1. `event.document.getText()` — 从 VS Code 内部 piece-tree 拼接整个文档为一个新的 JS string,O(n) 内存分配。
2. `.trim()` — 在该 string 上再扫一遍首尾。
3. 全长字符串等值比较 — 再扫一遍。

对几百 KB 的 JSON 文档,每按一个字符就要做以上三步,主线程被吃满,体感上就是「不丝滑」。

## 改法

加两道 O(1) / O(短文本) 的廉价过滤,把 99% 的非粘贴事件在第一时间挡掉,只有真正可能是整片粘贴的少数事件才走到 `getText()`:

```ts
function firstNonWhitespaceChar(text: string): string | undefined {
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        if (ch !== 0x20 && ch !== 0x09 && ch !== 0x0a && ch !== 0x0d) {
            return text[i];
        }
    }
    return undefined;
}

function isWholeDocumentPaste(event) {
    if (event.contentChanges.length !== 1) return false;
    const change = event.contentChanges[0];

    // 过滤 1:整片替换的必要条件 —— rangeOffset 必须为 0
    if (change.rangeOffset !== 0) return false;

    const inserted = change.text;

    // 过滤 2:首个非空白字符必须是 JSON 容器/字符串起始符
    const head = firstNonWhitespaceChar(inserted);
    if (head !== '{' && head !== '[' && head !== '"') return false;

    // 只有通过两道过滤才做昂贵的全文比较
    return event.document.getText().trim() === inserted.trim();
}
```

### 过滤 1 的依据

VS Code 的 `TextDocumentContentChangeEvent.rangeOffset` 是本次 change 在 **原文档** 中的起始偏移。整片替换必然从偏移 0 开始,所以 `rangeOffset !== 0` 可以直接排除。中间打字 / 末尾补全 / 文档中段编辑全部命中此过滤。

### 过滤 2 的依据

`formatJsonOrJsonString` 内部要么得到一个 `isJsonContainer`(对象 / 数组),要么得到一个可以继续 unwrap 的 JSON 字符串。三种情况的首字符分别是 `{`、`[`、`"`,**没有第四种可能**。所以首字符不是这三者中之一时,即便 `isWholeDocumentPaste` 返回 true,后续 `formatJsonOrJsonString` 也必返回 `undefined`,无任何对外可见副作用。提前 reject 完全等价。

`firstNonWhitespaceChar` 用 `charCodeAt` 手写一遍而不是 `inserted.trimStart()[0]`,是为了避免 `trimStart` 分配新字符串 —— 大粘贴时这一步本身也别让它有分配。

## 行为是否一致

| 编辑场景 | 原代码 | 新代码 |
|---|---|---|
| 中间打字(rangeOffset > 0) | getText 后比较,必 false | 过滤 1 直接 false ✅ |
| 在文档开头输入 1 个字母 | getText 后比较 → 可能 true,但 formatJsonOrJsonString 必返回 undefined,不做事 | 过滤 2 直接 false,也不做事 ✅ |
| 选中全部 → 粘贴 `{...}` | getText 后比较 → true | 两道过滤通过 → 全文比较 → true ✅ |
| 空文档 → 粘贴 `{...}` | true | 同上 → true ✅ |
| 粘贴一次包装的 JSON 字符串 `"{\"a\":1}"` | true | head=`"`,通过 → true ✅ |
| 粘贴一段普通文本 `hello` | getText 后比较 → 可能 true,但格式化必失败 | 过滤 2 直接 false ✅ |

对外可见行为零变化。只是把「中间打字」这条最高频路径从 O(n) + 大内存分配 降到了 O(1)。

## 验证

- `yarn compile` ✅
- `yarn lint` ✅
