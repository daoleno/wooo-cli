import { type Cluster, Connection, clusterApiUrl } from "@solana/web3.js";
import { loadWoooConfigSync } from "./config";

const RPC_URLS: Record<string, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

export function getSolanaConnection(network = "mainnet-beta"): Connection {
  const config = loadWoooConfigSync();
  const url =
    config.chains?.[network]?.rpc ||
    config.chains?.solana?.rpc ||
    RPC_URLS[network] ||
    clusterApiUrl(network as Cluster);
  return new Connection(url, "confirmed");
}
