[English](README.md) | **中文**

# 世界杯 2026 · 多模型预测擂台 — 前端

> 🌐 **在线演示:** https://zhenran-wang.github.io/worldcup-arena-web/
> 🧩 **代码与数据(基准):** https://github.com/Zhenran-Wang/worldcup-arena-codebase

**2026 世界杯多模型预测基准**的前端展示页。6 家**最新旗舰、SOTA** 大模型(Claude / GPT / Gemini / Kimi / GLM / Seed)给每场比赛填一张足球竞猜卡;本站展示它们的预测、全局彩池,以及一个**按真实赛果实时结算的积分榜**。

## 页面有什么

- **模型积分榜** —— 实时排名,赛果一出即更新;
- **竞猜卡** —— 每场比赛、6 模型 × **7 个市场**(胜平负 · 让球 · 大小 2.5 · 双方进球 · 单双 · 半全场 · 正确比分),并带**赛果**对照列;
- **全局彩池** —— 夺冠 · 进决赛 · 四强 · 夺冠大洲 · 总进球;
- **小组头名** —— 每个模型为 12 组各押一支头名;
- **今日赛程 & 完整赛程** —— 随赛事逐日揭晓。

算分规则(页面上有):单场各市场 **+1 ~ +5**,全局彩池从 **+25**(夺冠)到 **+2**(小组头名)。所有预测开赛前封盘,押中累加进积分榜。

## 技术

纯静态站 —— **原生 HTML / CSS / JavaScript,无构建、零依赖**,用 **GitHub Pages** 部署。中英双语(靠 `data-en` / `data-zh` 属性切换)。

## 文件

| 文件 | 是什么 |
|---|---|
| `index.html` | 页面结构(封面 · 积分榜 · 擂台 · 赛程 · 方法) |
| `worldcup.css` · `styles.css` | 样式 —— `worldcup.css` 是本项目,`styles.css` 是共享基座 |
| `worldcup-data.js` | **预测数据** —— 各模型的预测(`PRED`)+ 标签/映射表。由基准的预测档案生成。 |
| `worldcup-arena.js` | 算分配置 —— 市场、分值、真实赛果(`RESULTS` / `CHAMPION` / `GROUP_WINNERS` …) |
| `worldcup-ui.js` | 渲染 —— 积分榜、竞猜卡、彩池、导航高亮 |
| `worldcup-app.js` · `worldcup-knockout.js` | 球队 / 赛程 / 分组 / 淘汰赛对阵 数据 |

## 数据从哪来

预测和真实赛果都在 **[代码仓库](https://github.com/Zhenran-Wang/worldcup-arena-codebase)** 的 `wc_runs/archive/` 里。那边的 `update_web.py` 把它们写进 `worldcup-data.js`(`PRED` 对象)和 `worldcup-arena.js`(`RESULTS`),并 bump `index.html` 的 `?v=` 缓存戳。

> 页面**数据由档案驱动 —— 别手改 `worldcup-data.js`**(用 `update_web.py`)。

## 本地运行

```bash
# 任意静态服务器，例如
python3 -m http.server 8000
# 打开 http://localhost:8000
```

---

所有预测均**由模型生成,仅供娱乐**。
