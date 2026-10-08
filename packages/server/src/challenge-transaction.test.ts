import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery, connect } = vi.hoisted(() => ({ poolQuery: vi.fn(), connect: vi.fn() }));
vi.mock("pg", () => ({
  default: {
    Pool: class {
      query = poolQuery;
      connect = connect;
    },
  },
}));

const { query, withChallengeTransaction } = await import("./db.js");

function connection() {
  return {
    query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] })),
    release: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://unused/challenge_unit_test");
});

describe("atomic challenge storage", () => {
  it("locks the account before work and routes every nested query through that connection", async () => {
    const client = connection();
    connect.mockResolvedValueOnce(client);
    const result = await withChallengeTransaction("player-a", async () => {
      expect(client.query.mock.calls[0][0]).toBe("BEGIN");
      expect(client.query.mock.calls[1]).toEqual([
        "SELECT pg_advisory_xact_lock(1735549285, hashtext($1))",
        ["player-a"],
      ]);
      await query("SELECT first");
      await query("SELECT second", [7]);
      return 42;
    });
    expect(result).toBe(42);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(1735549285, hashtext($1))",
      "SELECT first",
      "SELECT second",
      "COMMIT",
    ]);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
    await query("SELECT outside");
    expect(poolQuery).toHaveBeenCalledWith("SELECT outside", []);
  });

  it("rolls back failed work, preserving the original failure", async () => {
    const client = connection();
    connect.mockResolvedValueOnce(client);
    const failure = new Error("score write failed");
    await expect(
      withChallengeTransaction("player-a", async () => {
        await query("INSERT attempt");
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("discards a broken connection if rollback also fails", async () => {
    const client = connection();
    client.query.mockImplementation(async (sql) => {
      if (sql === "ROLLBACK") throw new Error("connection lost");
      return { rows: [] };
    });
    connect.mockResolvedValueOnce(client);
    const failure = new Error("initial failure");
    await expect(
      withChallengeTransaction("player-a", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it("keeps concurrently active accounts on their own connections", async () => {
    const a = connection();
    const b = connection();
    connect.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    let resumeA!: () => void;
    let startedA!: () => void;
    const waiting = new Promise<void>((resolve) => (resumeA = resolve));
    const started = new Promise<void>((resolve) => (startedA = resolve));
    const first = withChallengeTransaction("player-a", async () => {
      startedA();
      await waiting;
      await query("SELECT a");
    });
    await started;
    await withChallengeTransaction("player-b", async () => {
      await query("SELECT b");
      resumeA();
    });
    await first;
    expect(a.query).toHaveBeenCalledWith("SELECT a", []);
    expect(a.query).not.toHaveBeenCalledWith("SELECT b", []);
    expect(b.query).toHaveBeenCalledWith("SELECT b", []);
    expect(b.query).not.toHaveBeenCalledWith("SELECT a", []);
  });
});
