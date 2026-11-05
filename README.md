# BuildAPad

Build your own Solana launchpad in a minute. Pick a name, upload a logo, choose an accent color and your cut of the creator fees. Sign once with your wallet and you get a live launchpad page at `/p/<your-name>` where anyone can launch a coin on pump.fun, and you earn from every one.

**Status:** runs on pump.fun. The launch, fee split, first buy and payout have been tested end to end on devnet. Devnet is the default; mainnet is refused in code until `MAINNET_ENABLED=yes`. Run `devnet/11-check-pump.mjs` before real money.

## How it works

1. **Build a pad (`/build`):** the owner picks a name, page address, tagline, logo (PNG or JPEG, resized in the browser), accent color, corner style, optional links, and their fee share. A live preview follows every choice. The owner's wallet signs a message (no cost) that names the page, the wallet and the share, and the server checks the signature before saving the pad.
2. **Launch a coin (`/p/<slug>`):** a visitor enters a name, ticker, optional description and a picture, then Phantom signs the transactions the server prepares: `create_v2` (with an optional first buy in the same transaction when a lookup table is set), then the three-way fee split. If a step is declined or the tab closes, pressing Launch again continues from what is on-chain.
3. **Fees, split three ways on-chain:** pump.fun's own fee sharing pays the coin's launcher, the pad owner and the platform. The platform share is fixed by the operator (`PLATFORM_SHARE_PCT`); the owner picks their share from 0 up to `50 - platform share`; the launcher keeps the rest, always at least half.
4. **Send out fees:** anyone can press Send out fees on a coin page. The money goes to the wallets in that coin's split. The operator's `/admin` page lists the platform's share and sends it out.

## Run it

```
npm install
PLATFORM_FEE_WALLET=<public address> node server.js
```

`/healthz` and the startup log name any missing setting (never its value). Without `PLATFORM_FEE_WALLET` launching and building are switched off.

| Variable | Purpose |
| --- | --- |
| `PLATFORM_FEE_WALLET` | Public address that receives the platform's share. Required. Use a fresh wallet or a Ledger. |
| `PLATFORM_SHARE_PCT` | The platform's share of creator fees, whole number 1 to 50. Suggested 10. It is written on-chain at launch and cannot change for that coin. |
| `DATA_DIR` | Where the volume is mounted (for example `/data`). **Required for pads to survive a deploy**: pads are saved in `<DATA_DIR>/padstore.json`, pad logos in `<DATA_DIR>/pad-logos`, coin pictures in `<DATA_DIR>/art`, the launch list in `<DATA_DIR>/launches.json`. Defaults to `/data` when that folder exists, otherwise memory only. |
| `LAUNCH_CLUSTER` | `devnet` (default) or `mainnet-beta`. |
| `MAINNET_ENABLED` | Must be `yes` for `mainnet-beta`. Without it the server refuses to start. |
| `LAUNCH_RPC_URL` | RPC address. Devnet defaults to the public one. Mainnet requires a dedicated paid RPC. |
| `LAUNCH_LOOKUP_TABLE` | Frozen lookup table made by `devnet/12-make-lookup-table.mjs`. With it, creating the coin and the creator's first buy are one transaction, so nobody can buy first. |
| `PRIORITY_FEE_MICROLAMPORTS` | Priority fee per compute unit. Default 50000 on mainnet, 0 on devnet. |
| `PAD` | Which `pads/<name>.json` sets the home page brand. Default `buildapad`. |
| `PUBLIC_URL` | This site's address, if it can't be worked out from the request. |
| `LAUNCHES_FILE`, `HIDE_POOLS` | Optional. Move the launch list; hide pools from public lists. |
| `ART_DIR`, `VERIFY_SECRET` | Optional. Coin picture folder; secret for website-check codes (created on the volume if unset). |
| `IMAGE_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`, `IMAGE_MODEL`, `TEXT_MODEL`, `ART_PER_IP_PER_HOUR`, `ART_DAILY_CAP` | Optional AI picture and chat settings, used only where a pad offers them. |
| `FOUNDER_WALLET` | Optional. Only this wallet can stage the founder coin. |

## Pad rules

- Names and page addresses are checked against a blocked list of well-known people and brands, and a reserved list (`build`, `admin`, `api`, ...). Pages are 3 to 30 letters, numbers or dashes.
- Creating a pad needs a wallet signature (valid for 10 minutes). Limits: 3 pads per wallet, 5 creations per connection per hour.
- Logos are checked by their first bytes (PNG or JPEG, up to 400 KB). SVG is refused.
- Colors are hex only, fonts Google Fonts only, and all text is escaped, so a pad cannot add markup or script.
- Pads cannot be edited after creation yet.

`pads/*.json` are operator brand files for the home page (`PAD`). `pads/buildapad.json` is the default; `hatchpad.json` and `robots.json` are older samples.

## Guardrails and limits

- Coin names and descriptions are cleaned and checked against a basic blocked list. It is not complete. `HIDE_POOLS` removes anything else by hand.
- The three-way split is enforced for coins launched through the site's own flow. Someone who builds their own transactions can launch without it, so coin pages and `/admin` count only coins whose split is in place (`splitOk`).
- Not built yet: selling from the page, payouts after a coin moves to PumpSwap, pad editing, a per-owner fee dashboard, IPFS storage, a security review for mainnet.

## Scripts

`devnet/` holds command-line helpers (throwaway keys, payer wallet, sweep script, `11-check-pump.mjs` which simulates the pump.fun transactions without spending anything, `12-make-lookup-table.mjs`). See `devnet/README.md`.

## How pump.fun is used

`pump.js` builds instructions straight from pump.fun's published IDL (`idl/pump.json`, `idl/pump_fees.json`): `create_v2`, `create_fee_sharing_config`, `update_fee_shares_v2`, `buy_exact_quote_in_v3`, `sell_v3`, `sweep_creator_fee` and `distribute_creator_fees_v2`. The only dependency is `@solana/web3.js`. Creator fees stay on the curve, so a payout is sweep then distribute in one transaction. Fees earned before the split is set go entirely to the launcher.

## Other pages

- `/coin/<pool>`: coin details, trading, fee status, Send out fees (and Finish setup for the creator if the split step was skipped), website verification and share/Blink links.
- `/admin`: connect the platform wallet to see and send out its share.

## Going live on mainnet

Real money. Get a legal and security review first.

1. Make a NEW platform fee wallet (fresh Phantom account, Ledger or multisig). Only its public address goes on the server.
2. Simulate: `CLUSTER=mainnet-beta MAINNET_OK=yes RPC_URL=<rpc> node 11-check-pump.mjs <wallet> <mint of a live pump.fun coin>` from `devnet/`.
3. Make the lookup table once with `12-make-lookup-table.mjs <platform fee wallet>` and use its address as `LAUNCH_LOOKUP_TABLE`.
4. On Railway set `LAUNCH_CLUSTER=mainnet-beta`, `MAINNET_ENABLED=yes`, `LAUNCH_RPC_URL`, `PLATFORM_FEE_WALLET`, `PLATFORM_SHARE_PCT`, `LAUNCH_LOOKUP_TABLE`, and keep the volume mounted.
5. Build one pad and launch one small coin first, then check `/admin`.
