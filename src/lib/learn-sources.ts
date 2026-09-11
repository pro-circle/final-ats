/**
 * Client-safe helpers that turn an interview question / topic into links to
 * official and well-known learning resources. Nothing here is mocked: every
 * link is a real search or documentation entry point on the target site.
 */
export type LearnSource = { label: string; url: string; kind: "docs" | "practice" | "video" };

const STOP = new Set([
  "what",
  "how",
  "why",
  "when",
  "which",
  "the",
  "a",
  "an",
  "is",
  "are",
  "do",
  "does",
  "did",
  "you",
  "your",
  "explain",
  "describe",
  "tell",
  "me",
  "about",
  "between",
  "and",
  "or",
  "of",
  "in",
  "on",
  "for",
  "to",
  "with",
  "would",
  "could",
  "should",
  "can",
  "give",
  "an",
  "example",
  "difference",
  "using",
  "use",
  "it",
  "that",
  "this",
  "have",
  "has",
  "been",
  "was",
  "were",
  "will",
  "at",
  "by",
  "from",
  "as",
  "not",
  "if",
  "then",
  "them",
]);

/** Pulls the most search-worthy words out of a question. */
export function topicOf(question: string, fallback = ""): string {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const topic = words.slice(0, 6).join(" ").trim();
  return topic || fallback || question.slice(0, 60);
}

export function learnSources(question: string, context = ""): LearnSource[] {
  const topic = topicOf(question, context);
  const q = encodeURIComponent(topic);
  return [
    {
      label: "MDN Web Docs",
      url: `https://developer.mozilla.org/en-US/search?q=${q}`,
      kind: "docs",
    },
    { label: "W3Schools", url: `https://www.w3schools.com/search/search.php?q=${q}`, kind: "docs" },
    {
      label: "GeeksforGeeks",
      url: `https://www.geeksforgeeks.org/search/?gq=${q}`,
      kind: "practice",
    },
    {
      label: "Stack Overflow",
      url: `https://stackoverflow.com/search?q=${q}`,
      kind: "practice",
    },
    {
      label: "YouTube",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${topic} interview explained`)}`,
      kind: "video",
    },
  ];
}

/** Research links about the hiring company (all real search entry points). */
export function companySources(company: string): LearnSource[] {
  const c = encodeURIComponent(company.trim());
  if (!company.trim()) return [];
  return [
    { label: "Google News", url: `https://news.google.com/search?q=${c}`, kind: "docs" },
    {
      label: "Glassdoor reviews",
      url: `https://www.glassdoor.com/Search/results.htm?keyword=${c}`,
      kind: "docs",
    },
    {
      label: "LinkedIn company",
      url: `https://www.linkedin.com/search/results/companies/?keywords=${c}`,
      kind: "docs",
    },
    {
      label: "YouTube: culture & interviews",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${company} interview experience culture`)}`,
      kind: "video",
    },
  ];
}

/** Interview-prep links for a specific role (optionally at a company). */
export function roleSources(role: string, company = ""): LearnSource[] {
  const r = role.trim() || "software engineer";
  const withCo = company.trim() ? `${company} ${r}` : r;
  return [
    {
      label: "YouTube: mock interview",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${withCo} interview questions mock`)}`,
      kind: "video",
    },
    {
      label: "Glassdoor interview questions",
      url: `https://www.glassdoor.com/Interview/index.htm?keyword=${encodeURIComponent(withCo)}`,
      kind: "practice",
    },
    {
      label: "LeetCode practice",
      url: `https://leetcode.com/problemset/?search=${encodeURIComponent(r)}`,
      kind: "practice",
    },
    {
      label: "Coursera courses",
      url: `https://www.coursera.org/search?query=${encodeURIComponent(r)}`,
      kind: "docs",
    },
  ];
}

