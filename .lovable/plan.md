# Add live web job discovery and clarify auto-apply

## What will change
- Add a server-side live-job search that reads current openings from the existing Remotive and Arbeitnow feeds.
- Show those web results on the candidate Jobs page alongside existing matched roles, with title search, source, location, posting date, and a direct link to the real application page.
- Keep failures from either external source isolated, so internal jobs and the other source still load.
- Update the Job Hunt screen to clearly explain setup: complete the profile, set target titles and locations, choose review or automatic mode, set a threshold and daily cap, then enable the agent.
- Clearly distinguish real external submission from tracking: the current app can discover, score, draft, and track outside jobs, but cannot truthfully submit arbitrary third-party forms without a supported job-board integration or browser automation.
- Fix external approval behavior so an external proposal opens or prepares the real posting rather than pretending a database record means the third-party application was submitted.

## Verification
- Run the TypeScript check and production build.
- Exercise live search and the Job Hunt controls in the browser.
- Confirm source failures and empty searches produce clear messages.

## Technical details
- Reuse `jobsources.server.ts` through a validated TanStack server function; external requests remain server-side.
- Add the external posting URL/source to proposal data so review actions preserve the destination.
- Keep current authentication and storage architecture unchanged; no Lovable Cloud changes.
