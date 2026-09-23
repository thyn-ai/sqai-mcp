/** Minimal fixture contract for validator tests — precise, hand-authored. */
import type { CapabilityContract } from "../contract.js";

export const FIXTURE_CONTRACT: CapabilityContract = {
  schema_version: 1,
  algenta_sdk_version: "0.0.0-test",
  algenta_core_version: "0.0.0-test",
  query_spec_version: "1",
  capability_contract_hash: "sha256:test",
  runtime_bundle: { version: "", platforms: {} },
  capabilities: [
    {
      name: "stats.median",
      category: "statistical",
      deterministic: true,
      read_only: true,
      typescript: true,
      python: true,
      ai_sdk: true,
      signature: {
        params: [
          { name: "v", type: "float64[]", required: true } as never,
          { name: "n", type: "int", required: true } as never,
        ],
        returns: "float64",
      },
    },
    {
      name: "stat_tests.pearson_r",
      category: "statistical",
      deterministic: true,
      read_only: true,
      typescript: true,
      python: true,
      ai_sdk: true,
      signature: {
        params: [
          { name: "x", type: "float64[]", required: true } as never,
          { name: "y", type: "float64[]", required: true } as never,
          { name: "n", type: "int", required: true } as never,
        ],
        returns: "float64",
      },
    },
    {
      name: "simulate.monte_carlo",
      category: "simulation",
      deterministic: false,
      deterministic_when_seeded: true,
      seed_required: true,
      read_only: true,
      typescript: true,
      python: true,
      ai_sdk: true,
      signature: {
        params: [
          { name: "config", type: "object", required: true } as never,
          { name: "seed", type: "int", required: true } as never,
        ],
        returns: "SimulationEnvelope",
      },
    },
    {
      name: "stats_bootstrap.resample",
      category: "non_deterministic",
      deterministic: false,
      read_only: true,
      typescript: false,
      python: false,
      ai_sdk: false,
      signature: { params: [], returns: "float64[]" },
    },
    {
      name: "rounding.optional_tail",
      category: "scalar_math",
      deterministic: true,
      read_only: true,
      typescript: true,
      python: true,
      ai_sdk: true,
      signature: {
        params: [
          { name: "value", type: "float64", required: true } as never,
          { name: "digits", type: "int", required: false } as never,
        ],
        returns: "float64",
      },
    },
  ],
};
