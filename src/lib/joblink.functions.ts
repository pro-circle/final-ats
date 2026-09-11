import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ParsedJob } from "./joblink.server";

// Accept anything pasteable; the server normalizes bare hosts, wrappers, etc.
const urlInput = z.object({ url: z.string().min(3) });
// Login-walled postings (Google, LinkedIn, some Workday tenants) can be
// analysed by letting the candidate paste the description text themselves.
const evalInput = z.object({
  url: z.string().min(3),
  pastedText: z.string().max(40000).optional(),
});

export const parseJobUrl = createServerFn({ method: "POST" })
  .validator((d: unknown) => urlInput.parse(d))
  .handler(async ({ data }): Promise<ParsedJob> => {
    const { fetchJobPage, extractJob } = await import("@/lib/joblink.server");
    const { text, preview, jsonLd, embedded } = await fetchJobPage(data.url);
    return extractJob(data.url, text, preview, jsonLd, embedded);
  });

export const importJobFromUrl = createServerFn({ method: "POST" })
  .validator((d: unknown) => urlInput.parse(d))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/session.server");
    const employerId = await requireUserId();

    const { fetchJobPage, extractJob } = await import("@/lib/joblink.server");
    const { text, preview, jsonLd, embedded } = await fetchJobPage(data.url);
    const job = await extractJob(data.url, text, preview, jsonLd, embedded);

    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = getSupabaseAdmin();
    const id = `JOB-${Date.now().toString().slice(-6)}`;
    if (db) {
      await db.from("jobs").insert({
        id,
        employer_id: employerId,
        title: job.title || "Untitled role",
        department: "",
        location: job.location,
        type: job.type || "Full-time",
        status: "Draft",
        applicants: 0,
        new_count: 0,
        match_avg: 0,
        salary: job.salary,
        description: [
          job.description,
          job.requirements.length ? `\n\nRequirements:\n- ${job.requirements.join("\n- ")}` : "",
          job.preferences.length ? `\n\nNice to have:\n- ${job.preferences.join("\n- ")}` : "",
          job.companyDetails ? `\n\nAbout ${job.company}:\n${job.companyDetails}` : "",
        ].join(""),
        tags: job.tags,
      });
    }
    return { ok: true as const, id, job };
  });

export const evaluateJobUrl = createServerFn({ method: "POST" })
  .validator((d: unknown) => evalInput.parse(d))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/session.server");
    const userId = await requireUserId();

    const { fetchJobPage, extractJob, evaluateFit, looksLikeJob } = await import(
      "@/lib/joblink.server"
    );
    const { text, preview, jsonLd, embedded } = await fetchJobPage(data.url);
    const pasted = (data.pastedText ?? "").trim();
    const combined = pasted ? `${pasted}\n\n${text}`.slice(0, 24000) : text;

    // JSON-LD JobPosting or a mined posting payload is proof; otherwise fall
    // back to URL/title/body signals. Pasted text is always treated as a job.
    const isJob =
      !!jsonLd ||
      !!pasted ||
      !!(embedded && (embedded.title || embedded.description)) ||
      looksLikeJob(combined, preview.title, preview.finalUrl || data.url);

    // Even when the page is not obviously a posting, parse and score whatever
    // readable content exists — the user asked for this link on purpose.
    const readable = combined.replace(/\s+/g, " ").trim();
    if (!isJob && readable.length < 200) {
      return {
        preview,
        isJob: false as boolean,
        job: null as ParsedJob | null,
        evaluation: null as Awaited<
          ReturnType<typeof evaluateFit>
        > | null,
        partial: false,
        message:
          "There was not enough readable content on that page to analyse. Paste the description below and try again.",
      };
    }

    const job = await extractJob(data.url, combined, preview, jsonLd, embedded);
    const partial = job.partial && !pasted;


    const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = getSupabaseAdmin();
    let profile: Record<string, unknown> = {};
    if (db) {
      const { data: p } = await db
        .from("profiles")
        .select("full_name,headline,skills,years_exp,target_roles,resume_text")
        .eq("id", userId)
        .maybeSingle();
      if (p) profile = p;
    }

    const evaluation = await evaluateFit(job, profile);
    return {
      preview,
      isJob: isJob as boolean,
      job: job as ParsedJob | null,
      evaluation: evaluation as Awaited<ReturnType<typeof evaluateFit>> | null,
      partial,
      message: !isJob
        ? "This link does not look like a standard job posting, so we analysed the page content as-is. Paste the real description below for a sharper result."
        : partial
          ? "This posting is only partly readable — the site keeps the full description behind a login. Paste the job description below for a complete analysis."
          : evaluation.aiUsed
            ? ""
            : "AI provider unavailable — showing a keyword-based analysis.",
    };

  });
