# Security Policy

This policy covers **this fork**, `vaultdr0p/frontend`. It is not the upstream
Stellar Disbursement Platform's policy — see [Scope](#scope) for which
findings belong where.

## Supported versions

| Version | Supported |
|---|---|
| Latest commit on `develop` | ✅ Yes — the only supported version |
| Any older commit, tag or branch | ❌ No |
| Upstream SDP releases | ❌ Not here — report upstream |

This fork publishes no releases and no container images. `develop` is the
default branch and the only one that receives fixes. There is no backporting:
a fix lands on `develop` and that is the fix.

## Status: testnet only, and not audited

The vault dashboard added by this fork has **not been audited**. It is
exercised against Stellar **testnet only**, where tokens have no monetary
value, and it is not deployed against mainnet by this project. Treat it as
unreviewed software.

Do not use it to move real funds. If you point it at anything that holds
value, you are doing so against this advice and the risk is entirely yours —
see the warranty and liability disclaimers in [LICENSE](LICENSE).

The Soroban contract it reads lives in
[`vaultdr0p/contract`](https://github.com/vaultdr0p/contract) and the API it
calls lives in [`vaultdr0p/backend`](https://github.com/vaultdr0p/backend);
both are unaudited and testnet-only on the same terms.

## Reporting a vulnerability

**Report privately. Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:

**[→ Report a vulnerability](https://github.com/vaultdr0p/frontend/security/advisories/new)**

(Also reachable from the repository's **Security** tab → **Report a
vulnerability**.) The report stays visible only to you and the maintainers
until an advisory is published.

GitHub's form is the only reporting channel this project offers. This project
publishes no email address for security reports, deliberately: the form keeps
the report, the discussion, the fix and the eventual advisory attached to the
repository, rather than in a mailbox only one person can read.

### What to include

A report is easiest to act on when it has:

- the page or component affected, and the commit you tested
- what the browser was asked to do, and what it did instead
- what an attacker gains: a signature on something the user did not agree to,
  a transaction built for the wrong network, another user's data on screen
- a failing test, or the steps and the state needed to reproduce it

A reproduction as a component test is the most useful single thing you can
send, because it goes straight into the regression suite.

**Never include secret keys, seeds, tokens or session cookies** in a report.
Testnet public addresses and transaction hashes are fine.

## Scope

| In scope | |
|---|---|
| `src/pages/Vault.tsx`, `src/components/Vault/**` | the vault UI — what it displays and what it lets an admin do |
| `src/hooks/useVaultWallet.tsx` | wallet handling: the network re-check before signing, and anything that could cause a signature the user did not intend |
| `src/apiQueries/useVault*.ts`, `src/helpers/vaultApi.ts` | how API responses are parsed and amounts converted |
| `.github/workflows/` | anything letting untrusted input run with write access to this repository |

| Out of scope | Where it belongs |
|---|---|
| Upstream SDP dashboard code this fork did not modify | [stellar/stellar-disbursement-platform-frontend](https://github.com/stellar/stellar-disbursement-platform-frontend) — its own security policy applies. Tell us too if the fork is exploitable because of it |
| Bugs in npm dependencies, Freighter, or Stellar Wallets Kit | Report to that project. Tell us too, if this fork is exploitable because of it |
| The backend API, the indexer, or authorisation decisions | [`vaultdr0p/backend`](https://github.com/vaultdr0p/backend/security/advisories/new) — the browser is not a trust boundary and the API must not rely on it |
| The Soroban contract itself | [`vaultdr0p/contract`](https://github.com/vaultdr0p/contract/security/advisories/new) |
| Any testnet deployment's state or balances | Not a vulnerability: throwaway data holding valueless tokens |
| Missing mainnet hardening, no audit | Known and documented above, not separate findings |

This application never handles secret keys: it sends an unsigned envelope to
the wallet extension and receives a signed one back. **A report showing that
key material can reach this application, or that a signature can be obtained
for something other than what the summary displayed, is the most serious
thing you can send.**

## Response times

Maintained by volunteers, so these are deliberately conservative — they are
what can be met, not a best case:

| Stage | Target |
|---|---|
| Acknowledgement that a human has read it | **5 business days** |
| Initial assessment — in scope or not, and rough severity | **10 business days** |
| Fix or a documented decision not to fix | **30 business days** for something exploitable in scope |

If 10 business days pass with no acknowledgement, the report was probably
missed. Open a public issue containing **no details** — just that you are
waiting on a security contact — and that will be treated as a priority.

## Disclosure

Coordinated disclosure. We will agree a publication date with you, defaulting
to **the earlier of: the fix landing on `develop`, or 90 days** from the
acknowledgement. Reporters are credited in the advisory by whatever name they
ask for, or not at all if they prefer.

There is **no bug bounty** and no payment. Reports are still genuinely
welcome, and this policy exists so you know what happens to one.
