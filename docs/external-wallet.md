# External Wallet Integration Guide

This guide is for teams integrating their own external wallet system with `wooo-cli`.

Use this document when you need to decide:

- whether to expose your wallet system over a command transport, local service transport, or broker transport
- how to connect it to `wooo-cli`
- what security properties the integration must preserve
- what users can expect when humans and AI both drive the CLI

For the exact wire contract, see
[Wallet Transport Protocol v1](./wallet-transport-v1.md).

## What `wooo-cli` Assumes

`wooo-cli` is the planner and execution router. The signer is the trust boundary.

That means:

- `wooo-cli` may build a request such as "swap USDC to ETH on Uniswap"
- the signer decides whether the request is allowed
- the signer signs or broadcasts locally
- `wooo-cli` only receives a tx hash or a protocol-specific signature

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

Choose `broker transport` if:

- your wallet system already has a backend plus frontend-wallet architecture
- user approval happens in a browser wallet, embedded wallet, or app wallet outside the CLI host
- you want `wooo-cli` to talk directly to your coordination backend instead of requiring a per-project local bridge
- you can authenticate the CLI caller and correlate it to a specific user session or wallet context

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
wooo-cli wallet connect signer-main \
  --chain ethereum \
  --address 0xabc123... \
  --command '["/usr/local/bin/my-signer","--profile","main"]'
```

### Option B: Service Transport

1. Bind a local HTTP service to loopback.
2. Implement `GET /` to return signer metadata.
3. Implement `POST /` to accept the shared signer request JSON.
4. Either complete immediately or return `pending` plus a `requestId`.
5. If you return `pending`, implement `GET /requests/:requestId` so `wooo-cli` can poll for completion.
6. Enforce local approval or policy.
7. Return the shared terminal signer response JSON once the wallet flow completes.

Inspect and connect it:

```bash
wooo-cli wallet discover --url http://127.0.0.1:8787/ --json

wooo-cli wallet connect signer-service \
  --url http://127.0.0.1:8787/
```

If the service advertises multiple wallets, the user should connect one explicitly:

```bash
wooo-cli wallet connect signer-service \
  --url http://127.0.0.1:8787/ \
  --address 0xabc123...
```

### Option C: Broker Transport

1. Expose an authenticated HTTP endpoint reachable from the CLI runtime.
2. Implement `GET /` to return broker metadata for the current caller or session.
3. Implement `POST /` to accept the shared signer request JSON.
4. Either complete immediately or return `pending` plus a `requestId`.
5. If you return `pending`, implement `GET /requests/:requestId` so `wooo-cli` can poll for completion.
6. Coordinate the real wallet approval in your frontend, app, or wallet backend.
7. Return the shared terminal signer response JSON once the wallet flow completes.

Inspect and connect it:

```bash
wooo-cli wallet discover \
  --broker-url https://broker.example.com/ \
  --auth-env WOOO_BROKER_TOKEN \
  --json

wooo-cli wallet connect broker-main \
  --broker-url https://broker.example.com/ \
  --auth-env WOOO_BROKER_TOKEN
```

## User Experience After Integration

Once the wallet is connected, humans can use it directly through the CLI:

```bash
wooo-cli wallet switch signer-service
wooo-cli swap ETH USDC 1 --chain ethereum --yes
wooo-cli dex uniswap swap ETH USDC 1 --chain ethereum --yes
wooo-cli prediction polymarket markets list --limit 5
wooo-cli dex jupiter swap SOL USDC 10 --yes
```

That is true whether the command is launched by:

- a human at the terminal
- an automation script
- an AI agent operating the CLI

The important boundary is unchanged:

- `wooo-cli` can trigger a signer request
- the signer still decides whether the request is approved

For browser-wallet integrations, that usually means:

- `wooo-cli` submits the signer request to a local service or remote broker
- that transport hands the request to the trusted frontend or desktop wallet flow
- the transport returns the final `txHash` or signature to `wooo-cli`

## Security Checklist

An external wallet integration is aligned with the intended model when all of the following are true:

1. `wooo-cli` never receives raw private keys, seed phrases, or wallet backups.
2. The signer enforces its own allowlist, rate limits, policy, or human approval locally.
3. Service signers only bind to loopback and are not exposed as remote internet endpoints.
4. Broker transports use explicit auth and do not treat possession of a broker token as permission to bypass user approval.
5. Command signers do not rely on inheriting the parent shell environment.
6. Rejections are fail-closed. If the request is malformed or unsupported, the signer returns an error instead of guessing.
7. Audit logs are kept on the signer side, not only in the planner.

## What The User Sees

For users, the flow should be self-explanatory:

1. discover or register the wallet
2. switch to it
3. run the normal `wooo-cli` command they already use
4. approve or reject inside the trusted signer environment

In other words, users should not need separate protocol commands for "external wallet mode".

## Reference Implementations

This repo includes three reference implementations:

- external command signer:
  [src/examples/command-signer.ts](../src/examples/command-signer.ts)
- local signer service:
  [src/examples/signer-service.ts](../src/examples/signer-service.ts)
- wallet broker over remote HTTP transport:
  [src/examples/signer-broker.ts](../src/examples/signer-broker.ts)

They are useful as:

- local development tools
- integration templates
- concrete examples of confirmation, coordination, policy, and audit behavior

The broker example is intentionally a coordinator, not a signer. It never holds
the key. It demonstrates metadata discovery, authenticated request creation,
async `pending` polling, and out-of-band request resolution so teams can map
their existing frontend or wallet callback flow onto the `wooo-cli` contract.

## Current Capability Boundary

Current `wooo-cli` transport support is:

| Capability | Local wallet | Command signer | Local signer service | Wallet broker |
|------|------|------|------|------|
| EVM typed-data signing for Polymarket CLOB auth and orders | yes | yes | yes | yes |
| EVM writes | yes | yes | yes | yes |
| Solana writes | yes | yes | yes | yes |
| Hyperliquid L1 action signing | yes | yes | yes | yes |

## Recommended Reading Order For Integrators

1. Read [Wallet Transport Protocol v1](./wallet-transport-v1.md).
2. Review the reference implementation closest to your integration shape.
3. Validate your signer with `wooo-cli wallet discover` or `wooo-cli wallet connect`.
4. Run a small real transaction on a safe environment before broad rollout.
