MCP 问题反馈：set_game_details 改不了游戏原始语言的简介，而且不报错（用户让你来修）。

复现（publisher-mcp 0.12.1，游戏 game-9a8c9eb4740c56f3 渔喵传说，原始语言 zh，get_game_materials 里 original.source = "registered"）：
1. set_game_details({ gameSlug, descriptions: { zh: "<新简介>", en: ..., ja: ..., ko: ..., es: ... } }) → 返回 { ok: true }。
2. get_game_materials：en/ja/ko/es 变成新内容（source creator），但 zh 和 original.description 还是旧的。zh-Hant/pt-BR/de/fr/ru 是平台从 zh 原文翻译的，也跟着停在旧版（只能把它们也当 creator 文本手动设掉）。
3. 工具描述里写了 "leave out the original language"，但实际传了 zh 照样回 ok，被悄悄丢掉。作者只能去开发者中心网页手改。

希望：
- 首选：MCP 能改原始语言的名字和简介（作者认可后）；改完后平台翻译的语言标记为过期、按新原文重翻；作者手写过的语言不覆盖。
- 至少：传了原始语言时明确报错（例如 ORIGINAL_LOCALE_READ_ONLY，附开发者中心编辑链接），不要返回 ok。
- 返回值列出每种语言实际写入 / 跳过的情况，方便核对。

相关代码：mcp/src/server.js:144 的 set_game_details，以及它调用的平台接口。改完发版时告诉「钓鱼游戏」会话 tag，再用 MCP 把渔喵的中文简介改上去。

---

第二个问题：set_game_media 换不了已有的主封面和预览视频。

fillMissing 固定为 true，主封面和预览只补缺失的。作者做了新封面（渔喵 cover.png / media/cover-1600x900.png，标题换成像素字）和新宣传视频（trailer.mp4，2026-10-24），平台上还是 10-13 的旧版，只能去网页手动换。

希望：加一个作者明确要求时的替换模式（比如 replace: ["cover", "preview"] + approved: true），旧素材留在历史里可以回退；返回值说明哪些替换了、哪些跳过了。
