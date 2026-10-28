/**
 * Fixed-window counter used for per-connection abuse limits.
 *
 * Small windows and small caps are intentional: a 12-person LAN room never
 * needs high message rates, and dropped excess traffic is safer than buffering.
 */
export class SlidingWindowRateLimiter {
  private hits: number[] = [];

  constructor(
    private readonly windowMs: number,
    private readonly maxHits: number,
  ) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error('windowMs must be a positive number');
    }
    if (!Number.isInteger(maxHits) || maxHits <= 0) {
      throw new Error('maxHits must be a positive integer');
    }
  }

  allow(now: number): boolean {
    const cutoff = now - this.windowMs;
    while (this.hits.length > 0 && this.hits[0] <= cutoff) {
      this.hits.shift();
    }
    if (this.hits.length >= this.maxHits) {
      return false;
    }
    this.hits.push(now);
    return true;
  }

  reset(): void {
    this.hits = [];
  }
}
