import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/routes/_app";
import { SectionCard } from "@/components/dashboard/primitives";
import { useDataset } from "@/hooks/use-dataset";
import { Sparkles, Zap, MapPin, Link2, Loader2, Search, ExternalLink, Globe2 } from "lucide-react";
import { toast } from "sonner";
import { evaluateJobUrl } from "@/lib/joblink.functions";
import { useAutoApplyAgent } from "@/hooks/use-auto-apply";
import { searchLiveJobs } from "@/lib/jobsources.functions";
import type { ExternalJob } from "@/lib/jobsources.server";

type EvalResult = Awaited<ReturnType<typeof evaluateJobUrl>>;

export const Route = createFileRoute("/_app/candidate/jobs")({
  head: () => ({
    meta: [
      { title: "Job Matches & Web Search · ATS Engine" },
      { name: "description", content: "Search live web jobs and review roles matched to your ATS Engine profile." },
      { property: "og:title", content: "Job Matches & Web Search · ATS Engine" },
      { property: "og:description", content: "Search live web jobs and review roles matched to your ATS Engine profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CandidateMatches,
});

function CandidateMatches() {
  const { jobMatches } = useDataset();
  const agent = useAutoApplyAgent();
  const [applied, setApplied] = useState<string[]>([]);
  const [jobUrl, setJobUrl] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [webQuery, setWebQuery] = useState("");
  const [webJobs, setWebJobs] = useState<ExternalJob[]>([]);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [webSearched, setWebSearched] = useState(false);

  async function handleWebSearch() {
    setSearchingWeb(true);
    try {
      const res = await searchLiveJobs({ data: { query: webQuery.trim(), limit: 24 } });
      setWebJobs(res.jobs);
      setWebSearched(true);
      if (!res.jobs.length) toast.message("No live web jobs matched that search");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not search live jobs");
    } finally {
      setSearchingWeb(false);
    }
  }

  async function handleEvaluate() {
    if (!jobUrl.trim()) return;
    setEvaluating(true);
    setResult(null);
    try {
      const res = await evaluateJobUrl({ data: { url: jobUrl.trim() } });
      setResult(res);
      if (res.isJob) toast.success("Evaluation ready");
      else toast.error(res.message || "That link is not a job posting");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to evaluate");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="AI-matched opportunities"
        title="Roles built for you"
        subtitle="Every match is scored against your resume, portfolio, and preferences."
        actions={
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold">
            {agent.running ? (
              <Loader2 className="size-3.5 animate-spin text-accent" />
            ) : (
              <Zap
                className={`size-3.5 ${agent.settings.enabled ? "text-accent" : "text-muted-foreground"}`}
              />
            )}
            Auto-apply agent
            <input
              type="checkbox"
              checked={agent.settings.enabled}
              disabled={agent.loading}
              onChange={(e) => void agent.update({ enabled: e.target.checked })}
              className="accent-accent"
            />
          </label>
        }
      />

      <section className="mb-6 border-y border-border bg-surface/40 px-4 py-5 sm:px-5">
        <div className="mb-3 flex items-center gap-2">
          <Globe2 className="size-4 text-accent" />
          <h2 className="font-display text-sm font-bold">Search live jobs on the web</h2>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void handleWebSearch();
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={webQuery}
              onChange={(event) => setWebQuery(event.target.value)}
              placeholder="Product designer, frontend engineer…"
              aria-label="Search live web jobs"
              className="w-full rounded-md border border-border bg-card py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>
          <button
            type="submit"
            disabled={searchingWeb}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            {searchingWeb ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {searchingWeb ? "Searching…" : "Search web"}
          </button>
        </form>

        {webSearched && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {webJobs.map((job) => (
              <article key={job.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold">{job.title}</h3>
                    <p className="truncate text-xs text-muted-foreground">{job.company}</p>
                  </div>
                  <span className="shrink-0 rounded bg-surface px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                    {job.source}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{job.location || "Not specified"}</span>
                  <span>{job.type}</span>
                  <span>{new Date(job.postedAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-foreground/75">{job.description}</p>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                >
                  View application <ExternalLink className="size-3.5" />
                </a>
              </article>
            ))}
            {webJobs.length === 0 && (
              <p className="py-4 text-xs text-muted-foreground">Try a broader title or keyword.</p>
            )}
          </div>
        )}
      </section>

      <SectionCard
        className="mb-6"
        title="Auto-apply agent"
        action={
          <button
            onClick={() => void agent.runOnce()}
            disabled={!agent.settings.enabled || agent.running}
            className="text-xs font-medium text-accent hover:underline disabled:opacity-40"
          >
            Run a pass now
          </button>
        }
      >
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              While this is on, the agent scans new matches every minute and submits applications
              for roles that clear your score threshold — up to your daily cap.
            </p>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                <span>Minimum match score</span>
                <span className="font-mono text-accent">{agent.settings.minScore}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={99}
                value={agent.settings.minScore}
                onChange={(e) => void agent.update({ minScore: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                <span>Applications per day</span>
                <span className="font-mono text-accent">{agent.settings.dailyLimit}</span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                value={agent.settings.dailyLimit}
                onChange={(e) => void agent.update({ dailyLimit: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Agent activity
            </div>
            {agent.log.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No applications submitted yet. Turn the agent on to let it work in the background.
              </p>
            ) : (
              <ul className="space-y-2">
                {agent.log.slice(0, 6).map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {e.jobTitle} · {e.company}
                      </div>
                      <div className="text-muted-foreground">{e.reason}</div>
                    </div>
                    <span className="shrink-0 font-mono text-accent">{e.matchScore}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4">
        {jobMatches.map((m) => {
          const isApplied = applied.includes(m.id);
          return (
            <div
              key={m.id}
              className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-accent/40 hover:shadow-md md:flex-row md:items-center"
            >
              <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface font-display text-lg font-bold">
                {m.logo}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-bold">{m.title}</h3>
                  <span className="text-sm text-muted-foreground">at {m.company}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" /> {m.location}
                  </span>
                  <span>·</span>
                  <span>{m.salary}</span>
                  <span>·</span>
                  <span>{m.postedAgo}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.skills.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-surface px-2 py-0.5 text-[10px] font-medium ring-1 ring-border"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 p-2.5 text-xs">
                  <Sparkles className="mt-0.5 size-3 shrink-0 text-accent" />
                  <span className="text-foreground/80">{m.reason}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 md:flex-col md:items-end">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Match
                  </div>
                  <div className="font-mono text-2xl font-extrabold text-accent">
                    {m.matchScore}%
                  </div>
                </div>
                <button
                  disabled={isApplied}
                  onClick={() => {
                    setApplied((prev) => [...prev, m.id]);
                    toast.success(`Applied to ${m.title} at ${m.company}`);
                  }}
                  className={`min-w-24 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                    isApplied
                      ? "bg-surface text-muted-foreground"
                      : "bg-accent text-accent-foreground hover:opacity-90"
                  }`}
                >
                  {isApplied ? "Applied ✓" : "Apply"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <SectionCard className="mt-8" title="External job preparation">
        <div className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm text-foreground/80">
            <Sparkles className="size-4 text-accent" />
            Paste a job URL — AI fetches the posting, matches it to your profile, and prepares a
            personalized interview plan.
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://company.com/careers/senior-designer"
                className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <button
              onClick={handleEvaluate}
              disabled={evaluating || !jobUrl.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {evaluating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {evaluating ? "Evaluating…" : "Evaluate fit"}
            </button>
          </div>

          {result?.job && (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-border bg-surface/50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-display text-lg font-bold">
                      {result.job!.title || "Untitled role"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[result.job!.company, result.job!.location, result.job!.salary]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  {result.evaluation && (
                    <div className="text-center">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Match
                      </div>
                      <div className="font-mono text-3xl font-extrabold text-accent">
                        {result.evaluation.matchScore}%
                      </div>
                    </div>
                  )}
                </div>
                {result.job!.description && (
                  <p className="mt-3 line-clamp-4 text-xs text-foreground/70">
                    {result.job!.description}
                  </p>
                )}
                {result.job!.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {result.job!.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-card px-2 py-0.5 text-[10px] font-medium ring-1 ring-border"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {result.evaluation && (
                <>
                  <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 text-sm">
                    {result.evaluation.summary}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-accent">
                        Strengths
                      </div>
                      <ul className="list-disc space-y-1 pl-4 text-xs">
                        {result.evaluation.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand">
                        Gaps
                      </div>
                      <ul className="list-disc space-y-1 pl-4 text-xs">
                        {result.evaluation.gaps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {result.evaluation.interviewPlan.length > 0 && (
                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Interview plan
                      </div>
                      <div className="space-y-3">
                        {result.evaluation.interviewPlan.map((s, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-border bg-surface/50 p-3"
                          >
                            <div className="font-semibold text-sm">{s.stage}</div>
                            <div className="text-xs text-muted-foreground">{s.focus}</div>
                            {s.questions.length > 0 && (
                              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs">
                                {s.questions.map((q, j) => (
                                  <li key={j}>{q}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.evaluation.preparationTips.length > 0 && (
                    <div className="rounded-lg border border-border p-4">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Preparation tips
                      </div>
                      <ul className="list-disc space-y-1 pl-4 text-xs">
                        {result.evaluation.preparationTips.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
