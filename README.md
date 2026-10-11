# 曜石拉密 · Atelier Rummikub

一款高完成度、可直接部署至 Vercel 的现代网页版 **拉密（Rummikub）** 数字组合桌游。采用 **Next.js (App Router) + React 19 + TypeScript + Tailwind CSS + Zustand + dnd-kit** 构建，核心规则引擎与 UI 完全解耦，支持单机 AI 对战、自动本地存档恢复以及可选在线多人房间对战。

## 在线试玩与一键部署至 Vercel

- **自定义主域名**：[https://rummi.xpy.me](https://rummi.xpy.me)
- **Vercel 线上地址**：[https://gemini4test.vercel.app](https://gemini4test.vercel.app)
- **GitHub 源码仓库**：[https://github.com/fxy2026/atelier-rummikub](https://github.com/fxy2026/atelier-rummikub)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffxy2026%2Fatelier-rummikub)

一键克隆部署链接：
`https://vercel.com/new/clone?repository-url=https://github.com/fxy2026/atelier-rummikub`

> **零配置即刻可玩**：基础单机 AI 对战、自动存档恢复及同浏览器多窗口联机 **无需配置任何环境变量、数据库或第三方 API Key**，导入 Vercel 后即可直接构建并公开访问。

---

## 一、功能特性列表

1. **完整严谨的 106 张拉密核心规则引擎 (`src/engine/`)**
   - **标准牌组**：红、蓝、黄、黑四色 `1–13` 各两张（104 张）+ 2 张 Joker 万能牌，共 106 张，每张牌具备全局唯一稳定 ID，全程校验 106 张牌守恒。
   - **合法牌组判定**：
     - **数字组（Group）**：3–4 张相同点数、颜色互不相同的牌。
     - **顺子（Run）**：3–13 张相同颜色、点数连续递增的牌（严格禁止 `13 -> 1` 循环连接）。
   - **首次破冰 30 分规则**：每位玩家首次出牌必须完全使用自己手牌中的牌，且牌组总点数之和 `>= 30` 分（Joker 按其在合法牌组中替代的点数计分），破冰前禁止借用或拆分桌面已有牌组。
   - **后续回合与桌面自由重组**：破冰后支持向现有牌组加牌、拆分桌面长牌组、从 4 张数字组借牌、合并或重组桌面任意牌组。
   - **Joker 严密规则**：动态推导 Joker 在数字组或顺子中所代表的精确点数与颜色；从桌面替换出的 Joker 必须在同一回合重新用于桌面合法牌组，严禁收回手牌。
   - **事务式回合工作区**：回合内支持无限次单步撤销（`撤销`）与一键回滚至回合初始状态（`重置本回合`），提交时统一验证桌面所有牌组。
   - **终局与计分结算**：支持「打空手牌获胜」与「牌池耗尽全员跳过僵局结算（按最低剩余点数判胜）」；败者按剩余手牌点数扣分（Joker 在手牌中按 30 分计罚），胜者获得所有败者扣分之和。

2. **双难度公平 AI 对手系统 (`src/engine/ai.ts`)**
   - 支持 **1 名真人玩家对战 1–3 名 AI**（2 人 / 3 人 / 4 人局自由切换）。
   - **严格公平**：AI 仅接收自身手牌与公共桌面牌组，绝不读取玩家隐藏手牌或牌池顺序。
   - **简单 AI（休闲学者）**：搜索手牌合法数字组与顺子、完成 30 分破冰并进行基础桌面加牌。
   - **困难 AI（曜石宗师）**：基于分支定界回溯搜索最优不交集组合、保留关键 Joker、拆分桌面顺子、从 4 张牌组借牌以及用真牌替换桌面 Joker 组合出牌。
   - **智能提示**：为真人玩家提供一键推荐合法出牌方案（自动摆出至桌面预览，可自由确认提交或撤销）。

3. **精致桌游视觉与双模交互体验 (`src/components/`)**
   - 定制实体树脂牌面质感（凹槽圆点、立体厚度阴影、高对比四色字标 + 辅助花色符号 `♦ ♠ ● ♣` 兼顾色觉无障碍）。
   - **鼠标拖拽 + 触屏点击双模操作**：既支持直接拖拽手牌/桌面牌，也支持点击多选后一键「作为新牌组放到桌面」或「加入此组」，在电脑与手机浏览器上均流畅易用。
   - **实时牌组检查器与破冰进度条**：每个桌面牌组槽实时显示合法状态、类型（顺子/数字组）、点数及 Joker 当前替代值。
   - **Web Audio 程序化音效 (`src/lib/sound.ts`)**：零外部音频资源依赖，实时合成选牌、落牌、破冰和弦、非法提示与胜利音效，支持随时静音。

4. **本地持久化存档 (`src/store/useGameStore.ts`)**
   - 基于 `localStorage` 自动保存对局进度与玩家偏好。
   - 具备版本校验与 106 张牌守恒自检机制，页面刷新后可一键恢复未结束对局，损坏或旧版本存档自动安全清理不崩溃。

5. **进阶功能：在线多人房间对战 (`src/lib/multiplayer.ts` & `src/app/api/rooms/route.ts`)**
   - 支持创建 2–4 人房间、生成 6 位邀请码与一键复制邀请链接（`?room=XXXXXX`）。
   - **服务端权威判定 + 隐藏手牌脱敏**：API 返回前自动剥离其他玩家的隐藏手牌与牌池明文，仅返回手牌数量；采用版本号（`version`）乐观锁防止并发与重复提交；支持通过本地凭证断线重连。
   - **双通道自适应**：配置 Supabase 环境变量后自动启用跨设备云端权威对战；未配置时自动降级为同浏览器跨标签页 `BroadcastChannel` 实时同步联机模式，确保零配置下依然可完整测试联机流程。

---

## 二、本地开发、测试与构建命令

### 1. 安装依赖
```bash
npm install
```

### 2. 启动本地开发服务器
```bash
npm run dev
```
启动后在浏览器访问 `http://localhost:3000`。

### 3. 运行代码规范检查 (ESLint)
```bash
npm run lint
```

### 4. 运行核心规则与 AI 单元测试 (Vitest)
```bash
npm run test
```

### 5. 运行端到端浏览器自动化测试 (Playwright)
```bash
npm run test:e2e
```

### 6. 生产环境构建验证
```bash
npm run build
```

---

## 三、上传至 GitHub 与部署至 Vercel 指南

### 1. 上传至 GitHub 仓库
在项目根目录执行以下命令，将代码推送到你的 GitHub 仓库：
```bash
git init
git add .
git commit -m "feat: initial release of Atelier Rummikub web game"
git branch -M main
git remote add origin https://github.com/<你的GitHub用户名>/<你的仓库名>.git
git push -u origin main
```

### 2. 导入 Vercel 一键部署
1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)。
2. 点击 **"Add New..." -> "Project"**，选择刚才推送的 GitHub 仓库并点击 **Import**。
3. Framework Preset 保持默认的 **Next.js**，无需修改 Build Command（`npm run build`）。
4. 直接点击 **Deploy**，约 1 分钟即可完成构建并获得公开访问域名。

### 3. 可选环境变量说明（仅跨设备云端联机房间需要）
基础单机模式无需任何环境变量。若希望在公网多台设备之间使用在线房间对战：
1. 创建一个免费的 [Supabase](https://supabase.com/) 项目。
2. 在 Supabase SQL Editor 中执行本仓库 `supabase/schema.sql` 中的建表语句。
3. 在 Vercel Project Settings -> Environment Variables 中添加：
   - `NEXT_PUBLIC_SUPABASE_URL`：你的 Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`：你的 Supabase Anon Key
   - `SUPABASE_SERVICE_ROLE_KEY`：你的 Supabase Service Role Key（用于 `/api/rooms` 服务端权威读写）

---

## 四、采用的具体规则说明与已知限制

- **Joker 规则**：采用国际通行锦标赛规则——Joker 在首次破冰出牌中按其替代的数字计分；桌面上的 Joker 可被真牌替换并在同一回合内用于桌面任意合法牌组，但**不能收回手牌**；终局结算时若 Joker 仍留在手牌中，每张计 **30 分** 罚分。
- **顺子边界**：数字范围为 `1–13`，严格禁止 `12-13-1` 或 `13-1-2` 等跨边界循环顺子。
- **已知限制**：
  - 未配置 Supabase 环境变量时，在线多人房间默认使用浏览器 `BroadcastChannel + localStorage` 同机多窗口同步（可在同一电脑打开多个标签页粘贴分享链接体验多人联机），跨设备异地联机需按上述说明配置 Supabase。
