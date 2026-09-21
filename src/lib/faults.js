// Fault-injection seam used by the /__control endpoints and the attack script so the geo-fallback
// and side-effect-failure probes are deterministic instead of depending on real network flakiness.
export function createFaults() {
  const state = { 'ip-api': false, 'ipapi-co': false, email: false };
  return {
    isDown: (name) => state[name] === true,
    set(patch) { for (const k of Object.keys(state)) if (typeof patch[k] === 'boolean') state[k] = patch[k]; return { ...state }; },
    reset() { for (const k of Object.keys(state)) state[k] = false; return { ...state }; },
    snapshot: () => ({ ...state }),
  };
}
