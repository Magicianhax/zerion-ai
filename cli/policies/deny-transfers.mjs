#!/usr/bin/env node
/**
 * Executable policy: deny raw native transfers on EVM and Solana.
 *
 * EVM: a raw transfer is value > 0 with empty calldata — never needed for swaps.
 * Solana: the dispatcher tags every action with operation ("transfer" | "swap" |
 *   "approve"). Block transfers, allow everything else. Calldata-shape
 *   heuristics don't apply to Solana since transactions are base64-encoded
 *   VersionedTransactions, not {to, value, data} tuples.
 */

import { fileURLToPath } from "node:url";
import { runPolicyFromStdin } from "../utils/common/prompt.js";

export function check(ctx) {
  const tx = ctx.transaction || {};

  if (tx.chain === "solana") {
    if (tx.operation === "transfer") {
      return {
        allow: false,
        reason: "Solana native transfers are blocked by policy. Only DEX swaps allowed.",
      };
    }
    return { allow: true };
  }

  // EVM
  const data = tx.data || "";
  const value = BigInt(tx.value || "0");
  const isEmpty = !data || data === "0x" || data === "0x00";
  if (value > 0n && isEmpty) {
    return {
      allow: false,
      reason: "Raw native transfers are blocked by policy. Only DEX interactions allowed.",
    };
  }
  return { allow: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPolicyFromStdin(check);
}
