#!/usr/bin/env node
/**
 * Daily transaction-count cap policy.
 *
 * Tracks how many transactions an agent token has signed in the last 24h and
 * refuses to sign more once the cap is reached. Stateful across CLI runs via
 * a JSON ledger at ~/.zerion/spend-cap-state.json (atomic write, 0600 perms).
 *
 * Configured via policy_config.daily_tx_limit (default 8).
 *
 * This complements the built-in chain-lock and allowlist policies by adding a
 * churn-rate guard at the signing layer — even if an agent loops on a bug, the
 * cap stops it from spending the wallet dry.
 *
 * Contributed by the zerion-ta-rebalancer project.
 */

import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { runPolicyFromStdin } from "../utils/common/prompt.js";

const STATE_DIR = join(homedir(), ".zerion");
const STATE_PATH = join(STATE_DIR, "spend-cap-state.json");
const WINDOW_MS = 24 * 60 * 60 * 1000;

function loadState() {
  if (!existsSync(STATE_PATH)) return { tx: [] };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { tx: [] };
  }
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const tmp = STATE_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  renameSync(tmp, STATE_PATH);
}

export function check(ctx) {
  const limit = Number(ctx.policy_config?.daily_tx_limit ?? 8);
  if (!Number.isFinite(limit) || limit <= 0) return { allow: true };

  const tokenName = ctx.token_name || ctx.policy_config?.token_name || "default";
  const now = Date.now();

  const state = loadState();
  const entries = (state.tx || []).filter((e) => now - e.t < WINDOW_MS);
  const myCount = entries.filter((e) => e.token === tokenName).length;

  if (myCount >= limit) {
    return {
      allow: false,
      reason: `Daily tx cap reached: ${myCount} of ${limit} transactions in the last 24h for token "${tokenName}". Wait for the rolling window to refresh, or raise the limit.`,
    };
  }

  entries.push({ t: now, token: tokenName });
  saveState({ ...state, tx: entries });

  return { allow: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPolicyFromStdin(check);
}
