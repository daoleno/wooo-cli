import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  KeyRound,
  Route,
  ShieldCheck,
  Terminal,
  WalletCards,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const commands = [
  "wooo-cli market price BTC",
  "wooo-cli swap ETH USDC 1 --chain arbitrum --dry-run",
  "wooo-cli lend aave rates USDC --chain ethereum",
  "wooo-cli wallet connect ledger --signer http://127.0.0.1:8787/",
];

const capabilities = [
  {
    title: "One command surface",
    body: "CEX trading, DEX swaps, lending, staking, perps, prediction markets, payments, and on-chain reads share one CLI shape.",
    icon: Route,
  },
  {
    title: "Execution plans first",
    body: "Write flows expose dry-run plans before money moves, so agents and humans can inspect chain, route, amount, and signer behavior.",
    icon: ShieldCheck,
  },
  {
    title: "Wallets stay explicit",
    body: "Local OWS wallets and remote signer transports are configured deliberately with no silent custody fallback.",
    icon: WalletCards,
  },
  {
    title: "Agent-friendly output",
    body: "Every workflow can emit structured JSON while keeping readable tables for day-to-day terminal use.",
    icon: CheckCircle2,
  },
];

const surfaces = [
  ["Market", "price, search, OKX on-chain metrics"],
  ["Wallet", "create, import, connect, policy, key"],
  ["Swap", "aggregated EVM and Solana routing"],
  ["Lend", "Aave and Morpho market operations"],
  ["Perps", "Hyperliquid positions and funding"],
  ["Bridge", "LI.FI and OKX cross-chain quotes"],
];

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <Link className="brand-mark" href="/" aria-label="wooo home">
          wooo
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/cli">CLI</Link>
          <Link href="https://github.com/daoleno/wooo-cli">GitHub</Link>
        </nav>
      </header>

      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">crypto execution from the terminal</p>
          <h1 id="hero-title">
            All of crypto,
            <span className="hero-emphasis"> one command away.</span>
          </h1>
          <p className="hero-lede">
            wooo-cli is a terminal-native copilot for trading, DeFi, and
            on-chain execution across EVM and Solana.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" href="/docs">
              Read the docs <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="secondary-action" href="/docs/quick-start">
              Quick start
            </Link>
          </div>
        </div>

        <div
          className="terminal-panel"
          role="img"
          aria-label="CLI install preview"
        >
          <div className="terminal-chrome">
            <span className="chrome-dot" />
            <span className="chrome-dot" />
            <span className="chrome-dot" />
            <p>wooo-cli</p>
          </div>
          <div className="terminal-grid">
            <Image
              src="/images/terminal-orbit.webp"
              alt=""
              width={224}
              height={224}
              priority
            />
            <div className="terminal-copy">
              <p className="command-label">Install</p>
              <div className="install-command">
                <code>npm install -g wooo-cli</code>
                <Copy aria-hidden="true" />
              </div>
              <p>
                Start with a local wallet, run read-only market checks, then
                preview execution with dry-run commands.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="command-strip" aria-label="Example commands">
        <div>
          <p className="section-kicker">Run</p>
          <h2>Commands that read like an execution plan.</h2>
        </div>
        <div className="command-list">
          {commands.map((command) => (
            <code key={command}>{command}</code>
          ))}
        </div>
      </section>

      <section className="capabilities-section" aria-labelledby="capabilities">
        <div className="section-heading">
          <p className="section-kicker">Capabilities</p>
          <h2 id="capabilities">Built for users and agents sharing a shell.</h2>
        </div>
        <div className="capability-grid">
          {capabilities.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title}>
                <Icon aria-hidden="true" />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="surface-section" aria-labelledby="surfaces">
        <div>
          <p className="section-kicker">Surface area</p>
          <h2 id="surfaces">One CLI, multiple markets.</h2>
        </div>
        <div className="surface-list">
          {surfaces.map(([title, body]) => (
            <div key={title}>
              <span className="surface-title">{title}</span>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="docs-band" aria-labelledby="docs-title">
        <div>
          <BookOpenText aria-hidden="true" />
          <p className="section-kicker">Documentation</p>
          <h2 id="docs-title">
            Guides for installing, configuring, and moving safely.
          </h2>
        </div>
        <div className="docs-links">
          <Link href="/docs/quick-start">
            <Terminal aria-hidden="true" />
            Quick start
          </Link>
          <Link href="/docs/guides/wallets">
            <KeyRound aria-hidden="true" />
            Wallets
          </Link>
          <Link href="/docs/guides/markets">
            <CircleDollarSign aria-hidden="true" />
            Markets
          </Link>
        </div>
      </section>
    </main>
  );
}
