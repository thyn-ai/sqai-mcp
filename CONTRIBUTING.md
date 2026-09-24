# Contributing to SQAI

Thank you for your interest in contributing. This repository holds the
**SQAI MCP server** (`@thyn-ai/sqai-mcp` on npm) and the two library layers
beneath it — the three governed, deterministic, read-only structured-data
tools (`listSources`, `queryData`, `explainQuery`) for any MCP host. These
are the parts of the product that are open source and meant to be forked,
read, and improved by anyone.

The Algenta engine beneath SQAI (the deterministic execution substrate and
its signed runtime) is closed and lives in a separate, private repository.
Nothing in this repository grants access to it, and nothing you contribute
here can change how much execution capacity any license is entitled to —
that's enforced entirely on the engine side. See [SECURITY.md](./SECURITY.md)
for the trust boundary this implies for security reports.

## This repository is an automated mirror

Every file here is mirrored from the private `thyn-ai/sqai` repository by an
automated sync — nothing is exempt, including these community files. A pull
request that lands here is reviewed and merged normally, and a maintainer
then ports the change upstream; it flows back out here on the next sync
run. You do not need to do anything special — just open the PR here — but
please don't be surprised when the commit that "sticks" arrives via the
sync rather than your original commit.

## What you can contribute

| Area | Status | Notes |
|------|--------|-------|
| `packages/mcp/` | ✅ Open | The MCP server — tool fixes, docs, tests |
| `packages/ai-sdk/` | ✅ Open | The Vercel AI SDK tool surface |
| `packages/sdk/` | ✅ Open | The product SDK beneath the tools |
| Docs / examples | ✅ Open | Corrections, new guides |
| The execution substrate | 🔒 Closed | Not in this repository — see above |

## Getting started

```bash
git clone https://github.com/thyn-ai/sqai-mcp
cd sqai-mcp
npm install @thyn-ai/sqai-mcp   # or run it from your MCP host of choice
```

The packages are plain TypeScript; the query plane needs no server or
daemon. See [README.md](./README.md) for the quickstart and the
three-tool contract.

## Development workflow

### Branch naming
- `feat/short-description` — new feature
- `fix/short-description` — bug fix
- `docs/short-description` — documentation only

### Commit messages
We follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(mcp): add source pagination to listSources
fix(sdk): correct date-window filtering on queryData
docs(readme): document Claude Desktop setup
```

### Pull request checklist
- [ ] The change keeps the tools deterministic and read-only (no write
      path, no eval, no raw SQL — that contract is the product)
- [ ] Documentation updated if needed
- [ ] No hardcoded credentials or secrets
- [ ] I understand a maintainer will port the merged change upstream (see
      "automated mirror" above)

All required checks must pass, including on forked-repository pull
requests — CI runs with no secrets and no elevated permissions, so it's
safe to run automatically on every PR.

## Recognizing contributors

This project follows the [all-contributors](https://allcontributors.org)
specification: everyone who contributes — code, docs, bug reports, reviews,
or any other [contribution type](https://allcontributors.org/docs/en/emoji-key) —
is recognized in the [README](./README.md#contributors). Maintainers add
contributors by commenting `@all-contributors please add @user for code`
(replacing `code` with the relevant contribution type) on an issue or pull
request, and the bot opens a pull request updating the contributors table.

## Licensing

By submitting a pull request you agree that your contribution is licensed
under the project's [Apache-2.0 license](./LICENSE) (inbound=outbound,
[GitHub Terms of Service §D.6](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#6-contributions-under-repository-license)).

## Reporting issues

- **Security vulnerabilities** → see [SECURITY.md](./SECURITY.md) (do NOT
  open a public issue)
- **Bugs** → [GitHub Issues](https://github.com/thyn-ai/sqai-mcp/issues)
  with the `bug` label
- **Feature requests** → GitHub Issues with the `enhancement` label
- **Questions** → GitHub Issues with the `question` label, or
  https://discord.gg/w8NDsph9an

## Community

- Discord: https://discord.gg/w8NDsph9an
- Web: https://thyn.ai
- Email: community@algenta.ai
