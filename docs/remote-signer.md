# Remote Signer Integration Guide

This guide is for teams integrating their own remote signer with `wooo`.

Use this document when you need to decide:

- whether to expose your remote signer over a command transport or a local service transport
- how to connect it to `wooo`
- what security properties the integration must preserve
- what users can expect when humans and AI both drive the CLI

For the exact wire contract, see
[Remote Signer Protocol v1](./remote-signer-v1.md).

## What `wooo` Assumes

`wooo` is the planner and execution router. The signer is the trust boundary.

That means:

- `wooo` may build a request such as "swap USDC to ETH on Uniswap"
- the signer decides whether the request is allowed
- the signer signs or broadcasts locally
- `wooo` only receives a tx hash or a protocol-specific signature

This keeps the core safety property intact:

- AI can use the CLI
- AI does not need the private key
- signer-side policy can still deny or require human approval

## Which Integration Shape To Use

Choose `command transport` if:

- your wallet already has a local executable
- your wallet relies on an existing hardware-wallet or desktop-wallet flow
- you want the simplest possible transport with no HTTP server

Choose `service transport` if:

- your wallet system is already a local daemon, desktop app, agent, or bridge process
- you need to serve multiple wallets from one local process
- your signing stack is easier to expose over HTTP than as a CLI subprocess

## Fastest Path To A Working Integration

### Option A: Command Transport

1. Implement a local executable that accepts:
   `--request-file <path> --response-file <path>`
2. Read the request JSON.
3. Enforce local approval or policy.
4. Sign or broadcast locally.
5. Write the response JSON.
6. Exit `0` on success, non-zero on rejection or failure.

Connect it:

```bash
wooo wallet connect signer-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["/usr/local/bin/my-signer","--profile","main"]'
```

### Option B: Service Transport

1. Bind a local HTTP service to loopback.
2. Implement `GET /` to return signer metadata.
3. Implement `POST /` to accept the shared signer request JSON.
4. Enforce local approval or policy.
5. Return the shared signer response JSON.

Inspect and connect it:

```bash
wooo wallet discover --url http://127.0.0.1:8787/ --json

wooo wallet connect signer-service \
  --url http://127.0.0.1:8787/
```

If the service advertises multiple wallets, the user should connect one explicitly:

```bash
wooo wallet connect signer-service \
  --url http://127.0.0.1:8787/ \
  --address 0xabc123...
```

## User Experience After Integration

Once the wallet is connected, humans can use it directly through the CLI:

```bash
wooo wallet switch signer-service
wooo swap ETH USDC 1 --chain ethereum --yes
wooo dex uniswap swap ETH USDC 1 --chain ethereum --yes
wooo prediction polymarket markets list --limit 5
wooo dex jupiter swap SOL USDC 10 --yes
```

That is true whether the command is launched by:

- a human at the terminal
- an automation script
- an AI agent operating the CLI

The important boundary is unchanged:

- `wooo` can trigger a signer request
- the signer still decides whether the request is approved

## Security Checklist

A remote signer integration is aligned with the intended model when all of the following are true:

1. `wooo` never receives raw private keys, seed phrases, or wallet backups.
2. The signer enforces its own allowlist, rate limits, policy, or human approval locally.
3. Service signers only bind to loopback and are not exposed as remote internet endpoints.
4. Command signers do not rely on inheriting the parent shell environment.
5. Rejections are fail-closed. If the request is malformed or unsupported, the signer returns an error instead of guessing.
6. Audit logs are kept on the signer side, not only in the planner.

## What The User Sees

For users, the flow should be self-explanatory:

1. discover or register the wallet
2. switch to it
3. run the normal `wooo` command they already use
4. approve or reject inside the trusted signer environment

In other words, users should not need separate protocol commands for "remote signer mode".

## Reference Implementations

This repo includes two reference implementations:

- remote signer over command transport:
  [src/examples/command-signer.ts](../src/examples/command-signer.ts)
- remote signer over service transport:
  [src/examples/signer-service.ts](../src/examples/signer-service.ts)

They are useful as:

- local development tools
- integration templates
- concrete examples of signer-side confirmation, policy, and audit behavior

## Current Capability Boundary

Current `wooo` transport support is:

| Capability | Local wallet | Remote signer (command) | Remote signer (service) |
|------|------|------|------|
| EVM typed-data signing for Polymarket CLOB auth and orders | yes | yes | yes |
| EVM writes | yes | yes | yes |
| Solana writes | yes | yes | yes |
| Hyperliquid L1 action signing | yes | yes | yes |

## Recommended Reading Order For Integrators

1. Read [Remote Signer Protocol v1](./remote-signer-v1.md).
2. Review the reference implementation closest to your integration shape.
3. Validate your signer with `wooo wallet discover` or `wooo wallet connect`.
4. Run a small real transaction on a safe environment before broad rollout.
