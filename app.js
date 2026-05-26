const ringLength = 552.92;

const fallbackData = {
  BTC: {
    score: 82,
    heat: "过热",
    mode: "偏热区",
    level: "高风险",
    title: "BTC 不建议追涨",
    advice: "现在追多容易买在拥挤区，先等市场降温。",
    fundingRate: "0.083%",
    fundingText: "偏高，说明追多情绪较强。",
    oiChange: "+12.4%",
    oiText: "持仓快速增加，杠杆正在堆积。",
    liquidationRisk: "强",
    liquidationText: "下方清算区较近，回落时容易连锁触发。",
    oneLine: "BTC 已经偏热，不要因为刚刚上涨就急着追。",
    heatBars: [34, 42, 48, 57, 64, 70, 76, 82, 88, 92],
    reasons: [
      "资金费率偏高，说明多头愿意付更高成本继续持仓。",
      "持仓量在短时间内上升，说明新杠杆资金正在进场。",
      "清算压力靠近当前价格，一旦回落，新手容易被迫止损。"
    ],
    source: "Mock fallback data"
  },
  ETH: {
    score: 63,
    heat: "偏热",
    mode: "观察区",
    level: "中风险",
    title: "ETH 谨慎观察",
    advice: "可以继续看，但不要用高杠杆追进去。",
    fundingRate: "0.041%",
    fundingText: "略高，市场有追多倾向。",
    oiChange: "+6.8%",
    oiText: "持仓温和增加，还没到极端拥挤。",
    liquidationRisk: "中",
    liquidationText: "清算区不远，回调时波动会变大。",
    oneLine: "ETH 还没完全过热，但新手不要急着加杠杆。",
    heatBars: [26, 31, 38, 42, 48, 54, 58, 63, 66, 68],
    reasons: [
      "资金费率略高，做多情绪开始升温。",
      "持仓量增加但还不夸张，说明市场有热度但没完全失控。",
      "如果价格继续快速上涨，风险分数会继续抬高。"
    ],
    source: "Mock fallback data"
  },
  SOL: {
    score: 38,
    heat: "冷静",
    mode: "安全区",
    level: "低风险",
    title: "SOL 暂时不拥挤",
    advice: "当前追涨风险不高，但仍要等明确入场位。",
    fundingRate: "0.012%",
    fundingText: "正常，没有明显追多拥挤。",
    oiChange: "-1.6%",
    oiText: "持仓没有增加，杠杆压力较小。",
    liquidationRisk: "弱",
    liquidationText: "清算压力暂时不集中。",
    oneLine: "SOL 现在相对冷静，适合观察，不适合盲目冲动。",
    heatBars: [18, 22, 20, 25, 28, 31, 34, 32, 36, 38],
    reasons: [
      "资金费率处在正常区间，市场没有明显一边倒。",
      "持仓量没有快速增加，说明杠杆资金没有明显堆积。",
      "清算压力不集中，短时间内连锁爆仓风险较低。"
    ],
    source: "Mock fallback data"
  }
};

let currentSymbol = "BTC";
const liveCache = {};
const demoKey = new URLSearchParams(window.location.search).get("key") || "";

const buttons = document.querySelectorAll(".coin-button");
const fields = {
  coinTitle: document.querySelector("#coinTitle"),
  riskPill: document.querySelector("#riskPill"),
  riskMode: document.querySelector("#riskMode"),
  heatLabel: document.querySelector("#heatLabel"),
  scoreRing: document.querySelector("#scoreRing"),
  riskScore: document.querySelector("#riskScore"),
  plainAdvice: document.querySelector("#plainAdvice"),
  reasonList: document.querySelector("#reasonList"),
  heatBars: document.querySelector("#heatBars"),
  fundingRate: document.querySelector("#fundingRate"),
  fundingText: document.querySelector("#fundingText"),
  oiChange: document.querySelector("#oiChange"),
  oiText: document.querySelector("#oiText"),
  liquidationRisk: document.querySelector("#liquidationRisk"),
  liquidationText: document.querySelector("#liquidationText"),
  oneLine: document.querySelector("#oneLine"),
  dataStatus: document.querySelector("#dataStatus"),
  sourceTitle: document.querySelector("#sourceTitle"),
  sourceDetail: document.querySelector("#sourceDetail"),
  pushButton: document.querySelector("#pushButton")
};

function riskColor(score) {
  if (score >= 75) return "#d64f4f";
  if (score >= 55) return "#d78a31";
  return "#32a66f";
}

