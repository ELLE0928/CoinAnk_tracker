const http = require("node:http");
const https = require("node:https");
const { spawnSync } = require("node:child_process");
const { readFileSync, existsSync } = require("node:fs");
const { extname, join, normalize } = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();
const ONCHAINOS = process.env.ONCHAINOS_BIN || "/Users/yuanyuan/.local/bin/onchainos";
const COINANK = "https://open-api.coinank.com";
const DEMO_KEY = process.env.DEMO_KEY || "";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const symbolMap = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function isAuthorized(url) {
  return !DEMO_KEY || url.searchParams.get("key") === DEMO_KEY;
}

function requestRaw(method, path, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, COINANK);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(
      target,
      {
        method,
        headers: {
          apikey: "",
          "content-type": "application/json",
          ...(payload ? { "content-length": String(payload.length) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, headers: res.headers, text });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function pickChallenge(headers) {
  const raw = headers["www-authenticate"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((item) => item.includes('intent="charge"'));
}

function parseJsonOutput(stdout) {
  const jsonStart = stdout.indexOf("{");
  return JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout);
}

function decodePaymentRequired(header) {
  if (!header) return null;
  const raw = Array.isArray(header) ? header[0] : header;
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
}

async function coinank(method, path, body) {
  const first = await requestRaw(method, path, body);
  if (first.status !== 402) return parseBody(first);

  const paymentRequired = decodePaymentRequired(first.headers["payment-required"]);
  if (paymentRequired?.accepts?.length) {
    const signed = spawnSync(ONCHAINOS, ["payment", "pay", "--accepts", JSON.stringify(paymentRequired.accepts)], {
      encoding: "utf8",
    });
    if (signed.status !== 0) {
      throw new Error(signed.stderr || signed.stdout || "onchainos payment pay failed");
    }

    const signedBody = parseJsonOutput(signed.stdout);
    const accepted = paymentRequired.accepts.find((item) => item.scheme === "exact") || paymentRequired.accepts[0];
    const paymentPayload = {
      x402Version: paymentRequired.x402Version || 2,
      resource: paymentRequired.resource,
      accepted,
      payload: {
        signature: signedBody.data.signature,
        authorization: signedBody.data.authorization,
      },
    };
    const signature = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
    const second = await requestAuthed(method, path, null, body, { "PAYMENT-SIGNATURE": signature });
    return parseBody(second);
  }

  const challenge = pickChallenge(first.headers);
  if (!challenge) {
    throw new Error("CoinAnk returned 402 but no one-shot authorization challenge was found.");
  }

  const signed = spawnSync(ONCHAINOS, ["payment", "charge", "--challenge", challenge], {
    encoding: "utf8",
  });
  if (signed.status !== 0) {
    throw new Error(signed.stderr || signed.stdout || "onchainos payment charge failed");
  }

  const signedBody = parseJsonOutput(signed.stdout);
  const authorization = signedBody.data.authorization_header;
  const second = await requestAuthed(method, path, authorization, body);
  return parseBody(second);
}

function requestAuthed(method, path, authorization, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, COINANK);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(
      target,
      {
        method,
        headers: {
          apikey: "",
          ...(authorization ? { authorization } : {}),
          ...extraHeaders,
          "content-type": "application/json",
          ...(payload ? { "content-length": String(payload.length) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseBody(response) {
  try {
    return {
      status: response.status,
      headers: response.headers,
      body: response.text ? JSON.parse(response.text) : {},
    };
  } catch {
    return { status: response.status, headers: response.headers, body: response.text };
  }
}

function firstArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.list)) return value.data.list;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  return [];
}

function findBySymbol(body, symbol, exchange = "Binance") {
  const rows = firstArray(body);
  return rows.find((row) => {
    const rowSymbol = String(row.symbol || row.instId || row.instrument || "").toUpperCase();
    const rowExchange = String(row.exchange || row.exName || row.exchangeName || "").toLowerCase();
    return rowSymbol.includes(symbol) && (!rowExchange || rowExchange.includes(exchange.toLowerCase()));
  }) || rows.find((row) => JSON.stringify(row).toUpperCase().includes(symbol));
}

function numeric(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function fundingRateFor(row, exchange = "Binance") {
  const direct = numeric(row, ["fundingRate", "rate", "fr", "currentFundingRate"]);
  if (direct !== null) return direct;

  const maps = [row?.umap, row?.cmap].filter(Boolean);
  for (const map of maps) {
    const exchangeRow = map[exchange] || map[exchange.toLowerCase()] || map[exchange.toUpperCase()];
    const value = numeric(exchangeRow, ["fundingRate", "rate", "fr", "currentFundingRate"]);
    if (value !== null) return value;
  }

  for (const map of maps) {
    for (const value of Object.values(map)) {
      const number = numeric(value, ["fundingRate", "rate", "fr", "currentFundingRate"]);
      if (number !== null) return number;
    }
  }

  return null;
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return "暂无";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "暂无";
  const percent = Math.abs(value) < 1 ? value * 100 : value;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(4)}%`;
}

function scoreFromMetrics(funding, oiChange) {
  const fundingAbs = Math.abs(Number.isFinite(funding) ? funding : 0);
  const fundingScore = Math.min(45, fundingAbs * 10000);
  const oiScore = Math.min(35, Math.max(0, Number.isFinite(oiChange) ? oiChange : 0) * 2.2);
  return Math.round(Math.max(18, Math.min(92, 24 + fundingScore + oiScore)));
}

function makeView(symbol, priceBody, fundingBody, oiBody) {
  const pair = symbolMap[symbol];
  const priceRow = findBySymbol(priceBody, pair) || priceBody.data || priceBody;
  const fundingRow = findBySymbol(fundingBody, symbol) || fundingBody.data || fundingBody;
  const oiRows = firstArray(oiBody.body || oiBody);
  const oiLatest = oiRows[oiRows.length - 1] || {};
  const oiPrev = oiRows[oiRows.length - 2] || {};

  const price = numeric(priceRow, ["price", "lastPrice", "last", "markPrice", "close"]);
  const funding = fundingRateFor(fundingRow);
  const oiValue = numeric(oiLatest, ["coinValue", "openInterest", "oi", "value"]);
  const oiPrevValue = numeric(oiPrev, ["coinValue", "openInterest", "oi", "value"]);
  const oiChange = oiValue && oiPrevValue ? ((oiValue - oiPrevValue) / oiPrevValue) * 100 : null;
  const score = scoreFromMetrics(funding, oiChange);
  const high = score >= 75;
  const mid = score >= 55 && score < 75;

  return {
    symbol,
    pair,
    score,
    heat: high ? "过热" : mid ? "偏热" : "冷静",
    mode: high ? "偏热区" : mid ? "观察区" : "安全区",
    level: high ? "高风险" : mid ? "中风险" : "低风险",
    title: `${symbol} ${high ? "不建议追涨" : mid ? "谨慎观察" : "暂时不拥挤"}`,
    advice: high ? "现在追多容易买在拥挤区，先等市场降温。" : mid ? "可以继续看，但不要用高杠杆追进去。" : "当前追涨风险不高，但仍要等明确入场位。",
    fundingRate: formatPercent(funding),
    fundingText: high ? "偏高，说明追多情绪较强。" : mid ? "略高，市场有追多倾向。" : "正常，没有明显追多拥挤。",
    oiChange: Number.isFinite(oiChange) ? `${oiChange >= 0 ? "+" : ""}${oiChange.toFixed(2)}%` : "暂无",
    oiText: Number.isFinite(oiChange) && oiChange > 4 ? "持仓快速增加，杠杆正在堆积。" : "持仓变化不极端，杠杆压力暂时可控。",
    liquidationRisk: high ? "强" : mid ? "中" : "弱",
    liquidationText: high ? "下方清算区较近，回落时容易连锁触发。" : "清算压力暂时不集中。",
    price: formatUsd(price),
    oiValue: formatUsd(oiValue),
    oneLine: `${symbol} 当前追涨风险 ${score}/100，${high ? "不要因为上涨就急着追。" : mid ? "可以观察，但新手不要急着加杠杆。" : "市场相对冷静，适合继续观察。"}`,
    reasons: [
      `实时价格：${formatUsd(price)}，数据来自 CoinAnk 实时价格接口。`,
      `资金费率：${formatPercent(funding)}，${high ? "追多成本已经偏高。" : "暂未出现极端追多成本。"}`,
      `持仓量变化：${Number.isFinite(oiChange) ? `${oiChange.toFixed(2)}%` : "暂无"}，${Number.isFinite(oiChange) && oiChange > 4 ? "杠杆资金正在进场。" : "暂未看到明显杠杆堆积。"}`
    ],
    heatBars: Array.from({ length: 10 }, (_, index) => Math.max(18, Math.min(94, score - 30 + index * 5))),
    updatedAt: new Date().toISOString(),
    source: "Live CoinAnk API via OKX Onchain OS",
  };
}

async function market(symbol) {
  const pair = symbolMap[symbol] || symbolMap.BTC;
  const endTime = Date.now();
  const calls = [
    ["price", `/api/instruments/getLastPrice?symbol=${pair}&exchange=Binance&productType=SWAP`],
    ["funding", "/api/fundingRate/current?type=current"],
    ["openInterest", `/api/openInterest/symbol/Chart?symbol=${pair}&exchange=Binance&interval=1h&endTime=${endTime}&size=4`],
  ];
  const results = await Promise.all(calls.map(([name, path]) => coinank("GET", path).then((result) => ({ name, path, result }))));
  const failed = results.find(({ result }) => result.status >= 400);
  if (failed) {
    console.error("CoinAnk upstream error", {
      name: failed.name,
      path: failed.path,
      status: failed.result.status,
      body: failed.result.body,
    });
    throw new Error(`${failed.name} 接口失败：HTTP ${failed.result.status} ${JSON.stringify(failed.result.body)}`);
  }

  const price = results.find((item) => item.name === "price").result;
  const funding = results.find((item) => item.name === "funding").result;
  const oi = results.find((item) => item.name === "openInterest").result;
  return makeView(symbol, price.body, funding.body, oi.body);
}

async function pushAlert(symbol) {
  const payload = {
    title: `${symbol} 追涨风险提醒`,
    body: `${symbol} 当前追涨风险偏高，建议先等待市场降温。`,
    sound: "default",
  };
  const result = await coinank("POST", "/api/webhook/push", payload);
  return result.body;
}

function serveFile(req, res) {
  const requested = new URL(req.url, `http://localhost:${PORT}`).pathname;
  const safePath = normalize(requested === "/" ? "/index.html" : requested).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, safePath);
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const type = mime[extname(file)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if ((url.pathname === "/api/market" || url.pathname === "/api/push") && !isAuthorized(url)) {
      json(res, 401, { error: "演示链接缺少访问 key" });
      return;
    }
    if (url.pathname === "/api/market") {
      const symbol = String(url.searchParams.get("symbol") || "BTC").toUpperCase();
      json(res, 200, await market(symbol));
      return;
    }
    if (url.pathname === "/api/push" && req.method === "POST") {
      const symbol = String(url.searchParams.get("symbol") || "BTC").toUpperCase();
      json(res, 200, await pushAlert(symbol));
      return;
    }
    serveFile(req, res);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`CoinAnk risk demo running at http://localhost:${PORT}`);
});
