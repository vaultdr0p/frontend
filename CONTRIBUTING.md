# Contributing

Thanks for considering a contribution. This is a small project, so this
document is short and specific: it tells you what the gates are, how to run
them locally, and the handful of rules that are not negotiable.

> **Issues here are for this fork.** This repository adds a disbursement vault
> dashboard to the Stellar Disbursement Platform frontend. Problems in the
> upstream dashboard belong to
> [stellar/stellar-disbursement-platform-frontend](https://github.com/stellar/stellar-disbursement-platform-frontend),
> not here. Do not open pull requests or issues against `stellar/*` on this
> project's behalf. If you are unsure which side a problem falls on, open an
> issue here and say so — being wrong about that is not a problem.

## Before you write code: get the issue assigned

Comment on the issue and wait for it to be assigned to you before starting.
This is not bureaucracy: it is a one-person project, and two people silently
working the same issue means one of them wasted their evening.

If no issue exists, open one first for anything beyond a typo. A pull request
that arrives with no prior issue and no explanation of the problem it solves
is likely to be closed with a request to open one.

### Questions

Ask in a comment on the issue you want to work on. GitHub Discussions is not
enabled on this repository, so there is nowhere else to ask — an issue comment
is the right place, not a direct message.

## Where pull requests go

**Pull requests go to `develop`.** It is the default branch and the only one
that receives changes. Do not open a pull request against `main`.

Merges are **squash only**. Merge commits and rebase merges are disabled on
this repository, so your branch becomes exactly one commit on `develop`. Write
the pull request title and description as if they were that commit message,
because they become it.

## Toolchain

| Tool | Version |
|---|---|
| Node | **>= 22** (`package.json` `engines`; CI pins 22) |
| Yarn | 1.x (`yarn.lock` is committed; do not switch package managers) |

Node 20 will fail at `yarn install` with `The engine "node" is incompatible`.
That is the version check doing its job, not a broken lockfile.

```sh
yarn install
```

## The gates

Four checks are **required** on every pull request and must pass before it can
merge. Run them locally first — they are the same commands CI runs:

| Gate | Command | What it does |
|---|---|---|
| `typecheck` | `yarn typecheck` | `tsc --noEmit`. Strict mode. No `any`. |
| `test` | `yarn test` | `vitest run` — the whole component and helper suite |
| `lint-changed` | `yarn lint` | ESLint over the files **your branch changed** |
| `build` | `yarn build` | the production Vite build |

```sh
yarn typecheck && yarn test && yarn lint && yarn build
```

Two notes on linting, so the result is not surprising:

- `yarn lint` deliberately lints only changed files, mirroring CI's
  `lint-changed` job. The repository inherited several hundred pre-existing
  `import/order` violations from upstream, and reformatting untouched upstream
  files inside a feature pull request is not an improvement.
- `yarn lint:all` runs ESLint over all of `src`. It currently fails for that
  reason. Use it when you are deliberately cleaning up, not as a gate.

A `pre-commit` hook runs Prettier, `lint-staged` and `tsc --noEmit` on staged
files. Do not bypass it with `--no-verify`.

## Tests are required

A pull request that changes behaviour must come with tests that would fail
without the change. "It works locally" is not evidence.

| Change | What is adequate |
|---|---|
| A component | A test rendering it and asserting what the user sees, via Testing Library — queried by role or label, not by class name |
| A helper or parser | Tests for the valid case **and** the malformed input case |
| Anything touching signing or the network check | A test asserting the **refusal**: that `signTransaction` is not called. See `src/hooks/useVaultWallet.test.tsx` |
| A bug fix | A test that reproduces the bug first |

Tests that assert a mock was called, without asserting what the user or caller
actually gets, do not count.

## End-to-end tests

`yarn test:e2e` runs Playwright against testnet. The test creates and funds
its own throwaway account via Friendbot at the start of the run. **It must stay
that way:** never add a stored secret key, an environment variable holding a
seed, or a fixture account to make it easier.

## Never commit secrets

No secret keys, seeds, API tokens, passwords or `.env` files — not in code,
tests, fixtures, logs, commit messages, pull request text, screenshots or
repository variables. This applies to testnet keys too: a testnet seed in a
public repository teaches the next person that committing seeds is normal.

When a test needs something key-shaped, construct an obviously invalid
placeholder in the test — for example `"S".padEnd(56, "A")` — rather than
pasting a real one. Secret scanning and push protection are enabled on this
repository and will reject a push containing a recognised credential.

If you commit a secret by accident, say so immediately in the pull request.
Rotating a leaked key is routine; discovering it months later is not.

## Branches and commits

Branch from `develop`:

```
<type>/<short-kebab-summary>
```

Use the conventional-commit types already in this repository's history:
`feat`, `fix`, `docs`, `ci`, `chore`, `refactor`, `test`.

```
feat(vault): show the claim deadline on the overview panel
fix(vault): refuse to sign when the wallet network cannot be read
docs: add a security policy
```

Write the body in the imperative mood and explain **why**, not just what. The
diff already says what changed.

## Pull requests

- Keep them focused. Unrelated changes belong in separate pull requests.
- Keep the description current as the work changes — it becomes the commit
  message.
- Include the gate output, and screenshots for anything that changes the UI.
- Never force-push a branch someone else is reviewing, and never bypass branch
  protection.

## Reporting a security problem

**Not in an issue or pull request.** See [SECURITY.md](SECURITY.md) for the
private reporting channel and what is in scope.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md)
(Contributor Covenant 2.1). Conduct concerns are reported through the same
private channel as security reports; the Code of Conduct explains why.
