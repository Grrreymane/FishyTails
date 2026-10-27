# 1GP 社区更新帖 · 1.2.0（用户已确认，2026-10-25）

- 游戏：game-9a8c9eb4740c56f3（渔喵传说），线上地址 https://grrreymane.github.io/FishyTails/
- update_id：d0a8a523-6ec2-4a77-900b-e0b9142bd8f4（prepare_game 续用的 1.2.0 更新）
- 版本 1.2.0，changeType minor。10 级海况的版本当作不存在，全部合并进 1.2。
- 配图：`1gp-kit/update-1.2.png`（需要 publisher-mcp 0.12.0 的 `image` 参数）

## 标题

海况、海怪宝物、稀有鱼

## 正文

· 打败海龙王后解锁海况：大风（假咬钩）、小雨（鲨鱼来抢鱼）、下雪（鱼线结冰），通关后解锁配套衣帽
· 海况局里每打败一只海怪，从三件宝物里选一件，只在本局有效
· 通关海况 3 开放无尽深海，同一局接着往下潜，看你能潜多深
· 9 种稀有鱼：海况 2 以上或深海才出现，一条给两个 Buff
· 商店新增 21 件帽子、衣服、花色和船，装备价格调整
· 云存档、排行榜
· 新增日语、韩语、西班牙语

## 步骤

1. `get_publisher_info`：确认 version 0.12.0、capabilities 有 post-images。
2. `publish_link`：url 用上面的线上地址，release = { updateId, version: 1.2.0, changeType: minor, title, notes }。
3. `complete_game_update`：project_directory、update_id、title、notes、image: "1gp-kit/update-1.2.png"、approved: true。
