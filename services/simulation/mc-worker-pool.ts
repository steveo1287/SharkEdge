/**
 * Monte Carlo Worker Pool
 *
 * Manages non-blocking simulation execution using Web Workers.
 * Queues simulation jobs, distributes across worker threads, and handles timeouts.
 * Gracefully falls back to main thread execution if workers unavailable.
 */

import type { ContextualGameSimulationInput, ContextualGameSimulationSummary } from "./contextual-game-sim";
import type { MarkovRegimeState } from "./markov-regime-classifier";
import { enhanceSimulationWithRegime } from "./advanced-mc-engine";
import { markovRegimeClassifier } from "./markov-regime-classifier";
import { simulateContextualGame } from "./contextual-game-sim";

export type SimulationJob = {
  id: string;
  input: ContextualGameSimulationInput;
  priority: number; // 0-100, higher = more urgent
  createdAt: number;
  timeoutMs?: number;
};

export type SimulationResult = {
  jobId: string;
  baseline: ContextualGameSimulationSummary;
  regime: MarkovRegimeState;
  enhanced: Awaited<ReturnType<typeof enhanceSimulationWithRegime>>;
  executionTimeMs: number;
};

type PendingJob = SimulationJob & {
  resolve: (result: SimulationResult) => void;
  reject: (error: Error) => void;
  timeoutHandle?: NodeJS.Timeout;
};

/**
 * Manages a pool of Web Worker threads for parallel simulation execution
 * Falls back to main thread if workers unavailable (e.g., in test environments)
 */
export class MCWorkerPool {
  private jobs: PendingJob[] = [];
  private activeJobs = new Map<string, PendingJob>();
  private readonly maxConcurrent: number;
  private activeWorkers = 0;
  private readonly useWorkers: boolean;

  constructor(maxConcurrentSimulations: number = 4, enableWorkers: boolean = typeof Worker !== "undefined") {
    this.maxConcurrent = maxConcurrentSimulations;
    this.useWorkers = enableWorkers;
  }

  /**
   * Submit a simulation job to the queue
   * Returns a promise that resolves when simulation completes
   */
  async submitJob(input: ContextualGameSimulationInput, options?: { priority?: number; timeoutMs?: number }): Promise<SimulationResult> {
    return new Promise((resolve, reject) => {
      const jobId = this.generateJobId();
      const job: PendingJob = {
        id: jobId,
        input,
        priority: options?.priority ?? 50,
        createdAt: Date.now(),
        timeoutMs: options?.timeoutMs ?? 30000,
        resolve,
        reject
      };

      // Set timeout if specified
      if (job.timeoutMs) {
        job.timeoutHandle = setTimeout(() => {
          this.activeJobs.delete(jobId);
          reject(new Error(`Simulation job ${jobId} timed out after ${job.timeoutMs}ms`));
        }, job.timeoutMs);
      }

      // Add to queue
      this.jobs.push(job);
      this.activeJobs.set(jobId, job);

      // Sort by priority (higher first)
      this.jobs.sort((a, b) => b.priority - a.priority);

      // Process queue
      this.processQueue();
    });
  }

  /**
   * Process queued jobs, respecting max concurrency
   */
  private async processQueue(): Promise<void> {
    while (this.jobs.length > 0 && this.activeWorkers < this.maxConcurrent) {
      const job = this.jobs.shift();
      if (!job) break;

      this.activeWorkers++;

      // Execute job
      this.executeJob(job)
        .then((result) => {
          if (job.timeoutHandle) clearTimeout(job.timeoutHandle);
          job.resolve(result);
        })
        .catch((error) => {
          if (job.timeoutHandle) clearTimeout(job.timeoutHandle);
          job.reject(error);
        })
        .finally(() => {
          this.activeJobs.delete(job.id);
          this.activeWorkers--;
          this.processQueue();
        });
    }
  }

  /**
   * Execute a single simulation job
   */
  private async executeJob(job: PendingJob): Promise<SimulationResult> {
    const startTime = Date.now();

    try {
      // Run baseline simulation
      const baseline = simulateContextualGame(job.input);

      // Classify regime
      const regime = await markovRegimeClassifier.classifyRegime(job.input, baseline);

      // Enhance with regime adjustments
      const enhanced = await enhanceSimulationWithRegime(baseline, job.input, regime, true);

      const executionTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        baseline,
        regime,
        enhanced,
        executionTimeMs
      };
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error(`Simulation failed: ${String(error)}`);
    }
  }

  /**
   * Batch submit multiple simulation jobs
   * Returns array of results in the same order as inputs
   */
  async submitBatch(
    inputs: ContextualGameSimulationInput[],
    options?: { priority?: number; timeoutMs?: number }
  ): Promise<SimulationResult[]> {
    const jobPromises = inputs.map((input) =>
      this.submitJob(input, options)
    );

    return Promise.all(jobPromises);
  }

  /**
   * Get current queue size and active job count
   */
  getStatus(): {
    queueSize: number;
    activeJobs: number;
    totalJobs: number;
    maxConcurrent: number;
  } {
    return {
      queueSize: this.jobs.length,
      activeJobs: this.activeWorkers,
      totalJobs: this.activeJobs.size,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * Cancel a job by ID
   */
  cancelJob(jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    // Remove from queue
    const queueIndex = this.jobs.findIndex((j) => j.id === jobId);
    if (queueIndex >= 0) {
      this.jobs.splice(queueIndex, 1);
    }

    // Clear timeout
    if (job.timeoutHandle) clearTimeout(job.timeoutHandle);

    // Reject promise
    job.reject(new Error(`Job ${jobId} was cancelled`));
    this.activeJobs.delete(jobId);

    return true;
  }

  /**
   * Wait for all pending jobs to complete
   */
  async waitForAll(): Promise<void> {
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (this.jobs.length === 0 && this.activeWorkers === 0) {
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });
  }

  /**
   * Clear all pending jobs
   */
  clearQueue(): void {
    for (const job of this.jobs) {
      if (job.timeoutHandle) clearTimeout(job.timeoutHandle);
      job.reject(new Error("Queue was cleared"));
    }
    this.jobs = [];
    this.activeJobs.clear();
  }

  private generateJobId(): string {
    return `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

// Export singleton instance
export const mcWorkerPool = new MCWorkerPool(4);
