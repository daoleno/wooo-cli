# Release

This document is for maintainers. End users should not need it.

## First Publish Bootstrap

`wooo-cli` uses npm trusted publishing from GitHub Actions for normal releases,
but npm requires the package to exist before you can bind a trusted publisher.
That means the very first release is a one-time bootstrap:

```bash
# 1. Verify the release locally
bun run release:verify

# 2. Log in to npm with an owner account
npm login

# 3. Publish the initial package version manually
npm publish --access public
```

After the initial package exists on npm:

1. Configure npm trusted publishing for `.github/workflows/publish.yml`.
2. Push the matching semver tag, for example `v0.1.0`.

The publish workflow checks whether `package.json`'s version already exists on
npm and skips the publish step when it does, so pushing the bootstrap tag will
not fail with a duplicate-version publish attempt.

## Subsequent Releases

After trusted publishing is configured, normal releases are tag-driven:

```bash
# 1. Bump package.json and create the matching git tag
npm version patch

# 2. Push the branch and semver tag
git push origin main --follow-tags
```

`.github/workflows/publish.yml` verifies that the git tag matches
`package.json`, reruns release verification, runs the Anvil fork E2E suite, and
then publishes to npm through GitHub Actions OIDC.
