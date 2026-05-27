import { appFromEnv, type WorkerEnv } from "./app";

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return appFromEnv(env).fetch(request);
  },

  async scheduled(_event: unknown, _env: WorkerEnv): Promise<void> {
    // The MVP cron entrypoint is intentionally small. The ingestion runner is pure
    // and tested separately so live source fetches can be wired without changing
    // the dashboard/API contract.
  }
};
