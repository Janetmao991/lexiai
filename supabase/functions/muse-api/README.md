# muse-api — 让 Muse（手机 + Mac）读 LexiAI 单词本、每天带你复习

Muse 跑在 Meta 的云端 VM 里，手机端和 Mac 端共用同一个账号，所以接口必须是**公网可达**的。
这个 Edge Function 部署在 LexiAI 已有的 Supabase 项目里，Muse 通过一个 Bearer token 调用它。
不需要在你的 Mac 上常开任何东西。

```
Muse (iOS / Android / Mac / WhatsApp)
   │  HTTPS + Bearer token
   ▼
https://aqsiysberojrxasbnmoe.supabase.co/functions/v1/muse-api
   │  service role（只查你一个账号）
   ▼
Supabase `words` / `user_stats` 表  ◀──双向同步──▶  LexiAI 网页 / PWA
```

复习结果会以 LexiAI 同样的 SM-2 算法写回 `words` 表并带上 `lastModified`，LexiAI 下次打开时 newer-wins 合并会直接吃到，Flashcards 的到期状态和 Mastery 等级都保持一致。

## 一、部署（一次性，约 5 分钟）

```bash
brew install supabase/tap/supabase
supabase login                                   # 会打开浏览器
cd ~/lexiai
supabase link --project-ref aqsiysberojrxasbnmoe
```

生成一个给 Muse 用的 token，并设置 secrets（邮箱填你登录 LexiAI 用的 Supabase 账号邮箱）：

```bash
TOKEN=$(openssl rand -hex 32); echo "MUSE_API_TOKEN=$TOKEN"   # 记下来，只显示这一次
supabase secrets set MUSE_API_TOKEN="$TOKEN" LEXI_USER_EMAIL="you@example.com" LEXI_TIMEZONE="America/Los_Angeles"
```

部署（`--no-verify-jwt` 是必须的：函数自己校验 token，不走 Supabase 的登录 JWT）：

```bash
supabase functions deploy muse-api --no-verify-jwt
```

验证：

```bash
BASE=https://aqsiysberojrxasbnmoe.supabase.co/functions/v1/muse-api
curl -s $BASE/                                        # 公开的接口说明，不需要 token
curl -s -H "Authorization: Bearer $TOKEN" $BASE/stats
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/words/due?limit=5"
```

> 安全提示：这个 token 等于你单词本的读写权限。只通过 Muse 的凭证输入框交给它，不要贴在聊天里。
> 想作废就 `supabase secrets set MUSE_API_TOKEN=<新值>` 再 deploy 一次。

## 二、在 Muse 里添加自定义连接器

Muse 没有设置表单，直接在对话里说。手机或 Mac 任意一端加一次，两端都能用。把下面这段发给 Muse：

```
Add a custom connector for my personal vocabulary app "LexiAI".
Entry point: REST API, docs at https://aqsiysberojrxasbnmoe.supabase.co/functions/v1/muse-api/  (GET / returns the full API description as JSON).
Auth: Bearer token in the Authorization header — I'll enter it in the secure credential prompt.
I want you to be able to: read my notebook stats (GET /stats), fetch today's due flashcards (GET /words/due), look up or search words (GET /words, GET /words/{word}), pull random words (GET /words/random), and record my review ratings (POST /reviews with {word, rating} where rating is again|hard|good|easy).
Save this as a reusable skill called "LexiAI".
```

Muse 会问传输方式（答 HTTP）和认证方式（答 Bearer token），然后弹出凭证输入框，把 `MUSE_API_TOKEN` 贴进去。它会自己调一遍 `/stats` 测试，成功后保存为 skill。
在 Settings → 连接器里把 LexiAI 的读取权限设为 Always allow，写入（POST /reviews）可以保留每次确认，也可以 Always allow。

## 三、设置每天主动复习

再发一条：

```
Every day at 8:30am, use my LexiAI skill: call GET /words/due?limit=15. If dueCount is 0, just tell me my streak from GET /stats and stop.
Otherwise run a quick drill: for each word, first show only the word and IPA and ask me what it means; after I answer, reveal the definition, one example, and my own saved context sentence if there is one, and ask me to rate myself again / hard / good / easy. After the session, POST /reviews once with all my ratings in a batch, then summarize: how many reviewed, which ones I marked "again", and how many are left for tomorrow.
```

之后随时也可以直接说：
- "Quiz me on 10 random LexiAI words at Reviewing level"（`/words/random?n=10&level=2`）
- "What does *at the margin* mean in my notebook?"（`/words/at the margin`）
- "How many words are due today?"（`/stats`）

## 当前状态（2026-09-27）
已部署并接入 Muse。Muse 侧连接器名为 LexiAI，读取权限设为始终允许；定时任务为每晚约 9:14，推最多 8 个到期词（最难的优先），用户回复 again/hard/good/easy 后批量写回 `/reviews`。
换 token：`supabase secrets set MUSE_API_TOKEN=<新值>` 后重新 deploy，并在 Muse 的连接器设置里更新凭证。

## 接口速查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 接口说明（公开） |
| GET | `/stats` | 总词数、今日到期数、Mastery 分布、streak / XP |
| GET | `/words/due?limit=20` | 今日到期卡片，最难的（lapses 多、ease 低）排前面 |
| GET | `/words/random?n=10&level=1..4` | 随机抽样 |
| GET | `/words?q=margin&level=2&limit=50` | 列表 / 搜索 |
| GET | `/words/{word}` | 单词完整条目（大小写不敏感） |
| POST | `/reviews` | `{word, rating}` 或 `{reviews:[{word, rating}]}`，rating ∈ again/hard/good/easy |

## 已知边界
- 只写 `words` 表；不改 `user_stats`（XP、streak、每日任务）。也就是说在 Muse 里复习**不会**给 LexiAI 加 XP 或续 streak，避免和 App 端的合并逻辑打架。以后想要的话可以加。
- 日期以 `LEXI_TIMEZONE` 为准，和 LexiAI 用本地日期的习惯一致。
- 本地开发时可以 `deno run --allow-net --allow-env --config deno.json index.ts` 起在 8000 端口，用假 env 测路由；真实数据需要 service role key，只在云端有。
