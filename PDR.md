# LexiAI — Product Design Requirements (PDR)

**版本**: v1.0 草案 · 2026-07-05
**作者**: 卿卯 + Claude
**状态**: 待确认

---

## 1. 产品概述

LexiAI 是一个面向高阶英语学习者的个人词汇工作台。核心理念：**一个单词只有经过「查 → 存 → 记 → 用 → 听 → 说」的完整闭环，才算真正掌握**。

现有版本（Gemini / Google AI Studio 构建）已覆盖前五环，本次迭代补齐「说」，并加入游戏化任务体系，最终以开源项目形式发布到 GitHub，支持任何人自带 Gemini API key 部署使用。

### 1.1 目标

| 目标 | 衡量标准 |
|---|---|
| 补齐口语输出环节 | 每个单词都可发起口语练习并获得 AI 反馈 |
| 提升学习粘性 | 打卡 streak、每日任务、单词掌握度体系上线 |
| 公开发布 | GitHub 开源，README 完整，他人 10 分钟内可自行部署 |
| 多端可用 | PWA 可安装到手机主屏，离线可查单词本 |
| 数据不再锁死在单一设备 | 登录后单词本云端同步 |

### 1.2 非目标（本期不做）

- 音素级发音打分（P1，需 Azure Speech）
- 原生 App / App Store 上架（P1，用 Capacitor 打包）
- 多语种支持（仅英语）
- 由项目方承担 API 费用的托管服务（BYOK 模式，无中心化 key）

---

## 2. 用户与使用场景

**主用户**：作者本人 —— 高阶英语学习者，阅读（财经/商业内容为主）时遇到生词随手查询并收藏，碎片时间复习，痛点是口语中提取不出已学词汇。

**次级用户**：GitHub 上的其他英语学习者 —— clone 或访问部署站点，用自己的 Gemini key 使用全部功能。

**核心场景**：
1. 阅读中遇到生词 → 手机/电脑快速查词（金融释义高亮）→ 一键存入单词本
2. 粘贴遇到该词的原文段落 → AI 解释该词在此语境中的确切含义（含比喻义、罕用义）
3. 碎片时间 → 完成每日任务：SRS 复习卡片、造句练习、口语练习、听一集 podcast
4. 口语练习 → 对着手机说，AI 点评用词是否准确、表达是否地道

---

## 3. 设计原则

1. **完整保留现有视觉体系**：衬线标题字体（Playfair Display 风格）、米白/纸质底色、黑色圆角按钮、小号字距加宽的 LABEL 样式、卡片式布局。所有新功能沿用此设计语言。
2. **保留现有五大功能的交互不变**，只做增强不做重构。
3. 新增功能以新 tab 或现有页面内嵌模块的形式出现，不打断现有动线。

---

## 4. 功能需求

### 4.0 现有功能迁移（P0 · 必须无损保留）

| 模块 | 现有能力 | 本次增强 |
|---|---|---|
| **Dictionary** | 查词（金融释义高亮）、同义词对比、长难句 breakdown | 增加「🔊 发音朗读」按钮（TTS） |
| **Notebook** | 收藏单词、释义/同义词/例句/搭配、粘贴 Usage Context、嵌入式 AI Assist 解读语境义 | 显示每个词的掌握度等级与 SRS 状态 |
| **Flashcards** | 顺序翻卡复习 | 升级为 **SRS 间隔重复**（见 4.1） |
| **Practice** | 选词造句 → AI 反馈打分 | 记入掌握度与每日任务；增加口语造句入口 |
| **Podcast** | 选 2–5 词生成双人对话，高亮目标词 | 增加逐句跟读模式（衔接口语训练） |

### 4.1 Flashcards 升级：SRS 间隔重复（P0）

- 采用 SM-2 简化算法：每张卡片翻开后用户自评「忘了 / 模糊 / 记得 / 轻松」，系统据此排期下次出现时间（1d → 3d → 7d → 16d → …）。
- Review 页默认队列 = 今日到期卡片；今日无到期卡时可自由浏览全部。
- 每张卡片背面增加「🔊 朗读」与「去造句 →」快捷入口。
- 现有 322 张卡片迁移时全部初始化为「新卡」状态。

### 4.2 口语训练 Speaking（P0 · 新 tab）

三种模式，全部走「录音 → 语音转文字 → Gemini 点评」链路：

1. **跟读模式（Shadowing）**：播放单词/例句/podcast 台词 TTS → 用户复述 → 对比转写文本与原文，标出漏读、错读的词。
2. **提取模式（Recall）**：展示中文释义或英文 definition → 用户说出目标单词 → 判断是否命中。直击「口语中想不起来单词」的核心痛点。
3. **口头造句模式（Spoken Practice）**：随机/指定一个单词本中的词 → 用户口头造句 → AI 反馈：目标词用法是否正确、语法问题、更地道的说法建议，并打分（与现有 Practice 打分体系一致）。

**技术方案**：
- 首选浏览器 Web Speech API（Chrome 免费、低延迟）。
- **降级方案**：Safari / iOS 上用 MediaRecorder 录音，音频直接发给 Gemini 多模态接口做转写 + 点评（一次调用完成），保证全平台可用。
- TTS：浏览器 speechSynthesis 起步，Gemini TTS 作为高音质选项。

### 4.3 游戏化体系 Gamification（P0）

