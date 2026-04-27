export type PrecomputeMetrics = {
  total: number;
  computed: number;
  failed: number;
  cached: number;
  duration: number;
  timestamp: string;
};

export async function precomputeActivePropSims(): Promise<PrecomputeMetrics> {
  const start = Date.now();

  // Precomputation temporarily disabled - database schema not yet set up
  return {
    total: 0,
    computed: 0,
    failed: 0,
    cached: 0,
    duration: Date.now() - start,
    timestamp: new Date().toISOString()
  };
}
