**English** | [中文](README_zh.md)

# World Cup 2026 · Multi-LLM Prediction Arena — Web

> 🌐 **Live site:** https://zhenran-wang.github.io/worldcup-arena-web/
> 🧩 **Code & data (benchmark):** https://github.com/Zhenran-Wang/worldcup-arena-codebase

The front-end for the **2026 World Cup multi-LLM prediction benchmark**. Six **flagship, state-of-the-art** models (Claude / GPT / Gemini / Kimi / GLM / Seed) fill out a football-lottery pick card for every match. This site shows their picks, the tournament outright pool, and a **live leaderboard** that settles against real results.

## What's on the page

- **Model leaderboard** — live ranking, updated as real results land;
- **Pick cards** — per match, all 6 models across **7 markets** (1X2 · handicap · O/U 2.5 · BTTS · odd/even · HT-FT · correct score), with an **Actual result** column;
- **Outright pool** — champion · finalists · semi-finalists · winning region · total goals;
- **Group winners** — each model's pick for all 12 groups;
- **Today's fixtures & full schedule** — revealed day by day as the tournament unfolds.

Scoring (shown on the page): match markets **+1 ~ +5**, outrights from **+25** (champion) down to **+2** (group winner). All picks lock before kickoff; correct calls accumulate into the leaderboard.

## Tech

Pure static site — **vanilla HTML / CSS / JavaScript, no build step, zero dependencies**, deployed via **GitHub Pages**. Bilingual (EN / 中文) via `data-en` / `data-zh` attributes.

## Files

| File | What |
|---|---|
| `index.html` | Page structure (hero · leaderboard · arena · schedule · method) |
| `worldcup.css` · `styles.css` | Styles — `worldcup.css` is this project; `styles.css` is the shared base |
| `worldcup-data.js` | **The predictions** — each model's picks (`PRED`) + label/mapping tables. Generated from the benchmark's prediction archive. |
| `worldcup-arena.js` | Scoring config — markets, points, and real results (`RESULTS` / `CHAMPION` / `GROUP_WINNERS` …) |
| `worldcup-ui.js` | Rendering — leaderboard, pick cards, pools, nav scrollspy |
| `worldcup-app.js` · `worldcup-knockout.js` | Teams / fixtures / groups / knockout-bracket data |

## Data flow

Predictions and real results live in the **[codebase repo](https://github.com/Zhenran-Wang/worldcup-arena-codebase)** (`wc_runs/archive/`). There, `update_web.py` writes them into `worldcup-data.js` (the `PRED` object) and `worldcup-arena.js` (`RESULTS`), then bumps the `?v=` cache-buster in `index.html`.

> The page is **data-driven from the archive — don't hand-edit `worldcup-data.js`** (use `update_web.py`).

## Run locally

```bash
# any static server, e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

---

All predictions are **model-generated, for entertainment only**.
