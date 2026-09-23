/** Capability contract: the generated, hash-pinned inventory of everything
 * SQAI exposes. Loaded from the vendored capability contract. SQAI keeps no
 * handwritten operation lists — this file is the only authority. */

export interface CapabilitySignatureParam {
  name: string;
  type: string;
}

export interface CapabilityEntry {
  name: string;
  category:
    | "query"
    | "aggregation"
    | "scalar_math"
    | "statistical"
    | "financial"
    | "datetime"
    | "vector_matrix"
    | "transformation"
    | "simulation"
    | "unsupported_internal"
    | "non_deterministic"
    | "write";
  deterministic: boolean;
  deterministic_when_seeded?: boolean;
  seed_required?: boolean;
  read_only: boolean;
  typescript: boolean;
  python: boolean;
  ai_sdk: boolean;
  summary?: string;
  signature: {
    params: CapabilitySignatureParam[];
    returns: string;
  };
}

export interface CapabilityContract {
  schema_version: number;
  algenta_sdk_version: string;
  algenta_core_version: string;
  query_spec_version: string;
  capability_contract_hash: string;
  runtime_bundle: {
    version: string;
    platforms: Record<string, { sha256: string; url: string }>;
  };
  filter_operators?: string[];
  time_filters?: string[];
  capabilities: CapabilityEntry[];
}

export interface CapabilityMatch {
  entry: CapabilityEntry;
  score: number;
}

/** all-readonly = (read_only AND deterministic) OR
 *                 (read_only AND deterministic_when_seeded AND seed present) —
 * seed presence is checked at validation time; this predicate answers whether
 * the capability is ever eligible. */
export function isReadOnlyEligible(entry: CapabilityEntry): boolean {
  return entry.read_only && (entry.deterministic || entry.deterministic_when_seeded === true);
}

export class ContractIndex {
  readonly contract: CapabilityContract;
  private readonly byName: Map<string, CapabilityEntry>;

  constructor(contract: CapabilityContract) {
    this.contract = contract;
    this.byName = new Map(contract.capabilities.map(entry => [entry.name, entry]));
  }

  get(name: string): CapabilityEntry | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Nearest capability names by token-normalized edit affinity — used for
   * unsupported_operation remediation. */
  nearest(name: string, limit = 3): string[] {
    const needle = name.toLowerCase();
    const scored = this.contract.capabilities
      .filter(entry => isReadOnlyEligible(entry) && entry.ai_sdk)
      .map(entry => ({ name: entry.name, score: affinity(needle, entry.name.toLowerCase()) }))
      .sort((left, right) => right.score - left.score);
    return scored.slice(0, limit).map(item => item.name);
  }

  search(query: string, limit = 10): CapabilityMatch[] {
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (tokens.length === 0) {
      return [];
    }
    return this.contract.capabilities
      .filter(entry => isReadOnlyEligible(entry) && entry.ai_sdk)
      .map(entry => {
        const haystack = `${entry.name} ${entry.category} ${entry.summary ?? ""}`.toLowerCase();
        const score = tokens.reduce(
          (total, token) => total + (haystack.includes(token) ? 1 : 0),
          0,
        );
        return { entry, score };
      })
      .filter(match => match.score > 0)
      .sort(
        (left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name),
      )
      .slice(0, limit);
  }
}

function affinity(needle: string, candidate: string): number {
  if (candidate === needle) {
    return 1;
  }
  if (candidate.includes(needle) || needle.includes(candidate)) {
    return 0.8;
  }
  const needleTokens = new Set(needle.split(/[^a-z0-9]+/).filter(Boolean));
  const candidateTokens = candidate.split(/[^a-z0-9]+/).filter(Boolean);
  if (needleTokens.size === 0 || candidateTokens.length === 0) {
    return 0;
  }
  const overlap = candidateTokens.filter(token => needleTokens.has(token)).length;
  return overlap / Math.max(needleTokens.size, candidateTokens.length);
}
