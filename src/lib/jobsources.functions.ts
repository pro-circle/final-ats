import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExternalJob } from "./jobsources.server";

export const searchLiveJobs = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        query: z.string().trim().max(120).default(""),
        limit: z.number().int().min(1).max(50).default(24),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ jobs: ExternalJob[] }> => {
    const { fetchLiveJobs } = await import("./jobsources.server");
    const jobs = await fetchLiveJobs({
      titles: data.query ? [data.query] : [],
      limit: data.limit,
    });
    return { jobs };
  });