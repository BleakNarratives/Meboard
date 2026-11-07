import { parseVoicePack } from "../format";
import type { VoicePack } from "../types";
import { keyhole } from "./keyhole";

/**
 * The merge point for the family.
 *
 * Each app registers the packs it can speak — its own, and optionally the ones
 * it borrows from a sibling repo. Lookup is by id, nothing is glob-imported,
 * and an unparseable pack is refused rather than half-adopted: a voice that
 * throws mid-sentence is worse than a voice that never loads.
 */
const registry = new Map<string, VoicePack>();

export function registerVoice(pack: VoicePack): VoicePack {
  registry.set(pack.id, pack);
  return pack;
}

/** Register from raw JSON, e.g. a pack fetched from another public repo. */
export function registerVoiceJson(raw: unknown): VoicePack {
  const result = parseVoicePack(raw);
  if (!result.ok) {
    throw new Error(`voice pack rejected: ${result.errors.join("; ")}`);
  }
  return registerVoice(result.pack);
}

export function getVoice(id: string): VoicePack | undefined {
  return registry.get(id);
}

export function voiceIds(): string[] {
  return [...registry.keys()];
}

registerVoice(keyhole);
