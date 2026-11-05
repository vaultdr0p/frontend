# Stellar Disbursement Platform Frontend

## About this fork

This repository is a fork of
[stellar/stellar-disbursement-platform-frontend](https://github.com/stellar/stellar-disbursement-platform-frontend),
the Stellar Disbursement Platform dashboard built and maintained by the
[Stellar Development Foundation](https://stellar.org) and its contributors. All
credit for the dashboard itself belongs upstream; this fork exists only to add
the feature described below.

Licensing is unchanged. The project is Apache-2.0 and [`LICENSE`](LICENSE) is
upstream's file, byte for byte — no copyright notice, attribution or file
header has been altered or removed. Everything inherited from upstream is used
under the terms of that licence.

### What this fork adds

A **disbursement vault** page at `/vault`, which reads a Soroban vault contract
through the SDP backend's vault endpoints and lets an admin act on it:

| Addition | What it is |
|---|---|
| **Vault dashboard** | Balances (held, allocated, claimed, withdrawable), the claim deadline and what it currently permits, and the recipients table with each allocation's claim status |
| **Funding and cancelling** | The backend builds and simulates an unsigned envelope, the page shows that summary, and the admin signs it in Freighter through Stellar Wallets Kit |
| **Indexer transparency** | When the backend reports a gap in the vault's event history, the page states the gap bounds in plain language and says that balances remain correct because they come from the contract |

Secret keys are never handled in the browser: an unsigned envelope goes to the
wallet extension and a signed one comes back. The wallet's network is re-read
immediately before every signature and signing is refused on a mismatch.

The page is only reachable where the backend has the vault enabled — it needs
[`vaultdr0p/backend`](https://github.com/vaultdr0p/backend) running with
`ENABLE_VAULT=true`, and `VAULT_CONTRACT_ID` set in this app's runtime config.
Nothing else in the dashboard changes when it is unset.

Nothing else in this fork diverges from upstream by intent. Upstream changes
are brought in by fetching and merging rather than by rewriting history.

## Status

The vault UI added by this fork is **testnet only and has not been audited**.
It is not intended for mainnet and must not be used to move real funds.

It is not standalone: it reads the vault endpoints of
[`vaultdr0p/backend`](https://github.com/vaultdr0p/backend) and displays state
indexed from the Soroban contract in
[`vaultdr0p/contract`](https://github.com/vaultdr0p/contract). Both are
unaudited and testnet-only on the same terms.

This applies to the vault UI specifically. The rest of this repository is
upstream's Stellar Disbursement Platform dashboard; its status, support and
release process are upstream's, not this fork's. Security reports for the fork
go through [SECURITY.md](SECURITY.md); see
[CONTRIBUTING.md](CONTRIBUTING.md) to contribute.

## Introduction

The Stellar Disbursement Platform (SDP) enables organizations to disburse bulk
payments to recipients using Stellar.

This repo contains the SDP dashboard UI, which is to be used with the
[Stellar Disbursement Platform Backend](https://github.com/stellar/stellar-disbursement-platform-backend).
For more information on how to get started, see the Stellar
[dev docs](https://developers.stellar.org/docs/platforms/stellar-disbursement-platform)
and
[API reference](https://developers.stellar.org/docs/platforms/stellar-disbursement-platform/api-reference).

The SDP's comprehensive dashboard includes the following pages:

- Dashboard Home (Overview): Summary of recent disbursement activities and key
  metrics, including successful payment rate, total successful/failed/remaining
  payments, total disbursed, individuals, and wallets.
- Disbursements Page (Management): Create, draft, search, filter, and export
  disbursements. Detailed disbursement page includes names, total payments,
  successes, failures, remaining, creation date, total amount, and disbursed
  amount.
- Receivers Page (Overview): List of individuals set to receive payments, with
  wallet information and payment history. May also search, filter, and export
  receiver data in CSV.
- Payments Page (Overview): Summary of all payments, including search by payment
  ID, filters, and export options. Payment details include Payment ID, wallet
  address, disbursement name, completion time, amount, and status information.
- Wallets Page (Management): View Distribution Account information including
  public key, balance, adding funds, and more, and manage which assets you want
  to use on the Stellar network.
- Analytics Page (Overview): Provides insights into financial transactions,
  including successful payment rate, total successful/failed/remaining payments,
  total disbursed, average amount, total amount per asset, and individuals and
  wallets involved.

Feedback and contributions are welcome!

## Local HTTPS Development

HTTPS is required for testing passkey authentication with embedded wallets.

The development server supports HTTPS using
[mkcert](https://github.com/FiloSottile/mkcert) for locally-trusted
certificates.

### Setup

Install mkcert and generate certificates:

```sh
# Install mkcert (see https://web.dev/articles/how-to-use-local-https)
brew install mkcert
mkcert -install

# Generate certificates in project root (these are gitignored)
mkdir -p certs
mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem \
  "*.stellar.local" localhost 127.0.0.1 ::1
```

### Running with HTTPS

```sh
# HTTPS mode (required for passkeys/WebAuthn)
yarn start:https

# HTTP mode (default)
yarn start
```

Access the application at `https://localhost:3000` or
`https://[tenant].stellar.local:3000` (e.g., `https://redcorp.stellar.local:3000`).

If certificates are missing, the server falls back to HTTP with a warning.

## Environment Variables

Environment variables can be set either on a global `window._env_` object or as
`process.env` variables. All environment variables used in this repo are in
`src/constants/envVariables.ts` file, including types.

### `window`

The default location of the `window._env_` object is
`public/settings/env-config.js` (not included in the repo). The path can be
updated in `src/constants/envVariables.ts` variable `WINDOW_ENV_PATH`.

Example settings for local testing:

```javascript
window._env_ = {
  API_URL: "http://localhost:8000",
  STELLAR_EXPERT_URL: "https://stellar.expert/explorer/testnet",
  HORIZON_URL: "https://horizon-testnet.stellar.org",
  RECAPTCHA_SITE_KEY: "6Lego1wmAAAAAJNwh6RoOrsHuWnsciCTIL3NN-bn",
  SINGLE_TENANT_MODE: false,
  RPC_ENABLED: false, // Set to true to enable contract account features
};
```

### `process`

The `.env` file should be placed in the root directory of the repo. All
variables should be prefixed with `REACT_APP_`.

Set the value to true to avoid fetching the file if the Window ENV is not used.

<!-- prettier-ignore -->
> [!NOTE]
> Set `REACT_APP_DISABLE_WINDOW_ENV=true` to avoid fetching the
> `public/settings/env-config.js` file if the `window._env_` is not used.

<!-- prettier-ignore -->
> [!NOTE]
> Set `REACT_APP_DISABLE_TENANT_PREFIL_FROM_DOMAIN=true` to skip prefilling the hostname from the domain.

For example:

```
REACT_APP_DISABLE_WINDOW_ENV=true
REACT_APP_DISABLE_TENANT_PREFIL_FROM_DOMAIN=false
REACT_APP_API_URL=http://localhost:8000
REACT_APP_STELLAR_EXPERT_URL=https://stellar.expert/explorer/testnet
REACT_APP_HORIZON_URL=https://horizon-testnet.stellar.org
REACT_APP_RECAPTCHA_SITE_KEY=6Lego1wmAAAAAJNwh6RoOrsHuWnsciCTIL3NN-bn
```

## Favicon

[Favicon](https://developer.mozilla.org/en-US/docs/Glossary/Favicon) image files
are located in `/public` directory. The files are:

- `apple-touch-icon.png` - mostly used for shortcuts
- `favicon.ico` - for legacy browsers and devices
- `icon-192.png` and `icon-512.png` - fallback if SVG is not supported
- `icon.svg` - modern browser support is very good (can be adjusted to match
  operating system theme)

Having this set of favicons should cover all devices and browsers. They are set
in `/src/index.html` and `/public/manifest.json` files.

<figure>
  <img
  src="public/icon-192.png"
  alt="Stellar logo favicon">
  <figcaption>Default favicon</figcaption>
</figure>