function renderBars(values) {
  fields.heatBars.replaceChildren(
    ...values.map((value) => {
      const bar = document.createElement("span");
      bar.className = "heat-bar";
      if (value >= 75) bar.classList.add("is-hot");
      if (value >= 55 && value < 75) bar.classList.add("is-warm");
      bar.style.height = `${Math.max(value, 18)}%`;
      return bar;
    })
  );
}

function render(data) {
  const color = riskColor(data.score);

  fields.coinTitle.textContent = data.title;
  fields.riskPill.textContent = data.level;
  fields.riskPill.style.color = color;
  fields.riskPill.style.background = `color-mix(in srgb, ${color} 12%, white)`;
  fields.riskMode.textContent = data.mode;
  fields.riskMode.style.color = color;
  fields.riskMode.style.background = `color-mix(in srgb, ${color} 12%, white)`;
  fields.heatLabel.textContent = data.heat;
  fields.heatLabel.style.color = color;
  fields.heatLabel.style.background = `color-mix(in srgb, ${color} 12%, white)`;
  fields.scoreRing.style.stroke = color;
  fields.scoreRing.style.strokeDashoffset = String(ringLength - (ringLength * data.score) / 100);
  fields.riskScore.textContent = data.score;
  fields.plainAdvice.textContent = data.advice;
  fields.fundingRate.textContent = data.fundingRate;
  fields.fundingText.textContent = data.fundingText;
  fields.oiChange.textContent = data.oiChange;
  fields.oiText.textContent = data.oiText;
  fields.liquidationRisk.textContent = data.liquidationRisk;
  fields.liquidationText.textContent = data.liquidationText;
  fields.oneLine.textContent = data.oneLine;

  fields.reasonList.replaceChildren(
    ...data.reasons.map((reason, index) => {
      const item = document.createElement("li");
      item.dataset.index = String(index + 1).padStart(2, "0");
      item.textContent = reason;
      return item;
    })
  );

  renderBars(data.heatBars);
  fields.sourceTitle.textContent = data.source?.includes("Live") ? "Live CoinAnk API" : "Mock Fallback";
  fields.sourceDetail.textContent = data.updatedAt
    ? `已更新：${new Date(data.updatedAt).toLocaleString("zh-CN")}`
    : "本机代理未启动时显示模拟数据。";

  buttons.forEach((button) => {
    const isActive = button.dataset.symbol === data.symbol;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function setStatus(text, ok = true) {
  fields.dataStatus.textContent = text;
  document.body.classList.toggle("is-offline", !ok);
}

function requestJson(url, options = {}) {
  if (typeof window.fetch === "function") {
    return window.fetch(url, options).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "请求失败");
      return data;
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", url, true);
    xhr.responseType = "json";
    xhr.onload = () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data?.error || "请求失败"));
      }
    };
    xhr.onerror = () => reject(new Error("网络请求失败"));
    xhr.send(options.body || null);
  });
}

async function loadMarket(symbol) {
  currentSymbol = symbol;
  setStatus(`读取 ${symbol} 实时数据...`, true);
  render(liveCache[symbol] || { ...fallbackData[symbol], symbol });

  try {
    const params = new URLSearchParams({ symbol });
    if (demoKey) params.set("key", demoKey);
    const data = await requestJson(`/api/market?${params.toString()}`);
    liveCache[symbol] = data;
    render(data);
    setStatus("Live CoinAnk API · 0 金额授权", true);
  } catch (error) {
    render({ ...fallbackData[symbol], symbol });
    setStatus("本机代理未连接 · 使用模拟数据", false);
  }
}

async function pushAlert() {
  fields.pushButton.disabled = true;
  fields.pushButton.textContent = "发送中...";
  try {
    const params = new URLSearchParams({ symbol: currentSymbol });
    if (demoKey) params.set("key", demoKey);
    const result = await requestJson(`/api/push?${params.toString()}`, { method: "POST" });
    fields.pushButton.textContent = result.success ? "已发送" : "发送失败";
  } catch {
    fields.pushButton.textContent = "代理未连接";
  } finally {
    setTimeout(() => {
      fields.pushButton.disabled = false;
      fields.pushButton.textContent = "发送提醒";
    }, 1800);
  }
}

buttons.forEach((button) => {
  button.addEventListener("click", () => loadMarket(button.dataset.symbol));
});

fields.pushButton.addEventListener("click", pushAlert);

loadMarket("BTC");
