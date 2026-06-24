# Contributing to Nodal AI

Thank you for your interest in contributing to Nodal AI! This document outlines our contribution workflow and guidelines.

---

## Stellar Wave Sprint Workflow

We are actively participating in the **Stellar Wave** program! Here's how you can earn Drips points for your contributions:

1. **Find an Issue**: Browse the [Issues](https://github.com/Nodal-stellar/Nodal-AI/issues) tab for tickets tagged `good first issue` (ideal for new contributors) or `help wanted`.
2. **Claim the Issue**: Comment on the issue to let maintainers know you're working on it.
3. **Submit a PR**: Follow the guidelines below and reference the issue in your PR.
4. **Earn Drips Points**: Once your PR is merged, you'll be eligible for Drips points!

---

## Branch Naming

Please use these prefixes for your branches:
- `feat/<description>`: New features
- `fix/<description>`: Bug fixes
- `docs/<description>`: Documentation updates
- `test/<description>`: Test additions or improvements
- `refactor/<description>`: Code refactoring

Example:
```bash
git checkout -b feat/33-add-dev-env-validation
```

---

## Commit Message Format

We follow the **Conventional Commits** specification. Your commit messages should be structured like this:

```
<type>(<scope>): <description>
```

Examples:
- `feat(#33): Add environment validation to dev.sh`
- `fix: Handle RPC timeouts gracefully`
- `docs: Update CONTRIBUTING.md with branch naming rules`
- `test: Add coverage for x402 payment tool`

---

## Pull Request Checklist

Before submitting your PR, make sure:
- ✅ All tests pass (`npm run test` and `cargo test --manifest-path contracts/escrow/Cargo.toml`)
- ✅ TypeScript compiles cleanly (`tsc --noEmit`)
- ✅ Linting passes (`npm run lint`)
- ✅ No secrets or private keys are in the diff
- ✅ You've referenced the issue number in your PR description

---

## Development Workflow

1. **Check Issues**: Browse the [Issues](https://github.com/Nodal-stellar/Nodal-AI/issues) tab for tickets tagged `good first issue` or `help wanted`.

2. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/<issue-number>-<description>
   # Example: git checkout -b feat/30-github-actions-ci
   ```

3. **Make Your Changes**:
   - Follow the project structure in `README.md`
   - Ensure all tests pass: `npm run test`
   - Run the linter: `npm run lint`
   - For TypeScript changes, compile: `npm run build`
   - For Rust changes, test: `cargo test --manifest-path contracts/escrow/Cargo.toml`

4. **Commit with Clear Messages**:
   ```bash
   git commit -m "feat(#30): Add GitHub Actions CI workflow"
   ```

5. **Push and Open a Pull Request**:
   ```bash
   git push origin feat/<issue-number>-<description>
   ```

---

## Automated Checks

All pull requests are automatically validated by GitHub Actions. The CI workflow (`.github/workflows/ci.yml`) runs:

- **Build**: Compiles TypeScript with `npm run build`
- **Lint**: Enforces code style with `npm run lint`
- **Test**: Runs integration tests with `npm run test`
- **Test Rust**: Validates Soroban contracts with `cargo test`
- **Audit**: Checks for vulnerabilities in npm and Cargo dependencies

All jobs **must pass** before your PR can be merged.

---

## Branch Protection Rules

Repository maintainers should enable the following branch protection rules on `main`:

1. **Require status checks to pass before merging**:
   - ✅ Build (TypeScript)
   - ✅ Lint
   - ✅ Test (TypeScript)
   - ✅ Test Rust Contracts
   - ✅ Audit

2. **Dismiss stale pull request approvals when new commits are pushed**

3. **Require a pull request review before merging** (recommended: 1 approval minimum)

**To configure**:
1. Go to **Settings** → **Branches** → **Branch protection rules**
2. Create a rule for `main`
3. Check:
   - "Require a pull request before merging"
   - "Require status checks to pass before merging"
   - "Require branches to be up to date before merging"
4. Add the CI job names to the status checks list

---

## Code Style

- **TypeScript**: Follow ESLint rules defined in `.eslintrc.cjs`
- **Rust**: Follow standard `cargo fmt` and Clippy recommendations
- **Env Access**: Always use `backend/config.ts` for environment variables, never `process.env` directly in tool code

---

## Dependency Auditing

To check for vulnerabilities in dependencies:
- **npm dependencies**: `npm run audit`
- **Fix vulnerabilities**: `npm audit fix` (use with caution)
- **Rust dependencies**: `cargo audit` (requires `cargo-audit` to be installed)

---

## Security

- Never commit sensitive credentials (private keys, API tokens, etc.)
- All secrets must be managed via environment variables
- Refer to [backend/config.ts](./backend/config.ts) for the canonical vault of config validation

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please:
- Be respectful and considerate of others
- Use inclusive language
- Accept constructive feedback gracefully
- Focus on what is best for the community

---

## Questions?

Open an issue on GitHub with the `question` label, and a maintainer will get back to you shortly.

---

Thank you for contributing to Nodal AI! 🚀