1. **单词掌握度四段进阶**（每个词独立追踪）：
   `📖 已收录 → 🔁 复习中（SRS 通过≥3次） → ✍️ 会写（造句得分≥80） → 🗣️ 会说（口语练习通过）`
   Notebook 与 Flashcards 中可视化展示；全部达到「会说」= 单词点亮。
2. **每日任务（Daily Quests）**：如「复习 10 张到期卡片」「造句 2 个」「口语练习 1 次」「听 1 集 podcast」。完成得 XP。
3. **Streak 连续打卡**：完成任意一项每日任务即续上 streak；顶栏火焰图标 🔥 显示天数。
4. **XP 与等级**：查词、复习、造句、口语按难度计 XP；等级称号沿用产品调性（Novice → Wordsmith → Lexicon Master…）。
5. **成就徽章**：「首个点亮的单词」「7 天 streak」「100 词收录」等。
6. **限时小游戏（P0 做 1 个，其余 P1）**：同义词配对（Synonym Match，60 秒内把单词与同义词连线）。

### 4.4 账号体系与云存储（P0）

- **Supabase**：邮箱 + Google OAuth 登录；Postgres 存储用户数据，Row Level Security 保证用户间数据隔离。
- 数据模型（核心表）：`profiles`、`words`（词条+释义+同义词+搭配）、`contexts`（Usage Context 文本）、`srs_states`（卡片调度状态）、`practice_logs`（造句/口语记录与得分）、`user_stats`（XP、streak、成就）。
- **未登录可用**（游客模式）：数据存 localStorage，登录后一键合并上云。
- **数据迁移**：提供 JSON 导入/导出；现有 322 个单词从旧版导出后一次性导入。

### 4.5 BYOK：用户自带 API Key（P0）

- 设置页填入 Gemini API key，**仅存于浏览器本地（localStorage），绝不上传服务器**——README 与 UI 中明确声明。
- 所有 AI 调用由前端直连 Gemini API；无自建后端、无中心化费用。
- key 缺失/失效时全站 AI 功能给出友好引导（附申请免费 key 的教程链接）。

### 4.6 PWA（P0）

- `manifest.json` + Service Worker（vite-plugin-pwa）：可安装至手机主屏、全屏运行。
- **离线能力**：单词本、Flashcards 复习离线可用（本地缓存 + 上线后同步）；AI 功能需联网。

### 4.7 发布（P0）

- GitHub 公开仓库：完整 README（截图、功能介绍、自部署教程、Supabase 初始化 SQL、BYOK 说明）、MIT License。
- 演示站部署到 Vercel（纯静态 + Supabase，免费额度内）。

### 4.8 二期 P1（本期不做，架构预留）

- Azure Speech 音素级发音打分
- 更多小游戏（语境填空、单词拼写竞速）
- Capacitor 打包上架 App Store
- 好友排行榜

---

## 5. 技术架构

```
┌─ 前端（AI Studio 导出的 React + TypeScript + Vite，保留现有 UI）
│   ├─ Gemini API（BYOK，浏览器直连）：查词/同义词/句子分析/造句反馈/口语点评/podcast 生成
│   ├─ Web Speech API / MediaRecorder + Gemini 多模态：语音识别
│   ├─ speechSynthesis / Gemini TTS：朗读
│   └─ vite-plugin-pwa：离线与安装
├─ Supabase（免费层）：Auth + Postgres(RLS) + 数据同步
└─ 部署：Vercel（演示站）+ GitHub（开源）
```

**费用**：作者与所有用户均为 $0（Gemini 免费档 + Supabase 免费层 + Vercel 免费层）。

---

## 6. 里程碑

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **M1** | 导入 AI Studio 代码，本地跑通，UI/功能与现状一致 | 五大功能全部可用 |
| **M2** | Supabase 登录 + 云存储 + 游客模式 + 数据导入导出 | 换设备登录后单词本一致；322 词迁移完成 |
| **M3** | SRS 升级 + 掌握度 + 每日任务 + streak + XP + 配对小游戏 | 完整游戏化闭环可玩 |
| **M4** | 口语训练三模式 | Chrome 与 iPhone Safari 均可完成一次口语练习并收到 AI 反馈 |
| **M5** | PWA + README + GitHub 发布 + Vercel 演示站 | 手机可安装；陌生人按 README 可自行部署 |

---

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| AI Studio 导出代码结构未知（可能非标准工程） | M1 阶段先做代码体检，必要时最小化重组，UI 层原样保留 |
| iOS Safari 不支持 Web Speech API 识别 | 已设计 MediaRecorder + Gemini 多模态降级链路 |
| Gemini 免费档限流（RPM/日配额） | 高频操作（SRS 复习）不依赖 AI；AI 调用失败时指数退避 + 友好提示 |
| 旧版数据（322 词）存储位置未知 | 导出代码后确认存储方式，编写一次性迁移脚本 |
| BYOK 对小白用户有门槛 | README + 应用内引导页手把手教申请免费 key |

---

## 8. 待办（用户侧）

- [ ] 从 Google AI Studio 导出 LexiAI 代码（zip 或推到 GitHub），放入 `Claude-cowork/lexiai/` 文件夹
- [ ] 注册 Supabase 账号（免费，M2 开始前需要）
- [ ] 确认本 PDR，或提出修改意见
