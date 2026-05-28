import { appFromEnv, createDailySnapshot, type WorkerEnv } from "./app";
import { runIngestion } from "./ingest";
import { D1Repository } from "./repository/d1";
import type { Repository } from "./repository/types";
import { fetchLiveSources } from "./sources/live";

type TestableWorkerEnv = WorkerEnv & {
  __repo?: Repository;
  __fetcher?: typeof fetch;
};

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return appFromEnv(env).fetch(request);
  },

  async scheduled(_event: unknown, env: TestableWorkerEnv): Promise<void> {
    const repo = env.__repo ?? (env.DB ? new D1Repository(env.DB) : undefined);
    if (!repo) {
      throw new Error("DB binding is required");
    }
    const now = new Date().toISOString();
    const liveResult = await fetchLiveSources({
      now,
      env,
      fetcher: env.__fetcher
    });
    await runIngestion({
      repo,
      now,
      sources: liveResult.sources
    });
    await repo.saveSourceRuns(liveResult.runs);
    await repo.saveSnapshot(await createDailySnapshot(repo, now));
  }
};
