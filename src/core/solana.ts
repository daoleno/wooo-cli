import {
  Connection,
  Keypair,
  type PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import bs58 from "bs58";

const RPC_URLS: Record<string, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

export function getSolanaConnection(
  network = "mainnet-beta",
): Connection {
  const url = RPC_URLS[network] || clusterApiUrl(network as any);
  return new Connection(url, "confirmed");
}

export function getSolanaKeypair(privateKey: string): Keypair {
  // Support both base58 and hex formats
  if (privateKey.startsWith("0x")) {
    const bytes = Buffer.from(privateKey.slice(2), "hex");
    return Keypair.fromSecretKey(bytes);
  }
  return Keypair.fromSecretKey(bs58.decode(privateKey));
}

export function getSolanaAddress(privateKey: string): PublicKey {
  return getSolanaKeypair(privateKey).publicKey;
}
