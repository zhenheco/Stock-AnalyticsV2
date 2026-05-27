import { describe, expect, it } from "vitest";
import type { Candidate } from "@stock-analytics/shared";
import { D1Repository } from "../src/repository/d1";

describe("D1Repository", () => {
  it("replaces stale candidates when saving a recomputed candidate set", async () => {
    const db = new FakeD1Database();
    const repo = new D1Repository(db);

    await repo.saveCandidates([
      candidate("2330", "台積電"),
      candidate("1459", "聯發")
    ]);
    await repo.saveCandidates([
      candidate("2330", "台積電")
    ]);

    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({ symbol: "2330", name: "台積電" })
    ]);
  });
});

function candidate(symbol: string, name: string): Candidate {
  return {
    symbol,
    name,
    score: 5,
    eventCount: 1,
    sourceCount: 1,
    latestTitle: `${name} event`,
    latestAt: "2026-05-27T00:00:00.000Z",
    sources: ["ptt"],
    tags: ["討論熱度"],
    reason: "ptt 事件訊號命中"
  };
}

class FakeD1Database {
  readonly candidates = new Map<string, Record<string, unknown>>();

  prepare(query: string): FakeD1PreparedStatement {
    return new FakeD1PreparedStatement(this, query);
  }

  async batch<T = unknown>(statements: FakeD1PreparedStatement[]): Promise<T[]> {
    const results: T[] = [];
    for (const statement of statements) {
      results.push(await statement.run() as T);
    }
    return results;
  }
}

class FakeD1PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly db: FakeD1Database, private readonly query: string) {}

  bind(...values: unknown[]): FakeD1PreparedStatement {
    this.values = values;
    return this;
  }

  async all<T = unknown>(): Promise<{ results?: T[] }> {
    if (this.query.includes("FROM candidates")) {
      return {
        results: [...this.db.candidates.values()]
          .sort((left, right) => Number(right.score) - Number(left.score))
          .map((row) => row as T)
      };
    }
    return { results: [] };
  }

  async run(): Promise<unknown> {
    if (this.query.includes("DELETE FROM candidates")) {
      this.db.candidates.clear();
      return {};
    }
    if (this.query.includes("INSERT OR REPLACE INTO candidates")) {
      const [
        symbol,
        name,
        score,
        eventCount,
        sourceCount,
        latestTitle,
        latestAt,
        sourcesJson,
        tagsJson,
        reason
      ] = this.values;
      this.db.candidates.set(String(symbol), {
        symbol,
        name,
        score,
        event_count: eventCount,
        source_count: sourceCount,
        latest_title: latestTitle,
        latest_at: latestAt,
        sources_json: sourcesJson,
        tags_json: tagsJson,
        reason
      });
    }
    return {};
  }
}
