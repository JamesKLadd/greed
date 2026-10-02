/**
 * One challenge move owns the board until its reply and presentation finish.
 * Holds must share this guard with rolls: an older hold reply otherwise puts
 * yesterday's locks back on the dice after a newer roll has landed.
 */
export class ChallengeMoveGuard {
  private active = true;
  private sequence = 0;
  private pending: number | null = null;

  activate(): void {
    this.active = true;
  }

  begin(): number | null {
    if (!this.active || this.pending !== null) return null;
    this.pending = ++this.sequence;
    return this.pending;
  }

  current(token: number): boolean {
    return this.active && token === this.pending;
  }

  finish(token: number): boolean {
    if (!this.current(token)) return false;
    this.pending = null;
    return true;
  }

  dispose(): void {
    this.active = false;
    this.pending = null;
  }
}
