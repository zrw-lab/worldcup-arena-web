/* ============================================================================
   世界杯 2026 — 模型擂台（多市场竞猜 · 纯盘口玩法）
   单场 7 个市场（均由模型预测的【全场比分 + 半场比分】派生）：
     胜平负 x2 +1 / 让球 hc +2 / 大小2.5 ou +1 / 双方进球 bt +1 /
     进球单双 oe +1 / 半全场 ht +3 / 正确比分 cs +5
   全局彩池（球队/赛果类，无球员）：
     夺冠 +10 / 进决赛(2队)每队 +3 / 四强(4队)每队 +2 /
     夺冠大洲 +2 / 总进球大小 +2 / 小组头名(12组)每组 +1
   预测全部「球队实力 + 模型性格」确定式推导。真实结果在文件末尾更新。
   ========================================================================== */
(function () {
  var MODELS = [
    { key: "claude", name: "Claude" }, { key: "gpt", name: "GPT" }, { key: "gemini", name: "Gemini" },
    { key: "kimi", name: "Kimi" }, { key: "glm", name: "GLM" }, { key: "seed", name: "Seed" }
  ];

  var MARKETS = [
    { key: "x2", zh: "胜平负", en: "1X2", pts: 1 },
    { key: "hc", zh: "让球", en: "Handicap", pts: 2 },
    { key: "ou", zh: "大小 2.5", en: "O/U 2.5", pts: 1 },
    { key: "bt", zh: "双方进球", en: "BTTS", pts: 1 },
    { key: "oe", zh: "进球单双", en: "Odd / Even", pts: 1 },
    { key: "ht", zh: "半全场", en: "HT / FT", pts: 3 },
    { key: "cs", zh: "正确比分", en: "Correct score", pts: 5 }
  ];
  var GLOBAL = [
    { key: "champ", zh: "夺冠", en: "Champion", pts: 25, kind: "one" },
    { key: "final", zh: "进决赛", en: "Finalists", pts: 6, kind: "set", n: 2 },
    { key: "semi", zh: "四强", en: "Semi-finalists", pts: 4, kind: "set", n: 4 },
    { key: "conf", zh: "夺冠大洲", en: "Winning region", pts: 5, kind: "opt" },
    { key: "goals", zh: "总进球", en: "Total goals", pts: 4, kind: "opt" }
  ];

  var LBL = {
    x2: { H: { zh: "主胜", en: "Home", t: "warm" }, D: { zh: "平", en: "Draw", t: "neutral" }, A: { zh: "客胜", en: "Away", t: "cool" } },
    hc: { H: { zh: "主", en: "Home", t: "warm" }, P: { zh: "走盘", en: "Push", t: "neutral" }, A: { zh: "客", en: "Away", t: "cool" } },
    ou: { O: { zh: "大", en: "Over", t: "warm" }, U: { zh: "小", en: "Under", t: "cool" } },
    bt: { Y: { zh: "都进", en: "Yes", t: "warm" }, N: { zh: "零封", en: "No", t: "cool" } },
    oe: { ODD: { zh: "单", en: "Odd", t: "warm" }, EVN: { zh: "双", en: "Even", t: "cool" } },
    conf: { UEFA: { zh: "欧洲", en: "Europe", t: "warm" }, CONMEBOL: { zh: "南美", en: "S. America", t: "cool" }, OTHER: { zh: "其他", en: "Other", t: "neutral" } },
    goals: { O: { zh: "大", en: "Over", t: "warm" }, U: { zh: "小", en: "Under", t: "cool" } }
  };
  var OUT = { H: { zh: "主", en: "H" }, D: { zh: "平", en: "D" }, A: { zh: "客", en: "A" } };

  var GBH = [0.18, -0.12, 0.0, 0.30, -0.06, 0.12], GBA = [-0.04, 0.12, 0.0, 0.24, -0.12, 0.06];
  function frand(a, b) { var x = Math.sin((a + 1) * 12.9898 + (b + 1) * 78.233) * 43758.5453; return x - Math.floor(x); }
  function cl(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function sgn(d) { return d > 0 ? "H" : (d < 0 ? "A" : "D"); }

  /* 让球线：给主队的让球数（主队被看好为负）。0=平手盘 */
  function handLine(home, away) {
    var WC = window.__WC, d = WC.rate(home) - WC.rate(away), ad = Math.abs(d);
    var line = ad >= 320 ? 2 : ad >= 150 ? 1 : ad >= 45 ? 0.5 : 0;
    return d > 0 ? -line : line;
  }
  function hcRes(fh, fa, line) { var m = (fh - fa) + line; return m > 0.001 ? "H" : (m < -0.001 ? "A" : "P"); }

  /* 由 全场(fh,fa) + 半场(hh,ha) + 让球线 派生所有市场 */
  function fromScore(fh, fa, hh, ha, line) {
    return {
      x2: sgn(fh - fa),
      hc: hcRes(fh, fa, line),
      ou: (fh + fa) >= 3 ? "O" : "U",
      bt: (fh > 0 && fa > 0) ? "Y" : "N",
      oe: ((fh + fa) % 2 === 0) ? "EVN" : "ODD",
      ht: (hh == null || ha == null) ? null : (sgn(hh - ha) + "-" + sgn(fh - fa)),
      cs: fh + ":" + fa
    };
  }

  function predict(home, away, mi, idx) {
    var WC = window.__WC; if (!WC) return { goals: [1, 0] };
    var d = (WC.rate(home) - WC.rate(away)) / 130;
    var lamH = 1.45 + d * 0.62 + GBH[mi], lamA = 1.12 - d * 0.62 + GBA[mi];
    var fh = Math.round(cl(lamH + (frand(mi * 5 + 1, idx) - 0.5) * 1.7, 0, 5));
    var fa = Math.round(cl(lamA + (frand(mi * 5 + 3, idx) - 0.5) * 1.7, 0, 5));
    var hh = Math.round(cl(fh * (0.35 + 0.22 * frand(mi * 7 + 1, idx)), 0, fh));
    var ha = Math.round(cl(fa * (0.35 + 0.22 * frand(mi * 7 + 2, idx)), 0, fa));
    var m = fromScore(fh, fa, hh, ha, handLine(home, away));
    m.goals = [fh, fa]; m.half = [hh, ha];
    return m;
  }

  /* ---- 全局彩池：确定式推导 ---- */
  function byRating() { var WC = window.__WC; return Object.keys(WC.T).sort(function (a, b) { return WC.rate(b) - WC.rate(a); }); }
  function pickN(pool, n, mi, salt) {
    var s = pool.map(function (t, k) { return { t: t, s: k + (frand(mi * 11 + salt, k) - 0.5) * 5 }; });
    s.sort(function (a, b) { return a.s - b.s; });
    return s.slice(0, n).map(function (x) { return x.t; });
  }
  function poolPick(mi) {
    var WC = window.__WC; if (!WC) return {};
    var top = byRating();
    var champ = pickN(top.slice(0, 6), 1, mi, 1)[0];
    var final = pickN(top.slice(0, 8), 2, mi, 2);
    var semi = pickN(top.slice(0, 11), 4, mi, 3);
    var c = WC.conf(champ); var conf = (c === "UEFA" || c === "CONMEBOL") ? c : "UEFA";
    var goals = (GBH[mi] + GBA[mi] + (frand(mi, 71) - 0.5)) >= 0 ? "O" : "U";
    var G = WC.groups(), groups = {};
    Object.keys(G).forEach(function (g) {
      var arr = G[g] || []; if (!arr.length) return;
      var up = arr.length > 1 && frand(mi * 13, g.charCodeAt(0)) > 0.80;
      groups[g] = up ? arr[1] : arr[0];
    });
    return { champ: champ, final: final, semi: semi, conf: conf, goals: goals, groups: groups };
  }

  window.__WC_ARENA = {
    MODELS: MODELS, MARKETS: MARKETS, GLOBAL: GLOBAL, LBL: LBL, OUT: OUT,
    predict: predict, fromScore: fromScore, handLine: handLine, poolPick: poolPick,
    GOALS_LINE: 285.5,
    GW_PTS: 2,

    /* ========================================================================
       预测“产出截止日”—— 只显示日期 ≤ 此值的比赛的预测，之后的显示“待产出”。
       逐日产出：每产出新一天，把这里改成那天即可（格式与赛程日期键一致，如 "6.12"）。
       例：当前只放出 6/11 揭幕日两场 → "6.11"
       ====================================================================== */
    REVEAL_THROUGH: "6.11",

    /* ========================================================================
       赛后在这里更新真实结果 —— 页面自动结算并刷新积分榜。
       单场:   RESULTS[场序(0起)] = "全场比分"  或  "全场/半场"（半场可选）
               例: 0:"2:0"        只结算除半全场外 6 个市场
                   0:"2:0/1:0"    含半场 → 半全场也结算
       全局:   CHAMPION "Spain" / FINALISTS [2队] / SEMIS [4队]
               WINNER_CONF "UEFA"|"CONMEBOL" / TOTAL_GOALS 数字(对比 GOALS_LINE)
               GROUP_WINNERS { A:"Mexico", B:"...", ... }
       ====================================================================== */
    RESULTS: {},
    CHAMPION: "", FINALISTS: [], SEMIS: [], WINNER_CONF: "", TOTAL_GOALS: null, GROUP_WINNERS: {}
  };
})();
