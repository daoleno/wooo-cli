# External Signer Integration

`wooo` supports external wallet systems without requiring the wallet itself to be
a CLI. The trusted signer can be exposed to `wooo` in one of two local forms:

- command signer: `wooo` launches a local executable
- service signer: `wooo` talks to a local HTTP service

In both cases:

- `wooo` plans the action and builds a signer request
- the signer decides whether to authorize it
- the signer signs or broadcasts locally
- `wooo` only receives the resulting tx hash or signature

## Security Model

- Keep private keys outside `wooo`
- Enforce signer policy and human approval inside the signer, not in the planner
- Restrict signer services to local hosts such as `127.0.0.1`, `::1`, or `localhost`
- Treat `WOOO_SIGNER_*` as signer-local configuration only

## Command Signer Contract

Register:

```bash
wooo wallet connect signer-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["/usr/local/bin/my-signer","--profile","main"]'
```

Runtime contract:

1. `wooo` writes a signer request JSON file
2. `wooo` invokes the command with `--request-file <path> --response-file <path>`
3. signer writes the response JSON file and exits

## Service Signer Contract

Inspect a service before connecting:

```bash
wooo wallet discover --url http://127.0.0.1:8787/ --json
```

Connect using service metadata auto-discovery:

```bash
wooo wallet connect signer-service \
  --url http://127.0.0.1:8787/
```

If the service advertises multiple wallets, specify one:

```bash
wooo wallet connect signer-service \
  --url http://127.0.0.1:8787/ \
  --address 0xabc123...
```

Service API:

- `GET /`
  Returns signer metadata describing wallets and supported request kinds.
- `POST /`
  Accepts the same signer request JSON used by the command signer contract.
  Returns the same signer response JSON.

Example metadata payload:

```json
{
  "version": 1,
  "kind": "wooo-signer-service",
  "supportedKinds": ["evm-write-contract"],
  "wallets": [
    {
      "address": "0xabc123...",
      "chain": "evm"
    }
  ]
}
```

## Request / Response Payloads

The service and command transports share the same payload contract from
[src/core/signer-protocol.ts](/home/daoleno/workspace/wooo-cli/src/core/signer-protocol.ts).

Common request forms:

- `evm-write-contract`
- `solana-send-versioned-transaction`
- `hyperliquid-sign-l1-action`

Common response forms:

- `{ "ok": true, "txHash": "0x..." }`
- `{ "ok": true, "signature": { "r": "0x...", "s": "0x...", "v": 27 } }`
- `{ "ok": false, "error": "..." }`

## Reference Implementations

- command signer: [src/examples/command-signer.ts](/home/daoleno/workspace/wooo-cli/src/examples/command-signer.ts)
- service signer: [src/examples/signer-service.ts](/home/daoleno/workspace/wooo-cli/src/examples/signer-service.ts)

Both reference implementations reuse the same signer-side policy, confirmation,
and audit runtime.

## Current Capability Boundary

- EVM: command signer, service signer, local keystore
- Solana: command signer, service signer, local keystore
- Hyperliquid: command signer, local keystore

Hyperliquid still depends on a synchronous signing hook from the upstream SDK, so
it currently does not support the HTTP service transport.
