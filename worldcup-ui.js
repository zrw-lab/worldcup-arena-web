/* ============================================================================
   世界杯 2026 预测专题 — UI + LLM predictor
   Tabs: 跟着赛程 (fixtures) / 自定义 (custom). Shared model + type controls and
   a broadcast scoreboard result. Predictions come from window.claude.complete
   with a rating-based heuristic fallback so the prototype always responds.
   ========================================================================== */
(function () {
  "use strict";
  var WC = window.__WC; if (!WC) return;

  var state = { a: "Argentina", b: "Algeria", model: "Claude", type: "score", fromFixture: true, fxMeta: null };

  /* ----------------------------------------------------------------- utils */
  function el(id) { return document.getElementById(id); }
  function pois(k, l) { var p = Math.exp(-l); for (var i = 1; i <= k; i++) p *= l / i; return p; }
  function lambdas(ra, rb) {
    var sup = Math.max(-2.2, Math.min(2.2, (ra - rb) / 100));
    return [Math.max(0.18, 1.325 + sup / 2 + 0.08), Math.max(0.18, 1.325 - sup / 2)];
  }
  function wdl(ra, rb) {
    var L = lambdas(ra, rb), pa = 0, pd = 0, pb = 0;
    for (var i = 0; i <= 8; i++) for (var j = 0; j <= 8; j++) {
      var p = pois(i, L[0]) * pois(j, L[1]);
      if (i > j) pa += p; else if (i === j) pd += p; else pb += p;
    }
    var s = pa + pd + pb; return { a: pa / s, d: pd / s, b: pb / s, la: L[0], lb: L[1] };
  }

  /* --------------------------------------------------- heuristic fallback */
  function heuristic(a, b, type) {
    var ra = WC.rate(a), rb = WC.rate(b), w = wdl(ra, rb);
    var sa = Math.round(w.la), sb = Math.round(w.lb);
    var fav = w.a >= w.b ? a : b, favP = Math.round(Math.max(w.a, w.b) * 100);
    var total = (w.la + w.lb);
    var en = WC.getLang() === "en";
    switch (type) {
      case "score":
        return { headline: sa + " – " + sb, confidence: Math.max(34, favP - 8),
          detail: en ? (WC.nm(a) + " " + sa + "–" + sb + " " + WC.nm(b) + " is the most likely scoreline given current form and ratings; a one-goal margin is the base case.")
                     : (WC.nm(a) + " " + sa + "–" + sb + " " + WC.nm(b) + " 是当前状态与评级下最可能的比分，一球小胜是基准走向。") };
      case "result":
        var r = w.a >= w.d && w.a >= w.b ? (en?"Home win":"主胜") : w.b > w.a && w.b >= w.d ? (en?"Away win":"客胜") : (en?"Draw":"平局");
        return { headline: r + " " + Math.round(Math.max(w.a, w.d, w.b) * 100) + "%", confidence: Math.round(Math.max(w.a, w.d, w.b) * 100),
          detail: en ? ("Model splits the result " + Math.round(w.a*100) + "/" + Math.round(w.d*100) + "/" + Math.round(w.b*100) + " (W/D/L) for " + WC.nm(a) + ".")
                     : ("模型给出 " + WC.nm(a) + " 胜平负概率 " + Math.round(w.a*100) + "/" + Math.round(w.d*100) + "/" + Math.round(w.b*100) + "。") };
      case "goals":
        var ou = total >= 2.5 ? "2.5+" : "2.5-";
        return { headline: (en?"Over/Under ":"") + ou, confidence: 58,
          detail: en ? ("Expected goals total ≈ " + total.toFixed(1) + ", leaning " + (total>=2.5?"over":"under") + " 2.5.")
                     : ("预期总进球约 " + total.toFixed(1) + " 个，倾向 " + (total>=2.5?"大":"小") + "球（2.5）。") };
      case "scorer":
        return { headline: WC.flag(fav) + " " + WC.nm(fav), confidence: 40,
          detail: en ? (WC.nm(fav) + "'s front line is most likely to break the deadlock; their main striker is the top scorer pick.")
                     : (WC.nm(fav) + " 的锋线最可能首开纪录，头号前锋是进球热门人选。") };
      case "tactics":
        return { headline: en ? "Press vs counter" : "高位逼抢 vs 防反", confidence: 50,
          detail: en ? (WC.nm(fav) + " should dominate possession; the opponent's best route is a compact block and quick transitions.")
                     : (WC.nm(fav) + " 预计掌控球权，对手最佳思路是收缩防线 + 快速反击。") };
      default: // advance
        return { headline: WC.nm(fav) + (en?" adv ":" 晋级 ") + Math.min(92, favP + 24) + "%", confidence: Math.min(92, favP + 24),
          detail: en ? (WC.nm(fav) + " is favoured to take points here and is well placed to reach the round of 32.")
                     : (WC.nm(fav) + " 本场被看好拿分，晋级 32 强的形势更有利。") };
    }
  }

  /* --------------------------------------------------------- LLM prompt */
  function typeHint(type) {
    var en = WC.getLang() === "en";
    var H = {
      score:  en?"headline must be a scoreline like \"2 - 1\"":"headline 形如 \"2 - 1\"",
      result: en?"headline like \"Home win 64%\"":"headline 形如 \"主胜 64%\" / \"平局 28%\" / \"客胜\"",
      goals:  en?"headline like \"Over 2.5\" or \"Total 3\"":"headline 形如 \"大球 2.5+\" 或 \"总进球 3\"",
      scorer: en?"headline is the single most likely goalscorer's name":"headline 为最可能进球的球员名字",
      tactics:en?"headline is a <=16-char tactical note":"headline 为不超过14字的战术看点",
      advance:en?"headline like \"Spain adv 80%\"":"headline 形如 \"西班牙晋级 80%\""
    };
    return H[type];
  }
  function buildPrompt(a, b, type, model) {
    var en = WC.getLang() === "en";
    var tl = (WC.TYPES.filter(function (x) { return x.k === type; })[0]) || WC.TYPES[0];
    var label = en ? tl.en : tl.zh;
    var ctx = state.fromFixture && state.fxMeta
      ? (en ? ("2026 World Cup group stage, Group " + state.fxMeta.g + ", " + state.fxMeta.venueEn + ", " + state.fxMeta.dateEn)
            : ("2026 世界杯小组赛，" + state.fxMeta.g + " 组，" + state.fxMeta.venueZh + "，" + state.fxMeta.dateZh))
      : (en ? "2026 World Cup, a hypothetical single match" : "2026 世界杯，自定义单场对决");
    var na = en ? a : WC.zh(a), nb = en ? b : WC.zh(b);
    if (en) {
      return "You are a football data analyst emulating the prediction style of \"" + model + "\". Context: " + ctx +
        ". Match: " + na + " (rating " + WC.rate(a) + ") vs " + nb + " (rating " + WC.rate(b) +
        "). Give a prediction for ONLY this aspect: " + label + ". " + typeHint(type) +
        ". Respond with ONLY minified JSON, no markdown: {\"headline\":\"<concise, <=16 chars>\",\"detail\":\"<2-3 sentence analysis in English>\",\"confidence\":<integer 0-100>}.";
    }
    return "你是一名足球数据分析师，模拟「" + model + "」的世界杯预测风格。背景：" + ctx +
      "。本场：" + na + "（实力评级 " + WC.rate(a) + "） vs " + nb + "（评级 " + WC.rate(b) +
      "）。只针对「" + label + "」这一项给出预测。" + typeHint(type) +
      "。只返回压缩后的 JSON，不要 markdown：{\"headline\":\"<核心结论，不超过14字>\",\"detail\":\"<2-3句中文分析>\",\"confidence\":<0到100的整数>}。";
  }
  function parseOut(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) {}
    var m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    return { headline: WC.getLang() === "en" ? "Prediction" : "预测", detail: String(raw).slice(0, 280), confidence: 50 };
  }

  /* ----------------------------------------------------------- rendering */
  function renderMatchSummary() {
    var host = el("wc-match-summary"); if (!host) return;
    host.innerHTML =
      "<span class='fl'>" + WC.flag(state.a) + "</span><b>" + WC.nm(state.a) + "</b>" +
      "<span class='mid'>vs</span><b>" + WC.nm(state.b) + "</b><span class='fl'>" + WC.flag(state.b) + "</span>";
  }
  function renderTeamInfo() {
    var host = el("wc-teaminfo"); if (!host) return;
    host.innerHTML = [state.a, state.b].map(function (en) {
      var odds = WC.oddsOf(en);
      var line = odds != null
        ? "<div class='ti-odds'><span class='k'>" + WC.t("夺冠概率", "Title odds") + "</span><b>" + odds.toFixed(1) + "%</b></div>"
        : "<div class='ti-odds'><span class='k'>" + WC.t("档位", "Tier") + "</span><b class='tier'>" + WC.tierLabel(en) + "</b></div>";
      return "<div class='wc-tcard'>" +
        "<div class='ti-top'><span class='fl'>" + WC.flag(en) + "</span><span class='nm'>" + WC.nm(en) + "</span></div>" +
        "<div class='ti-meta'><span class='wc-tag2'>" + WC.t(WC.grp(en) + " 组", "Group " + WC.grp(en)) + "</span>" +
          "<span class='wc-tag2'>" + WC.confLabel(en) + "</span></div>" +
        "<div class='ti-rate'><span class='k'>" + WC.t("实力评级", "Rating") + "</span>" +
          "<span class='bar'><i style='width:" + WC.ratePct(en) + "%'></i></span></div>" +
        line +
      "</div>";
    }).join("");
  }
  // big numeric-style headline for these; everything else is text-scale
  var BIG_TYPES = { score: 1, result: 1, goals: 1, advance: 1 };
  function matchupHtml() {
    return "<div class='matchup'><span class='fl'>" + WC.flag(state.a) + "</span>" + WC.nm(state.a) +
      " <span style='color:var(--wc-accent)'>vs</span> " + WC.nm(state.b) + "<span class='fl'>" + WC.flag(state.b) + "</span></div>";
  }
  function setResultPlaceholder() {
    var en = WC.getLang() === "en";
    var tl = (WC.TYPES.filter(function (x) { return x.k === state.type; })[0]) || WC.TYPES[0];
    el("wc-board").className = "wc-board placeholder";
    el("wc-board").innerHTML =
      matchupHtml() +
      "<div class='wc-cta-hint'>⚡ " + (en ? "Choose a model & type, then hit Generate" : "选好模型与预测类型，点「生成预测」") + "</div>" +
      "<div class='wc-typeline'>" + (en ? "Prediction: " + tl.en : "预测类型：" + tl.zh) + "</div>";
    el("wc-detail").innerHTML = "";
    el("wc-detail").classList.remove("d-sm", "d-xs");
    el("wc-analyst-name").textContent = state.model;
    el("wc-live").style.display = "none";
  }
  function renderResult(out) {
    var en = WC.getLang() === "en";
    var tl = (WC.TYPES.filter(function (x) { return x.k === state.type; })[0]) || WC.TYPES[0];
    var conf = Math.max(0, Math.min(100, parseInt(out.confidence, 10) || 50));
    var big = !!BIG_TYPES[state.type];
    el("wc-board").className = "wc-board";
    el("wc-board").innerHTML =
      matchupHtml() +
      "<div class='wc-headline " + (big ? "score" : "text") + "'>" + (big ? escapeHl(out.headline || "—") : escapeHtml(out.headline || "—")) + "</div>" +
      "<div class='wc-typeline'>" + (en ? tl.en : tl.zh) + "</div>";
    var det = el("wc-detail");
    var dl = (out.detail || "").length;
    det.classList.remove("d-sm", "d-xs");
    if (dl > 150) det.classList.add("d-xs");
    else if (dl > 95) det.classList.add("d-sm");
    det.innerHTML = out.detail ? "<p>" + escapeHtml(out.detail) + "</p>" : "";
    el("wc-live").style.display = "none";
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function escapeHl(s) {
    s = escapeHtml(s);
    // stylise a "x - y" or "x : y" scoreline separator (numeric headlines only)
    return s.replace(/\s*([-–:])\s*/, " <span class='sep'>$1</span> ");
  }

  /* --------------------------------------------------------- generate */
  var busy = false;
  function generate() {
    if (busy) return; busy = true;
    var en = WC.getLang() === "en";
    var btn = el("wc-run"); var oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "<span class='spin'></span>" + (en ? "Predicting…" : "预测中…");
    el("wc-live").style.display = "inline-flex";
    el("wc-board").className = "wc-board";
    el("wc-detail").innerHTML = "<p style='color:var(--wc-muted)'>" + (en ? state.model + " is working…" : state.model + " 正在生成预测…") + "</p>";

    var done = function (out) {
      renderResult(out); busy = false; btn.disabled = false; btn.innerHTML = oldHtml;
    };
    var prompt = buildPrompt(state.a, state.b, state.type, state.model);
    var ran = false;
    var fallbackTimer = setTimeout(function () { if (!ran) { ran = true; done(heuristic(state.a, state.b, state.type)); } }, 18000);

    if (window.claude && typeof window.claude.complete === "function") {
      Promise.resolve(window.claude.complete(prompt)).then(function (raw) {
        if (ran) return; ran = true; clearTimeout(fallbackTimer);
        var out = parseOut(raw) || heuristic(state.a, state.b, state.type);
        done(out);
      }).catch(function () {
        if (ran) return; ran = true; clearTimeout(fallbackTimer);
        done(heuristic(state.a, state.b, state.type));
      });
    } else {
      // No LLM bridge in this environment — use heuristic after a short beat.
      setTimeout(function () { if (ran) return; ran = true; clearTimeout(fallbackTimer); done(heuristic(state.a, state.b, state.type)); }, 700);
    }
  }

  /* --------------------------------------------------- schedule / groups */
  var selDay = 0;
  var WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var WD_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  function dayKeys() {
    var seen = {}, out = [];
    WC.FIX.forEach(function (f) { if (!seen[f[0]]) { seen[f[0]] = 1; out.push(f[0]); } });
    return out;
  }
  function weekdayOf(dk) {
    var p = dk.split("."); return new Date(2026, +p[0] - 1, +p[1]).getDay();
  }
  function renderKnockout() {
  }
  var KO_SHORT_ZH = ["32 强", "16 强", "八强", "半决赛", "决赛"];
  var KO_SHORT_EN = ["R32", "R16", "QF", "SF", "Final"];
  var MON_EN = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
  function koData() { return (window.__WC_KO || {}).KO || []; }
  function allDays() {
    var out = [];
    dayKeys().forEach(function (dk) { out.push({ dk: dk, type: "group" }); });
    var seen = {};
    koData().forEach(function (m) { if (!seen[m[2]]) { seen[m[2]] = 1; out.push({ dk: m[2], type: "ko", round: m[1], no: m[0] }); } });
    return out;
  }
  function dateParts(dk) { var p = dk.split("."); return { mo: +p[0], dd: +p[1] }; }
  function phaseShort(d, en) {
    if (d.type === "group") return en ? "Group" : "小组赛";
    if (d.round === 4) return d.no === 103 ? (en ? "3rd" : "季军赛") : (en ? "Final" : "决赛");
    return en ? KO_SHORT_EN[d.round] : KO_SHORT_ZH[d.round];
  }
  function renderTimeline() {
    var host = el("wc-timeline"); if (!host) return;
    var en = WC.getLang() === "en";
    var days = allDays();
    host.innerHTML = days.map(function (d, i) {
      var P = dateParts(d.dk);
      var wd = new Date(2026, P.mo - 1, P.dd).getDay();
      var sel = i === selDay ? " sel" : "";
      var div = (i > 0 && d.type === "ko" && days[i - 1].type === "group") ? " div" : "";
      var monWd = (en ? MON_EN[P.mo] : (P.mo + "月")) + " · " + (en ? WD_EN[wd] : WD_ZH[wd]);
      return "<button type='button' class='wc-day" + sel + div + "' data-i='" + i + "'>" +
        "<span class='wc-day-phase" + (d.type === "ko" ? " ko" : "") + "'>" + phaseShort(d, en) + "</span>" +
        "<span class='wc-day-num'>" + P.dd + "</span>" +
        "<span class='wc-day-mon'>" + monWd + "</span>" +
      "</button>";
    }).join("");
    host.querySelectorAll(".wc-day").forEach(function (b) {
      b.addEventListener("click", function () { selDay = +b.getAttribute("data-i"); renderTimeline(); renderPhaseDetail(); });
    });
  }
  function timeCell(et, dk, en) {
    if (!et) return "<b>" + (en ? "TBD" : "待定") + "</b>";
    if (en) return "<b>" + et + "</b><span>ET</span>";
    var bj = etToBJ(et); var P = dateParts(dk); var bjDay = P.dd + (bj.nextDay ? 1 : 0);
    return "<span class='tl et'><b>" + et + "</b><small>美东</small></span>" +
           "<span class='tl bj'><b>" + bj.time + "</b><small>北京 " + P.mo + "月" + bjDay + "日</small></span>";
  }
  function groupRow(f, dk, en) {
    var no = WC.FIX.indexOf(f) + 1;
    return "<div class='wc-mrow'>" +
      "<div class='wc-m-time'>" + timeCell(f[6], dk, en) + "</div>" +
      "<span class='wc-m-grp'><b>" + (en ? "Grp " + f[1] : f[1] + "组") + "</b><i>" + (en ? "#" + no : "第" + no + "场") + "</i></span>" +
      "<div class='wc-m-teams'>" +
        "<span class='t'><span class='fl'>" + WC.flag(f[2]) + "</span>" + WC.nm(f[2]) + "</span>" +
        "<span class='vs'>vs</span>" +
        "<span class='t r'>" + WC.nm(f[3]) + "<span class='fl'>" + WC.flag(f[3]) + "</span></span>" +
      "</div>" +
      "<span class='wc-m-venue'>" + (en ? f[5] : f[4]) + "</span>" +
    "</div>";
  }
  function koRow(m, en) {
    var badge = m[1] === 4 ? (m[0] === 103 ? (en ? "3rd" : "季军赛") : (en ? "Final" : "决赛")) : (en ? KO_SHORT_EN[m[1]] : KO_SHORT_ZH[m[1]]);
    return "<div class='wc-mrow'>" +
      "<div class='wc-m-time'>" + timeCell(m[3], m[2], en) + "</div>" +
      "<span class='wc-m-grp'><b>" + badge + "</b><i>" + (en ? "#" + m[0] : "第" + m[0] + "场") + "</i></span>" +
      "<div class='wc-m-teams ko'>" +
        "<span class='t'>" + (en ? m[5] : m[4]) + "</span>" +
        "<span class='vs'>vs</span>" +
        "<span class='t r'>" + (en ? m[7] : m[6]) + "</span>" +
      "</div>" +
      "<span class='wc-m-venue'>" + (en ? m[9] : m[8]) + "</span>" +
    "</div>";
  }
  function renderPhaseDetail() {
    var host = el("wc-phase-detail"); if (!host) return;
    var en = WC.getLang() === "en";
    var days = allDays(); var d = days[selDay] || days[0]; var dk = d.dk;
    var P = dateParts(dk);
    var wd = new Date(2026, P.mo - 1, P.dd).getDay();
    var dlabel = (en ? (MON_EN[P.mo] + " " + P.dd) : (P.mo + "月" + P.dd + "日")) + " · " + (en ? WD_EN[wd] : WD_ZH[wd]);
    var rows, tag, meta, note = "";
    if (d.type === "group") {
      var gm = WC.FIX.filter(function (f) { return f[0] === dk; });
      rows = gm.map(function (f) { return groupRow(f, dk, en); }).join("");
      tag = en ? "Group stage" : "小组赛";
      meta = gm.length + (en ? " fixtures · ET / Beijing" : " 场 · 美东 / 北京时间");
    } else {
      var km = koData().filter(function (m) { return m[2] === dk; });
      rows = km.map(function (m) { return koRow(m, en); }).join("");
      tag = en ? "Knockout" : "淘汰赛";
      meta = km.length + (en ? " matches · bracket slots" : " 场 · 占位对阵");
      note = "<p class='wc-ko-tbd'>" + (en ? "Pairings are bracket slots — exact teams confirm once preceding rounds finish." : "对阵为括号占位，具体球队将在上一轮结束后确定。") + "</p>";
    }
    host.innerHTML =
      "<div class='wc-day-head'>" +
        "<div class='wc-day-head-l'><span class='wc-day-tag'>" + tag + "</span>" +
          "<h3 class='wc-day-title'>" + dlabel + "</h3></div>" +
        "<span class='wc-day-meta'>" + meta + "</span>" +
      "</div>" +
      "<div class='wc-mlist'>" + rows + "</div>" + note;
  }
  function etToBJ(t) {
    var p = t.split(":"); var total = (+p[0]) + 12; var nextDay = total >= 24; var bh = total % 24;
    return { time: (bh < 10 ? "0" : "") + bh + ":" + p[1], nextDay: nextDay };
  }
  function renderGroups() {
    var host = el("wc-groups"); if (!host) return;
    var en = WC.getLang() === "en";
    var G = WC.groups();
    host.innerHTML = Object.keys(G).map(function (k) {
      var rows = G[k].map(function (tm) {
        return "<div class='wc-grow'>" +
          "<span class='fl'>" + WC.flag(tm) + "</span>" +
          "<span class='nm'>" + WC.nm(tm) + "</span>" +
          "<span class='cf'>" + WC.confLabel(tm) + "</span>" +
        "</div>";
      }).join("");
      return "<div class='wc-group'>" +
        "<div class='wc-group-hd'><span class='gl'>" + (en ? "Group " + k : k + " 组") + "</span></div>" +
        rows +
      "</div>";
    }).join("");
  }
  function renderFixtures() {
    var host = el("wc-fixturelist"); if (!host) return;
    var en = WC.getLang() === "en";
    var days = {};
    WC.FIX.forEach(function (f) { (days[f[0]] = days[f[0]] || []).push(f); });
    host.innerHTML = Object.keys(days).map(function (d) {
      var label = en ? WC.DATE_EN[d] : WC.DATE_ZH[d];
      var rows = days[d].map(function (f) {
        var sel = (state.fromFixture && state.a === f[2] && state.b === f[3]) ? " sel" : "";
        return "<button type='button' class='wc-fixture" + sel + "' data-a=\"" + f[2] + "\" data-b=\"" + f[3] +
          "\" data-g='" + f[1] + "' data-vz=\"" + f[4] + "\" data-ve=\"" + f[5] + "\" data-d='" + d + "'>" +
          "<span class='grp'>" + f[1] + "</span>" +
          "<span class='match'><span class='teams'>" + WC.flag(f[2]) + " " + WC.nm(f[2]) +
            " <span class='v'>vs</span> " + WC.nm(f[3]) + " " + WC.flag(f[3]) + "</span>" +
            "<span class='venue'>" + (en ? f[5] : f[4]) + "</span></span>" +
          "<span class='kick'>" + (f[6] ? f[6] + " ET" : "—") + "</span>" +
        "</button>";
      }).join("");
      return "<div class='wc-daygroup'><div class='wc-dayhdr'>" + label + "</div><div class='wc-fixtures'>" + rows + "</div></div>";
    }).join("");

    host.querySelectorAll(".wc-fixture").forEach(function (b) {
      b.addEventListener("click", function () {
        state.a = b.getAttribute("data-a"); state.b = b.getAttribute("data-b");
        state.fromFixture = true;
        state.fxMeta = { g: b.getAttribute("data-g"), venueZh: b.getAttribute("data-vz"), venueEn: b.getAttribute("data-ve"),
          dateZh: WC.DATE_ZH[b.getAttribute("data-d")], dateEn: WC.DATE_EN[b.getAttribute("data-d")] };
        host.querySelectorAll(".wc-fixture").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        renderMatchSummary(); setResultPlaceholder();
      });
    });
  }

  /* --------------------------------------------------------- custom UI */
  function fillTeamSelect(sel, picked) {
    var en = WC.getLang() === "en";
    var names = Object.keys(WC.T).sort(function (x, y) { return (en ? x : WC.zh(x)).localeCompare(en ? y : WC.zh(y)); });
    sel.innerHTML = names.map(function (k) {
      return "<option value=\"" + k + "\"" + (k === picked ? " selected" : "") + ">" + WC.flag(k) + "  " + (en ? k : WC.zh(k)) + "</option>";
    }).join("");
  }

  /* --------------------------------------------------------- controls */
  function fillModels() {
    var sel = el("wc-model");
    sel.innerHTML = WC.MODELS.map(function (m) { return "<option value=\"" + m + "\"" + (m === state.model ? " selected" : "") + ">" + m + "</option>"; }).join("");
  }
  function renderTypeChips() {
    var host = el("wc-types"); var en = WC.getLang() === "en";
    host.innerHTML = WC.TYPES.map(function (x) {
      return "<option value='" + x.k + "'" + (x.k === state.type ? " selected" : "") + ">" + (en ? x.en : x.zh) + "</option>";
    }).join("");
    host.onchange = function () { state.type = host.value; };
  }

  /* --------------------------------------------------------- tabs */
  function initTabs() {
    document.querySelectorAll(".wc-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var which = tab.getAttribute("data-tab");
        document.querySelectorAll(".wc-tab").forEach(function (x) { x.classList.toggle("active", x === tab); });
        document.querySelectorAll(".wc-pane").forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-pane") === which); });
        if (which === "custom") {
          state.fromFixture = false; state.fxMeta = null;
          state.a = el("wc-custom-a").value; state.b = el("wc-custom-b").value;
          renderMatchSummary(); setResultPlaceholder();
        } else {
          // back to fixtures: reselect first highlighted or default
          state.fromFixture = true;
          renderFixtures();
          var first = el("wc-fixturelist").querySelector(".wc-fixture[data-a='" + state.a + "']");
          if (!first) {
            var f0 = WC.FIX.filter(function(f){return f[2]==="Argentina";})[0] || WC.FIX[0];
            state.a = f0[2]; state.b = f0[3];
            state.fxMeta = { g:f0[1], venueZh:f0[4], venueEn:f0[5], dateZh:WC.DATE_ZH[f0[0]], dateEn:WC.DATE_EN[f0[0]] };
            renderFixtures();
          }
          renderMatchSummary(); setResultPlaceholder();
        }
      });
    });
  }

  /* --------------------------------------------------- model arena */
  var selMatch = 0;
  var dashSel = 0;
  function arenaResults() { var A = window.__WC_ARENA; return (A && A.RESULTS) || {}; }
  function arenaChamp() { var A = window.__WC_ARENA; return (A && A.CHAMPION) || ""; }

  function chip(A, mkKey, val, en, settled, ok) {
    if (val == null) return "<span class='pk pk-neutral pk-dim'>—</span>";
    var label, tone;
    if (mkKey === "cs") { label = val; tone = "neutral"; }
    else if (mkKey === "ht") { var pp = val.split("-"); label = (en ? A.OUT[pp[0]].en : A.OUT[pp[0]].zh) + "/" + (en ? A.OUT[pp[1]].en : A.OUT[pp[1]].zh); tone = "neutral"; }
    else { var info = A.LBL[mkKey][val]; label = en ? info.en : info.zh; tone = info.t; }
    var cls = "pk pk-" + tone + (settled ? (ok ? " ok" : " no") : "");
    return "<span class='" + cls + "'>" + label + (settled ? "<i>" + (ok ? "✓" : "✗") + "</i>" : "") + "</span>";
  }
  function hcLabel(A, line, en) {
    if (line === 0) return (en ? "Handicap · level" : "让球 · 平手");
    var fav = line < 0 ? (en ? "Home" : "主") : (en ? "Away" : "客");
    return (en ? "Handicap · " : "让球 · ") + fav + " -" + Math.abs(line);
  }
  function actualMarketsFor(A, f, sc) {
    if (!sc) return null;
    var parts = ("" + sc).split("/"), ft = parts[0].split(":");
    var hh = null, ha = null;
    if (parts[1]) { var ht = parts[1].split(":"); hh = +ht[0]; ha = +ht[1]; }
    return A.fromScore(+ft[0], +ft[1], hh, ha, A.handLine(f[2], f[3]));
  }
  function gpts(A, key) { var m = (A.GLOBAL || []).filter(function (x) { return x.key === key; })[0]; return m ? m.pts : 0; }
  function globalScore(A, mi) {
    var p = A.poolPick(mi), s = 0;
    if (A.CHAMPION && p.champ === A.CHAMPION) s += gpts(A, "champ");
    if ((A.FINALISTS || []).length) p.final.forEach(function (t) { if (A.FINALISTS.indexOf(t) >= 0) s += gpts(A, "final"); });
    if ((A.SEMIS || []).length) p.semi.forEach(function (t) { if (A.SEMIS.indexOf(t) >= 0) s += gpts(A, "semi"); });
    if (A.WINNER_CONF && p.conf === A.WINNER_CONF) s += gpts(A, "conf");
    if (A.TOTAL_GOALS != null && p.goals === (A.TOTAL_GOALS > A.GOALS_LINE ? "O" : "U")) s += gpts(A, "goals");
    var gw = A.GROUP_WINNERS || {}, gwp = A.GW_PTS || 1;
    Object.keys(p.groups || {}).forEach(function (g) { if (gw[g] && p.groups[g] === gw[g]) s += gwp; });
    return s;
  }

  function arenaRanked(A) {
    var MODELS = A.MODELS, FIX = WC.FIX, res = arenaResults();
    var stats = MODELS.map(function (m, i) { return { m: m, idx: i, pts: 0, hit: 0, tot: 0, mpts: 0, gpts: 0 }; });
    FIX.forEach(function (f, i) {
      var av = actualMarketsFor(A, f, res[i]); if (!av) return;
      MODELS.forEach(function (mo, mi) {
        var pr = A.predict(f[2], f[3], mi, i);
        A.MARKETS.forEach(function (mk) {
          if (av[mk.key] == null) return;
          stats[mi].tot++;
          if (pr[mk.key] === av[mk.key]) { stats[mi].pts += mk.pts; stats[mi].mpts += mk.pts; stats[mi].hit++; }
        });
      });
    });
    MODELS.forEach(function (mo, mi) { var g = globalScore(A, mi); stats[mi].pts += g; stats[mi].gpts = g; });
    return { ranked: stats.slice().sort(function (a, b) { return b.pts - a.pts || b.hit - a.hit || a.idx - b.idx; }), settledN: Object.keys(res).length };
  }

  /* ---- overview dashboard: mini leaderboard + today's fixtures ---- */
  function renderDash() {
    var A = window.__WC_ARENA; if (!A) return;
    var en = WC.getLang() === "en";
    var lbHost = el("wc-dash-lb");
    if (lbHost) {
      var rk = arenaRanked(A);
      lbHost.innerHTML = rk.ranked.map(function (s, r) {
        return "<div class='wc-dlb-row" + (r === 0 && s.pts > 0 ? " lead" : "") + "'>" +
          "<span class='r'>" + (r + 1) + "</span>" +
          "<span class='nm'>" + s.m.name + "</span>" +
          "<span class='pt'>" + s.pts + "<i>" + (en ? "pts" : "分") + "</i></span>" +
        "</div>";
      }).join("");
    }
    var tHost = el("wc-dash-today"), tTtl = el("wc-dash-today-ttl");
    if (!tHost) return;
    var days = allDays();
    var now = new Date(); var todayNum = 613; /* 临时测4场滚动,测好恢复为:(now.getFullYear()===2026?(now.getMonth()+1)*100+now.getDate():611) */
    var pickDay = null, isToday = false;
    for (var k = 0; k < days.length; k++) {
      var P = dateParts(days[k].dk); var num = P.mo * 100 + P.dd;
      if (num === todayNum) { pickDay = days[k]; isToday = true; break; }
      if (num > todayNum) { pickDay = days[k]; break; }
    }
    if (!pickDay) pickDay = days[days.length - 1];
    var dp = dateParts(pickDay.dk), wd = new Date(2026, dp.mo - 1, dp.dd).getDay();
    if (tTtl) tTtl.textContent = (isToday ? (en ? "Today" : "今日赛程") : (en ? "Next match day" : "下一比赛日")) +
      " · " + dp.mo + (en ? "/" : "月") + dp.dd + (en ? "" : "日") + " " + (en ? WD_EN[wd] : WD_ZH[wd]);
    var rows;
    if (pickDay.type === "group") {
      rows = "";
      WC.FIX.forEach(function (f, i) {
        if (f[0] !== pickDay.dk) return;
        var bj = f[6] ? etToBJ(f[6]) : null;
        var bjd = bj ? (dp.mo + "月" + (dp.dd + (bj.nextDay ? 1 : 0)) + "日") : "";
        var t = f[6] ? (en ? f[6] + " ET" : f[6] + " 美东 / " + bj.time + " 北京" + bjd) : (en ? "TBD" : "待定");
        var counts = { H: 0, D: 0, A: 0 };
        A.MODELS.forEach(function (mo, mi) { counts[A.predict(f[2], f[3], mi, i).x2]++; });
        var cons = "H"; if (counts.D > counts[cons]) cons = "D"; if (counts.A > counts[cons]) cons = "A";
        var ci = A.LBL.x2[cons];
        rows += "<div class='wc-dtoday-row' data-i='" + i + "'><span class='tm'>" + t + "</span>" +
          "<div class='ln'><span class='mt'><span class='s l'><span class='fl'>" + WC.flag(f[2]) + "</span>" + WC.nm(f[2]) + "</span><i>vs</i><span class='s r'>" + WC.nm(f[3]) + "<span class='fl'>" + WC.flag(f[3]) + "</span></span></span>" +
          "<span class='pred pk pk-" + ci.t + "'>" + (en ? ci.en : ci.zh) + " " + counts[cons] + "/6</span></div></div>";
      });
    } else {
      rows = (window.__WC_KO.KO || []).filter(function (m) { return m[2] === pickDay.dk; }).map(function (m) {
        var kbj = etToBJ(m[3]); var kp = dateParts(m[2]);
        var t = en ? m[3] + " ET" : m[3] + " 美东 / " + kbj.time + " 北京" + kp.mo + "月" + (kp.dd + (kbj.nextDay ? 1 : 0)) + "日";
        var badge = m[1] === 4 ? (m[0] === 103 ? (en ? "3rd" : "季军赛") : (en ? "Final" : "决赛")) : (en ? KO_SHORT_EN[m[1]] : KO_SHORT_ZH[m[1]]);
        return "<div class='wc-dtoday-row'><span class='tm'>" + t + "</span>" +
          "<div class='ln'><span class='mt'>" + (en ? m[5] : m[4]) + " <i>vs</i> " + (en ? m[7] : m[6]) + "</span>" +
          "<span class='pred gp'>" + badge + "</span></div></div>";
      }).join("");
    }
    tHost.innerHTML = rows || "<div class='wc-dtoday-empty'>" + (en ? "No matches" : "暂无比赛") + "</div>";

    var cardHost = el("wc-dash-card-body"); if (!cardHost) return;
    if (pickDay.type === "group") {
      var idxs = []; WC.FIX.forEach(function (f, i) { if (f[0] === pickDay.dk) idxs.push(i); });
      cardHost.innerHTML = idxs.map(function (i) { return "<div class='wc-dash-pickcard'>" + pickCardHTML(A, en, i, arenaResults()) + "</div>"; }).join("");
    } else {
      cardHost.innerHTML = "<div class='wc-dtoday-empty'>" + (en ? "Knockout pairings are bracket slots — per-match cards open once teams are set." : "淘汰赛为占位对阵，球队确定后再开放单场卡。") + "</div>";
    }
  }

  function renderArena() {
    var A = window.__WC_ARENA, lb = el("wc-lb");
    if (!A || !lb) return;
    var en = WC.getLang() === "en";
    var MODELS = A.MODELS, FIX = WC.FIX, res = arenaResults();

    /* ---- scoring ---- */
    var rk = arenaRanked(A);
    var ranked = rk.ranked, settledN = rk.settledN;

    lb.innerHTML =
      "<div class='wc-lb-head'><span class='wc-lb-ttl'>" + (en ? "Leaderboard" : "积分榜") + "</span>" +
        "<span class='wc-lb-note'>" + (settledN
          ? (en ? settledN + " / " + FIX.length + " matches settled" : settledN + " / " + FIX.length + " 场已结算")
          : (en ? "Locked · awaiting kickoff" : "已锁定 · 待开赛结算")) + "</span></div>" +
      "<div class='wc-lb-grid'>" + ranked.map(function (s, r) {
        var lead = r === 0 && s.pts > 0 ? " lead" : "";
        var acc = s.tot ? Math.round(s.hit / s.tot * 100) + "%" : "—";
        return "<div class='wc-lbc" + lead + "'>" +
          "<div class='wc-lbc-rank'>" + (r + 1) + "</div>" +
          "<div class='wc-lbc-main'><div class='wc-lbc-name'>" + s.m.name + "</div>" +
            "<div class='wc-lbc-sub'>" + (en ? "match " + s.mpts + " · pool " + s.gpts : "单场 " + s.mpts + " · 全局 " + s.gpts) + "</div></div>" +
          "<div class='wc-lbc-pts'><b>" + s.pts + "</b><span>" + (en ? "pts" : "分") + "</span></div>" +
        "</div>";
      }).join("") + "</div>";

    renderPool(A, en);
    renderGroupPool(A, en);
    renderAmList(A, en, res);
    renderAmCard(A, en, res);
  }

  /* ---- outright pool: champion / finalists / semis / region / total goals ---- */
  function teamTag(A, t, en, settled, hit) {
    var mk = settled ? "<i>" + (hit ? "✓" : "✗") + "</i>" : "";
    var cl = settled ? (hit ? " ok" : " no") : "";
    return "<span class='tg" + cl + "'><span class='fl'>" + WC.flag(t) + "</span>" + WC.nm(t) + mk + "</span>";
  }
  function renderPool(A, en) {
    var host = el("wc-pool"); if (!host) return;
    var cards = A.MODELS.map(function (mo, mi) {
      var p = A.poolPick(mi);
      var champSettled = !!A.CHAMPION, confSettled = !!A.WINNER_CONF, goalsSettled = A.TOTAL_GOALS != null;
      var confInfo = A.LBL.conf[p.conf] || A.LBL.conf.OTHER;
      var goalsInfo = A.LBL.goals[p.goals];
      var actualGoals = goalsSettled ? (A.TOTAL_GOALS > A.GOALS_LINE ? "O" : "U") : null;
      return "<div class='wc-poolc'>" +
        "<div class='wc-poolc-name'>" + mo.name + "</div>" +
        "<div class='wc-poolc-row'><span class='k'>" + (en ? "Champion +" + gpts(A,"champ") : "夺冠 +" + gpts(A,"champ")) + "</span><span class='v'>" + teamTag(A, p.champ, en, champSettled, p.champ === A.CHAMPION) + "</span></div>" +
        "<div class='wc-poolc-row'><span class='k'>" + (en ? "Finalists +" + gpts(A,"final") : "进决赛 +" + gpts(A,"final")) + "</span><span class='v wrap'>" + p.final.map(function (t) { return teamTag(A, t, en, (A.FINALISTS || []).length > 0, (A.FINALISTS || []).indexOf(t) >= 0); }).join("") + "</span></div>" +
        "<div class='wc-poolc-row'><span class='k'>" + (en ? "Semis +" + gpts(A,"semi") : "四强 +" + gpts(A,"semi")) + "</span><span class='v wrap'>" + p.semi.map(function (t) { return teamTag(A, t, en, (A.SEMIS || []).length > 0, (A.SEMIS || []).indexOf(t) >= 0); }).join("") + "</span></div>" +
        "<div class='wc-poolc-row'><span class='k'>" + (en ? "Region +" + gpts(A,"conf") : "夺冠大洲 +" + gpts(A,"conf")) + "</span><span class='v'>" + chip(A, "conf", p.conf, en, confSettled, p.conf === A.WINNER_CONF) + "</span></div>" +
        "<div class='wc-poolc-row'><span class='k'>" + (en ? "Total goals +" + gpts(A,"goals") : "总进球 +" + gpts(A,"goals")) + "</span><span class='v'>" + chip(A, "goals", p.goals, en, goalsSettled, p.goals === actualGoals) + "</span></div>" +
      "</div>";
    }).join("");
    var TBD = "<span class='wc-tbd'>" + (en ? "TBD" : "待定") + "</span>";
    var tt = function (t) { return teamTag(A, t, en, false, false); };
    var item = function (lab, val) { return "<span class='it'><b>" + lab + "</b><span class='vv'>" + val + "</span></span>"; };
    var actualBar = "<div class='wc-pool-actual'>" +
      "<span class='lbl'>" + (en ? "RESULT" : "赛果") + "</span>" +
      item(en ? "Champion" : "夺冠", A.CHAMPION ? tt(A.CHAMPION) : TBD) +
      item(en ? "Finalists" : "进决赛", (A.FINALISTS || []).length ? A.FINALISTS.map(tt).join("") : TBD) +
      item(en ? "Semis" : "四强", (A.SEMIS || []).length ? A.SEMIS.map(tt).join("") : TBD) +
      item(en ? "Region" : "夺冠大洲", A.WINNER_CONF ? chip(A, "conf", A.WINNER_CONF, en, false, false) : TBD) +
      item(en ? "Total goals" : "总进球", A.TOTAL_GOALS != null ? chip(A, "goals", (A.TOTAL_GOALS > A.GOALS_LINE ? "O" : "U"), en, false, false) : TBD) +
    "</div>";
    host.innerHTML =
      "<div class='wc-pool-head'><div><span class='wc-pool-ttl'>" + (en ? "Outright pool" : "全局彩池") + "</span>" +
        "<span class='wc-pool-sub'>" + (en ? "Total-goals line " + A.GOALS_LINE : "总进球盘口 " + A.GOALS_LINE) + "</span></div>" +
        "<span class='wc-lock'>" + (en ? "Locked pre-tournament · settles after" : "🔒 开赛前锁定 · 赛后开奖") + "</span></div>" +
      actualBar +
      "<div class='wc-pool-grid'>" + cards + "</div>";
  }

  /* ---- group winners pool (12 groups × 6 models) ---- */
  function renderGroupPool(A, en) {
    var host = el("wc-grouppool"); if (!host) return;
    var G = WC.groups(), gw = A.GROUP_WINNERS || {}, keys = Object.keys(G).sort();
    var head = "<thead><tr><th class='gx'>" + (en ? "Group" : "小组") + "</th>" +
      "<th class='ac'>" + (en ? "Result" : "赛果") + "</th>" +
      A.MODELS.map(function (m) { return "<th>" + m.name + "</th>"; }).join("") + "</tr></thead>";
    var body = keys.map(function (g) {
      var settled = !!gw[g];
      var cells = A.MODELS.map(function (mo, mi) {
        var t = A.poolPick(mi).groups[g];
        var hit = settled && t === gw[g];
        var why = A.GW_REASON ? A.GW_REASON(mi, g) : "";
        return "<td" + (why ? " title=\"" + why.replace(/"/g, "&quot;") + "\"" : "") + ">" + teamTag(A, t, en, settled, hit) + "</td>";
      }).join("");
      var acTd = settled ? "<td class='ac'>" + teamTag(A, gw[g], en, false, false) + "</td>"
                         : "<td class='ac'><span class='pk pk-dim'>" + (en ? "TBD" : "待定") + "</span></td>";
      return "<tr><td class='gx'>" + (en ? "Group " + g : g + " 组") + "</td>" + acTd + cells + "</tr>";
    }).join("");
    host.innerHTML = "<table class='wc-gp-tbl'>" + head + "<tbody>" + body + "</tbody></table>";
  }

  /* ---- match picker ---- */
  function dkNum(dk) { var p = ("" + dk).split("."); return (+p[0]) * 100 + (+p[1]); }
  function isRevealed(i) {
    var A = window.__WC_ARENA; if (!A || !A.REVEAL_THROUGH) return true;
    return dkNum(WC.FIX[i][0]) <= dkNum(A.REVEAL_THROUGH);
  }
  function renderAmList(A, en, res) {
    var host = el("wc-amlist"); if (!host) return;
    host.innerHTML = WC.FIX.map(function (f, i) {
      var done = !!res[i], rev = isRevealed(i);
      var tail = done ? "<span class='dn'>" + ("" + res[i]).split("/")[0] + "</span>"
        : rev ? "<span class='gp'>" + (en ? "Grp " + f[1] : f[1] + "组") + "</span>"
        : "<span class='lk' title='" + (en ? "Not released yet" : "待产出") + "'>🔒</span>";
      return "<button type='button' class='wc-amrow" + (i === selMatch ? " sel" : "") + (rev ? "" : " locked") + "' data-i='" + i + "'>" +
        "<span class='no'>#" + (i + 1) + "</span>" +
        "<span class='tt'><span class='s l'><span class='fl'>" + WC.flag(f[2]) + "</span>" + WC.nm(f[2]) + "</span><i>vs</i><span class='s r'>" + WC.nm(f[3]) + "<span class='fl'>" + WC.flag(f[3]) + "</span></span></span>" +
        tail +
      "</button>";
    }).join("");
    host.querySelectorAll(".wc-amrow").forEach(function (b) {
      b.addEventListener("click", function () { selMatch = +b.getAttribute("data-i"); renderAmList(A, en, arenaResults()); renderAmCard(A, en, arenaResults()); });
    });
  }

  /* ---- per-match pick card (7 markets) ---- */
  function pickCardHTML(A, en, i, res) {
    var MODELS = A.MODELS, f = WC.FIX[i];
    var sc = res[i], actual = actualMarketsFor(A, f, sc), line = A.handLine(f[2], f[3]);
    var ftStr = sc ? ("" + sc).split("/")[0] : "";
    var head =
      "<div class='wc-amc-head'>" +
        "<div class='wc-amc-top'><span class='wc-amc-tag'>" + (en ? "Pick card · #" : "竞猜卡 · 第") + (i + 1) + (en ? "" : " 场") + "</span>" +
          "<span class='wc-amc-meta'>" + (en ? "Grp " + f[1] : f[1] + "组") + " · " + (en ? WC.DATE_EN[f[0]] : WC.DATE_ZH[f[0]]) + (sc ? " · " + (en ? "FT" : "完场") : "") + "</span></div>" +
        "<div class='wc-amc-match'><span class='t'><span class='fl'>" + WC.flag(f[2]) + "</span>" + WC.nm(f[2]) + "</span>" +
          "<span class='sc" + (sc ? " done" : "") + "'>" + (ftStr ? ftStr.replace(":", " : ") : (en ? "vs" : "vs")) + "</span>" +
          "<span class='t r'>" + WC.nm(f[3]) + "<span class='fl'>" + WC.flag(f[3]) + "</span></span></div>" +
        "<div class='wc-amc-legend'>" +
          "<span><b>" + (en ? "Home" : "主") + "</b> " + WC.flag(f[2]) + " " + WC.nm(f[2]) + "</span>" +
          "<span><b>" + (en ? "Away" : "客") + "</b> " + WC.flag(f[3]) + " " + WC.nm(f[3]) + "</span>" +
        "</div>" +
      "</div>";
    if (!isRevealed(i)) {
      return head + "<div class='wc-amc-locked'><span class='lk'>🔒</span>" +
        "<b>" + (en ? "Not released yet" : "本场预测待产出") + "</b>" +
        "<span>" + (en ? "Predictions are published day by day — this match opens on " + WC.DATE_EN[f[0]] + "." : "预测逐日产出，本场将在比赛日（" + WC.DATE_ZH[f[0]] + "）当天公布。") + "</span></div>";
    }
    var thead = "<thead><tr><th class='mk'>" + (en ? "Market" : "市场") + "</th>" +
      "<th class='ac'>" + (en ? "Result" : "赛果") + "</th>" +
      MODELS.map(function (m) { return "<th>" + m.name + "</th>"; }).join("") + "</tr></thead>";
    var rows = A.MARKETS.map(function (mk) {
      var lab = mk.key === "hc" ? hcLabel(A, line, en) : (en ? mk.en : mk.zh);
      var aval = actual ? actual[mk.key] : null;
      var settled = aval != null;
      var cells = MODELS.map(function (mo, mi) {
        var pr = A.predict(f[2], f[3], mi, i);
        return "<td>" + chip(A, mk.key, pr[mk.key], en, settled, settled && pr[mk.key] === aval) + "</td>";
      }).join("");
      var acHtml = settled ? "<td class='ac'>" + chip(A, mk.key, aval, en, false, false) + "</td>"
                           : "<td class='ac'><span class='pk pk-dim'>" + (en ? "TBD" : "待定") + "</span></td>";
      return "<tr><td class='mk'><b>" + lab + "</b><span class='pt'>+" + mk.pts + "</span></td>" + acHtml + cells + "</tr>";
    }).join("");
    return head + "<div class='wc-amc-scroll'><table class='wc-amc-tbl'>" + thead + "<tbody>" + rows + "</tbody></table></div>";
  }
  function renderAmCard(A, en, res) {
    var host = el("wc-amcard"); if (!host) return;
    host.innerHTML = pickCardHTML(A, en, selMatch, res);
  }


  /* --------------------------------------------------------- lang / reveal / nav */
  function setLang(lang) {
    WC.setLangVar(lang);
    try { localStorage.setItem("wc-lang", lang); } catch (e) {}
    document.body.setAttribute("data-lang", lang);
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      var on = b.getAttribute("data-lang") === lang;
      b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    WC.applyI18n();
    WC.renderOdds();
    renderTimeline();
    renderPhaseDetail();
    renderGroups();
    renderArena();
    renderDash();
  }

  function initReveal() {
    var items = [].slice.call(document.querySelectorAll(".wc-reveal"));
    function scan() {
      var vh = window.innerHeight || 800;
      items.forEach(function (x) {
        if (x.classList.contains("in")) return;
        var r = x.getBoundingClientRect();
        if (r.top < vh * 0.9 && r.bottom > 0) x.classList.add("in");
      });
    }
    scan(); window.addEventListener("scroll", scan, { passive: true }); window.addEventListener("resize", scan, { passive: true });
    setTimeout(function () { items.forEach(function (x) { x.classList.add("in"); }); }, 1400);
  }

  function initNav() {
    var links = [].slice.call(document.querySelectorAll(".topnav-links a.sb-link"));
    var ids = links.map(function (a) { return a.getAttribute("href").slice(1); });
    function onScroll() {
      var y = window.scrollY + 130; var cur = ids[0];
      ids.forEach(function (id) { var s = document.getElementById(id); if (s && s.offsetTop <= y) cur = id; });
      // 滚到页面底部时强制激活最后一个 section(about 太矮、否则永远够不到 scrollY+130 判定线 → 关于点了不亮)
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = ids[ids.length - 1];
      links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + cur); });
    }
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* --------------------------------------------------------- boot */
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".lang-btn").forEach(function (b) { b.addEventListener("click", function () { setLang(b.getAttribute("data-lang")); }); });

    setLang(WC.getLang());
    initReveal();
    initNav();
  });
})();
