# Documentation

Start with the top-level [README](../README.md) for installation, first-time
setup, common commands, credentials, wallet mode, and protocol examples.

This directory keeps deeper material that does not belong in the main product
README:

- [Remote Signer Integration Guide](./external-wallet.md): how teams expose an
  HTTP signer to `wooo-cli`.
- [Wallet Transport Protocol](./wallet-transport.md): the wire contract for
  remote signer metadata, requests, responses, and async approval.
- [Architecture](./architecture.md): protocol registry, write-command contract,
  wallet architecture, and contribution guidance.
- [Release](./release.md): npm publishing notes for maintainers.

Files under `superpowers/` are design and implementation archives, not the
primary user guide.
