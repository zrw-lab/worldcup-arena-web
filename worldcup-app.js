/* ============================================================================
   世界杯 2026 预测专题 — app logic
   Real 2026 World Cup groups + matchday-1 fixtures. Champion-odds table,
   two-tab single-match predictor (fixtures / custom) powered by an LLM
   (window.claude.complete) with a local heuristic fallback. Bilingual.
   ========================================================================== */
(function () {
  "use strict";

  // ---- Teams: en -> [zh, flag, rating] ------------------------------------
  var T = {
    "Mexico":["墨西哥","🇲🇽",1832], "South Africa":["南非","🇿🇦",1710], "South Korea":["韩国","🇰🇷",1840], "Czechia":["捷克","🇨🇿",1818],
    "Canada":["加拿大","🇨🇦",1872], "Bosnia & Herzegovina":["波黑","🇧🇦",1788], "Qatar":["卡塔尔","🇶🇦",1740], "Switzerland":["瑞士","🇨🇭",1898],
    "Brazil":["巴西","🇧🇷",2049], "Morocco":["摩洛哥","🇲🇦",1955], "Haiti":["海地","🇭🇹",1660], "Scotland":["苏格兰","🏴󠁧󠁢󠁳󠁣󠁴󠁿",1828],
    "USA":["美国","🇺🇸",1888], "Paraguay":["巴拉圭","🇵🇾",1812], "Australia":["澳大利亚","🇦🇺",1830], "Türkiye":["土耳其","🇹🇷",1872],
    "Germany":["德国","🇩🇪",2010], "Curaçao":["库拉索","🇨🇼",1648], "Côte d'Ivoire":["科特迪瓦","🇨🇮",1860], "Ecuador":["厄瓜多尔","🇪🇨",1900],
    "Netherlands":["荷兰","🇳🇱",1985], "Japan":["日本","🇯🇵",1888], "Sweden":["瑞典","🇸🇪",1842], "Tunisia":["突尼斯","🇹🇳",1812],
    "Belgium":["比利时","🇧🇪",1958], "Egypt":["埃及","🇪🇬",1850], "Iran":["伊朗","🇮🇷",1860], "New Zealand":["新西兰","🇳🇿",1690],
    "Spain":["西班牙","🇪🇸",2088], "Cape Verde":["佛得角","🇨🇻",1735], "Saudi Arabia":["沙特","🇸🇦",1760], "Uruguay":["乌拉圭","🇺🇾",1944],
    "France":["法国","🇫🇷",2078], "Senegal":["塞内加尔","🇸🇳",1905], "Iraq":["伊拉克","🇮🇶",1735], "Norway":["挪威","🇳🇴",1898],
    "Argentina":["阿根廷","🇦🇷",2065], "Algeria":["阿尔及利亚","🇩🇿",1858], "Austria":["奥地利","🇦🇹",1880], "Jordan":["约旦","🇯🇴",1735],
    "Portugal":["葡萄牙","🇵🇹",2008], "DR Congo":["刚果(金)","🇨🇩",1808], "Uzbekistan":["乌兹别克斯坦","🇺🇿",1755], "Colombia":["哥伦比亚","🇨🇴",1925],
    "England":["英格兰","🏴󠁧󠁢󠁥󠁮󠁧󠁿",2034], "Croatia":["克罗地亚","🇭🇷",1922], "Ghana":["加纳","🇬🇭",1820], "Panama":["巴拿马","🇵🇦",1735]
  };
  function zh(en) { return (T[en] && T[en][0]) || en; }
  // ---- FIFA 3-letter codes (shown as a badge before each team) ------------
  var FIFA = {
    "Mexico":"MEX","South Africa":"RSA","South Korea":"KOR","Czechia":"CZE",
    "Canada":"CAN","Bosnia & Herzegovina":"BIH","Qatar":"QAT","Switzerland":"SUI",
    "Brazil":"BRA","Morocco":"MAR","Haiti":"HAI","Scotland":"SCO",
    "USA":"USA","Paraguay":"PAR","Australia":"AUS","Türkiye":"TUR",
    "Germany":"GER","Curaçao":"CUW","Côte d'Ivoire":"CIV","Ecuador":"ECU",
    "Netherlands":"NED","Japan":"JPN","Sweden":"SWE","Tunisia":"TUN",
    "Belgium":"BEL","Egypt":"EGY","Iran":"IRN","New Zealand":"NZL",
    "Spain":"ESP","Cape Verde":"CPV","Saudi Arabia":"KSA","Uruguay":"URU",
    "France":"FRA","Senegal":"SEN","Iraq":"IRQ","Norway":"NOR",
    "Argentina":"ARG","Algeria":"ALG","Austria":"AUT","Jordan":"JOR",
    "Portugal":"POR","DR Congo":"COD","Uzbekistan":"UZB","Colombia":"COL",
    "England":"ENG","Croatia":"CRO","Ghana":"GHA","Panama":"PAN"
  };
  function flag(en) { return FIFA[en] || "—"; }
  // ---- 国旗：ISO 代码 -> flags/xx.svg（自托管 SVG；fimg 出图片，femo 出 emoji 给纯文本场景） ----
  var ISO = {
    "Mexico":"mx","South Africa":"za","South Korea":"kr","Czechia":"cz",
    "Canada":"ca","Bosnia & Herzegovina":"ba","Qatar":"qa","Switzerland":"ch",
    "Brazil":"br","Morocco":"ma","Haiti":"ht","Scotland":"gb-sct",
    "USA":"us","Paraguay":"py","Australia":"au","Türkiye":"tr",
    "Germany":"de","Curaçao":"cw","Côte d'Ivoire":"ci","Ecuador":"ec",
    "Netherlands":"nl","Japan":"jp","Sweden":"se","Tunisia":"tn",
    "Belgium":"be","Egypt":"eg","Iran":"ir","New Zealand":"nz",
    "Spain":"es","Cape Verde":"cv","Saudi Arabia":"sa","Uruguay":"uy",
    "France":"fr","Senegal":"sn","Iraq":"iq","Norway":"no",
    "Argentina":"ar","Algeria":"dz","Austria":"at","Jordan":"jo",
    "Portugal":"pt","DR Congo":"cd","Uzbekistan":"uz","Colombia":"co",
    "England":"gb-eng","Croatia":"hr","Ghana":"gh","Panama":"pa"
  };
  function fimg(en) {
    var c = ISO[en];
    if (!c) return "<span class='flx-code'>" + (FIFA[en] || en) + "</span>";
    return "<img class='flx' src='flags/" + c + ".svg' alt='" + (FIFA[en] || "") + "' title='" + (FIFA[en] || "") + "'>";
  }
  function femo(en) { return (T[en] && T[en][1]) || FIFA[en] || en; }
  function rate(en) { return (T[en] && T[en][2]) || 1780; }
  var EN_SHORT = { "Bosnia & Herzegovina": "Bosnia" };   // 仅显示用:超长英文名缩短(T/ISO/FIFA/FIX 键不动)
  function nm(en) { return LANG === "en" ? (EN_SHORT[en] || en) : zh(en); }

  // ---- Champion odds (illustrative model output) --------------------------
  // [en, title%, semis%, tierKey]
  var ODDS = [
    ["Spain",15.2,35,"fav"], ["France",13.4,33,"fav"], ["Argentina",13.0,32,"holders"],
    ["Brazil",10.6,30,"t1"], ["England",9.8,29,"t1"], ["Portugal",7.0,24,"t2"],
    ["Germany",6.2,22,"t2"], ["Netherlands",5.4,21,"t2"], ["Belgium",3.4,15,"t3"],
    ["Uruguay",2.8,13,"t3"], ["Croatia",2.2,11,"dark"], ["Morocco",2.0,12,"dark"]
  ];
  var TIER = {
    holders:{zh:"卫冕冠军",en:"Holders"}, fav:{zh:"夺冠大热",en:"Favourite"},
    t1:{zh:"第一档",en:"Tier 1"}, t2:{zh:"第二档",en:"Tier 2"},
    t3:{zh:"第三档",en:"Tier 3"}, dark:{zh:"黑马",en:"Dark horse"}
  };

  // ---- Matchday-1 fixtures (real 2026 schedule) ---------------------------
  // [dateKey, group, teamA, teamB, venueZh, venueEn, etTime]
  var FIX = [
    ["6.11","A","Mexico","South Africa","墨西哥城","Mexico City","15:00"],
    ["6.11","A","South Korea","Czechia","瓜达拉哈拉","Guadalajara","22:00"],
    ["6.12","B","Canada","Bosnia & Herzegovina","多伦多","Toronto","15:00"],
    ["6.12","D","USA","Paraguay","洛杉矶","Los Angeles","21:00"],
    ["6.13","B","Qatar","Switzerland","旧金山湾区","SF Bay Area","15:00"],
    ["6.13","C","Brazil","Morocco","纽约","New York","18:00"],
    ["6.13","C","Haiti","Scotland","波士顿","Boston","21:00"],
    ["6.13","D","Australia","Türkiye","温哥华","Vancouver",""],
    ["6.14","E","Germany","Curaçao","休斯顿","Houston","13:00"],
    ["6.14","E","Côte d'Ivoire","Ecuador","费城","Philadelphia","19:00"],
    ["6.14","F","Netherlands","Japan","达拉斯","Dallas","16:00"],
    ["6.14","F","Sweden","Tunisia","蒙特雷","Monterrey","22:00"],
    ["6.15","H","Spain","Cape Verde","亚特兰大","Atlanta","13:00"],
    ["6.15","G","Belgium","Egypt","西雅图","Seattle","18:00"],
    ["6.15","H","Saudi Arabia","Uruguay","迈阿密","Miami","18:00"],
    ["6.15","G","Iran","New Zealand","洛杉矶","Los Angeles",""],
    ["6.16","I","France","Senegal","纽约","New York","15:00"],
    ["6.16","I","Iraq","Norway","波士顿","Boston","18:00"],
    ["6.16","J","Argentina","Algeria","堪萨斯城","Kansas City","21:00"],
    ["6.16","J","Austria","Jordan","旧金山湾区","SF Bay Area",""],
    ["6.17","K","Portugal","DR Congo","休斯顿","Houston","13:00"],
    ["6.17","L","England","Croatia","达拉斯","Dallas","16:00"],
    ["6.17","L","Ghana","Panama","多伦多","Toronto","19:00"],
    ["6.17","K","Uzbekistan","Colombia","墨西哥城","Mexico City","22:00"]
  ];
  var DATE_EN = {"6.11":"Jun 11","6.12":"Jun 12","6.13":"Jun 13","6.14":"Jun 14","6.15":"Jun 15","6.16":"Jun 16","6.17":"Jun 17"};
  var DATE_ZH = {"6.11":"6月11日","6.12":"6月12日","6.13":"6月13日","6.14":"6月14日","6.15":"6月15日","6.16":"6月16日","6.17":"6月17日"};

  // ---- Groups, confederations, derived team facts -------------------------
  var GROUP_OF = {};
  FIX.forEach(function (f) { GROUP_OF[f[2]] = f[1]; GROUP_OF[f[3]] = f[1]; });
  var CONF_LIST = {
    AFC: ["Australia","Iran","Japan","Jordan","South Korea","Qatar","Saudi Arabia","Uzbekistan","Iraq"],
    CAF: ["Algeria","Cape Verde","Côte d'Ivoire","Egypt","Ghana","Morocco","Senegal","South Africa","Tunisia","DR Congo"],
    CONCACAF: ["USA","Canada","Mexico","Curaçao","Haiti","Panama"],
    CONMEBOL: ["Argentina","Brazil","Colombia","Ecuador","Paraguay","Uruguay"],
    OFC: ["New Zealand"],
    UEFA: ["England","France","Croatia","Norway","Portugal","Germany","Netherlands","Austria","Belgium","Scotland","Spain","Switzerland","Sweden","Türkiye","Bosnia & Herzegovina","Czechia"]
  };
  var CONF_OF = {};
  Object.keys(CONF_LIST).forEach(function (c) { CONF_LIST[c].forEach(function (tm) { CONF_OF[tm] = c; }); });
  var CONF_ZH = { AFC:"亚足联", CAF:"非洲", CONCACAF:"中北美", CONMEBOL:"南美", OFC:"大洋洲", UEFA:"欧洲" };
  var ODDS_OF = {}; ODDS.forEach(function (r) { ODDS_OF[r[0]] = r[1]; });
  function grp(en) { return GROUP_OF[en] || "—"; }
  function conf(en) { return CONF_OF[en] || "—"; }
  function confLabel(en) { var c = CONF_OF[en] || "—"; return LANG === "en" ? c : (CONF_ZH[c] || c); }
  function oddsOf(en) { return ODDS_OF.hasOwnProperty(en) ? ODDS_OF[en] : null; }
  function ratePct(en) { var r = rate(en); return Math.max(8, Math.min(100, Math.round((r - 1620) / (2100 - 1620) * 100))); }
  function tierLabel(en) {
    var r = rate(en);
    var L = r >= 2000 ? ["夺冠级","Contender"] : r >= 1900 ? ["强队","Strong side"] : r >= 1830 ? ["第二档","Tier 2"] : r >= 1760 ? ["中游","Mid-tier"] : ["黑马","Outsider"];
    return LANG === "en" ? L[1] : L[0];
  }

  // ---- Groups (A–L) and tournament timeline -------------------------------
  function groups() {
    var g = {};
    FIX.forEach(function (f) {
      (g[f[1]] = g[f[1]] || {});
      g[f[1]][f[2]] = 1; g[f[1]][f[3]] = 1;
    });
    var out = {};
    Object.keys(g).sort().forEach(function (k) {
      out[k] = Object.keys(g[k]).sort(function (a, b) { return rate(b) - rate(a); });
    });
    return out;
  }
  // [phaseZh, phaseEn, dateZh, dateEn, status, descZh, descEn, facts[]]
  // facts: short {zh,en} stat chips. "today" is 2026-06-09; group stage opens 6/11.
  var PHASES = [
    ["小组赛","Group stage","6.11 — 6.27","Jun 11 – 27","next",
      "12 个小组、每组 4 队进行单循环，共 72 场。每组前两名，加上 8 个成绩最好的小组第三名，晋级 32 强。揭幕战 6 月 11 日在墨西哥城阿兹特克球场打响。",
      "12 groups of four play a round-robin — 72 matches in all. The top two of each group plus the eight best third-placed teams reach the round of 32. The opener is June 11 at Estadio Azteca, Mexico City.",
      [["48 支球队","48 teams"],["72 场比赛","72 matches"],["单循环","Round-robin"],["前 2 + 8 出线","Top 2 + 8 advance"]]],
    ["32 强淘汰赛","Round of 32","6.28 — 7.3","Jun 28 – Jul 3","upcoming",
      "扩军到 48 队后新增的一轮淘汰赛。32 支球队捉对厮杀、单场定胜负，平局则进入加时与点球，共 16 场。",
      "A brand-new knockout round introduced with the 48-team format. 32 teams in single-leg ties — extra time and penalties if level — across 16 matches.",
      [["32 支球队","32 teams"],["16 场比赛","16 matches"],["单场淘汰","Single-leg KO"],["首次设立","New round"]]],
    ["16 强","Round of 16","7.4 — 7.7","Jul 4 – 7","upcoming",
      "16 支球队进入八分之一决赛，8 场单场淘汰。从这一轮开始，每一场都可能是某支强队的终点。",
      "The last 16 meet in eight single-leg ties. From here on, one bad night ends any campaign.",
      [["16 支球队","16 teams"],["8 场比赛","8 matches"],["单场淘汰","Single-leg KO"]]],
    ["八强","Quarter-finals","7.9 — 7.11","Jul 9 – 11","upcoming",
      "8 强争夺 4 个半决赛席位，共 4 场。强强对话密集登场，夺冠热门的成色将受到真正检验。",
      "Eight teams chase four semi-final spots over four matches — the stage where genuine contenders are separated from pretenders.",
      [["8 支球队","8 teams"],["4 场比赛","4 matches"],["争 4 强席位","4 SF spots"]]],
    ["半决赛","Semi-finals","7.14 — 7.15","Jul 14 – 15","upcoming",
      "4 强两场对决，胜者会师决赛，负者争夺季军。距离大力神杯只差一步。",
      "Two matches; winners go to the final, losers to the third-place playoff. One step from the trophy.",
      [["4 支球队","4 teams"],["2 场比赛","2 matches"],["胜者进决赛","Winners → final"]]],
    ["决赛","Final","7.19","Jul 19","upcoming",
      "7 月 19 日在纽约 / 新泽西 MetLife 体育场举行的收官之战，决出 2026 世界杯冠军。季军赛于 7 月 18 日进行。",
      "The title decider on July 19 at MetLife Stadium, New York / New Jersey. The third-place playoff is held on July 18.",
      [["2 支球队","2 teams"],["1 场定冠军","1 match"],["MetLife 体育场","MetLife Stadium"],["季军赛 7.18","3rd place Jul 18"]]]
  ];

  // ---- Models + prediction types ------------------------------------------
  var MODELS = ["Claude","GPT-5","Gemini","DeepSeek","Qwen / 通义"];
  var TYPES = [
    {k:"score",  zh:"比分预测", en:"Scoreline"},
    {k:"result", zh:"胜平负",   en:"Result"},
    {k:"goals",  zh:"全场进球数", en:"Total goals"},
    {k:"scorer", zh:"关键进球球员", en:"Key scorer"},
    {k:"tactics",zh:"战术看点",  en:"Tactical read"},
    {k:"advance",zh:"晋级/夺冠概率", en:"Advance & title"}
  ];

  // ---- i18n: swap [data-en]/[data-zh] innerHTML ---------------------------
  var LANG = (function () { try { return localStorage.getItem("wc-lang") || "zh"; } catch (e) { return "zh"; } })();
  function applyI18n() {
    var en = LANG === "en";
    document.querySelectorAll("[data-en][data-zh]").forEach(function (el) {
      el.innerHTML = en ? el.getAttribute("data-en") : el.getAttribute("data-zh");
    });
  }
  function t(zhStr, enStr) { return LANG === "en" ? enStr : zhStr; }

  // ---- Champion odds table render -----------------------------------------
  var maxPct = ODDS[0][1];
  function renderOdds() {
    var body = document.getElementById("wc-odds-body");
    if (!body) return;
    var en = LANG === "en";
    body.innerHTML = ODDS.map(function (r, i) {
      var name = en ? r[0] : zh(r[0]);
      var sub = en ? zh(r[0]) : r[0];
      var tier = en ? TIER[r[3]].en : TIER[r[3]].zh;
      var w = (r[1] / maxPct).toFixed(3);
      var lead = i === 0 ? " class='lead'" : "";
      var tierCls = r[3] === "holders" || r[3] === "fav" ? " holders" : "";
      return "<tr" + lead + ">" +
        "<td class='wc-rank'>" + (i + 1) + "</td>" +
        "<td class='wc-team'><span class='nm'><span class='flag'>" + fimg(r[0]) + "</span>" + name + "</span>" +
          "<span class='en'>" + sub + "</span></td>" +
        "<td class='wc-pct'>" + r[1].toFixed(1) + "%</td>" +
        "<td class='hide-sm'><div class='wc-bar'><i style='transform:scaleX(" + w + ")'></i></div></td>" +
        "<td class='hide-sm'>" + r[2] + "%</td>" +
        "<td class='wc-tier" + tierCls + "'>" + tier + "</td>" +
      "</tr>";
    }).join("");
  }

  // expose for the second file
  window.__WC = {
    T:T, zh:zh, flag:flag, fimg:fimg, femo:femo, rate:rate, nm:nm, ODDS:ODDS, FIX:FIX, DATE_EN:DATE_EN, DATE_ZH:DATE_ZH,
    MODELS:MODELS, TYPES:TYPES, applyI18n:applyI18n, t:t, renderOdds:renderOdds,
    grp:grp, conf:conf, confLabel:confLabel, oddsOf:oddsOf, ratePct:ratePct, tierLabel:tierLabel,
    groups:groups, PHASES:PHASES,
    getLang:function(){return LANG;}, setLangVar:function(l){LANG=l;}
  };
})();
