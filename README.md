# CoinAnk Chase Risk Alert

CoinAnk Chase Risk Alert is a small demo for the CoinAnk x OKX API Developer Challenge.

It helps crypto beginners understand whether the market is getting too crowded to chase a price move. The app reads CoinAnk market data through OKX Onchain OS payment-gated API access, then turns funding rate and open interest changes into a simple risk score and plain-language warning.

## What It Does

- Shows real-time BTC, ETH, and SOL chase-risk status.
- Uses CoinAnk price, funding rate, and open interest data.
- Converts professional derivatives metrics into beginner-friendly explanations.
- Sends a test risk reminder through CoinAnk WebHook App Push.
- Uses OKX Onchain OS 0-amount authorization for API access.

## Demo

Local demo:

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

If API access is protected with a demo key:

```bash
DEMO_KEY=your-demo-key npm start
```

Then open:

```text
http://localhost:4173/?key=your-demo-key
```

Success sign: the top status bar shows `Live CoinAnk API · 0 金额授权`.

## Requirements

- Node.js 18+
- OKX Onchain OS CLI installed and logged in
- A wallet account that can sign 0-amount API access requests

By default, the server uses:

```text
/Users/yuanyuan/.local/bin/onchainos
```

You can override it with:

```bash
ONCHAINOS_BIN=/path/to/onchainos npm start
```

## Project Files

- `index.html` - app layout
- `styles.css` - visual design
- `app.js` - frontend interaction and API calls
- `server.js` - local API proxy and CoinAnk/OKX Onchain OS authorization flow

## Safety Notes

- No private key is stored in this repository.
- No API token is stored in this repository.
- The demo only signs 0-amount API access requests.
- The server supports `DEMO_KEY` to reduce accidental public API usage during demos.

## Challenge Fit

This project fits the CoinAnk x OKX API Developer Challenge as a real-time dashboard and alert tool built on CoinAnk derivatives data.
