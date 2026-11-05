# The Send Cambodia · Team Work Style Profile

A bilingual (Khmer / English) work-style survey for The Send Cambodia campaign executive team.
People either take a 48-statement survey or upload their Culture Index PDF report. The app then shows
each person's profile, how far their current job stretches them, and how well they fit their lane's
job description. It started as a claude.ai artifact and is now being moved to Netlify.

Owner: Uriah Lyford (Media Director, The Send Cambodia).

## Layout

```
public/index.html            the whole app: UI, content, scoring, Culture Index PDF reader
public/platform.js           adapter: implements window.claude.use(...) on top of /api/*
netlify/functions/results.mjs    GET / PUT / DELETE results, stored in Netlify Blobs ("results" store)
netlify/functions/read-image.mjs optional: reads a photo/screenshot of a CI chart with the Anthropic API
data/seed.json               results exported from the claude.ai version; loaded once on first request
```

`index.html` still talks to the claude.ai artifact runtime API (`claude.use("db" | "user" | "downloads" | "sample")`).
`platform.js` provides those same calls for Netlify. Keep that contract, so the page can still be republished
as a claude.ai artifact unchanged if needed. Put new platform behaviour in `platform.js`, not in the page.

## Run and deploy

```
npm install
netlify login
netlify init                     # create or link the site
netlify env:set TEAM_CODE  "<code everyone on the team uses>"
netlify env:set ADMIN_CODE "<Uriah's code: delete, CSV, entering answers for others>"
netlify env:set ANTHROPIC_API_KEY "<optional, only for reading photos/screenshots>"
netlify dev                      # local, http://localhost:8888
netlify deploy --prod
```

The first request after deploy copies `data/seed.json` into Blobs and sets `_meta/seeded`, so it runs once.
**This repo (`gonpreah/sendcambodia`) is public, so `data/seed.json` is committed empty and must stay empty.**
Never commit real results. The two results from the claude.ai version (Uriah, Andrew) are re-entered in the
app after the first deploy (retake the survey or re-upload the Culture Index PDF).

Netlify site: `send-cambodia-profile` in the GP Apps team (https://send-cambodia-profile.netlify.app).
TEAM_CODE and ADMIN_CODE are set there as secret environment variables for production.
Changing either code in Netlify only takes effect after a new deploy (Deploys → Trigger deploy, or any push).

## Access model (deliberately simple; improve if needed)

- Everyone enters `TEAM_CODE` once per device (saved in localStorage). `ADMIN_CODE` gives the admin role.
- Each device gets a random id (`d_...`). A member can only write the result whose id is their device id.
  The admin can write or delete any id.
- The device id lives in each browser's own storage, so Telegram's built-in browser and Safari are different
  "devices". The person page shows a personal link (`?me=<device id>#mine`); opening it in another browser makes
  that browser use the same id (platform.js reads `me`, stores it, and strips it from the address bar).
  Whoever has the link can change that result, so the page tells people to keep it to themselves.
- Telegram's in-app browser does not always keep its storage, so people may lose even that link. Every
  person in the People list has a "This is me" button (tap twice) that does the same thing from any browser.
  Trade-off: anyone with the team code could claim someone else's result; fine for a small trusted team.
- Codes are shared secrets, not accounts. If stronger access is needed, swap in Netlify Identity or
  magic-link email in `platform.js` + `roleFor()` in `results.mjs`; the page itself shouldn't need to change.
- All pages send `noindex`.

## Data model (one Blobs entry per person, key = id)

```
name, lane (point|outcomes|mobilization|finance|media|communications|operations|worship|outreach|systems|other),
role, updatedAt,
scores    {ini, ppl, pat, str, log, cre}  0–10, natural profile = Culture Index A, B, C, D, L, I
jobScores {same}                          0–10, what their current job asks (optional)
answers / jobAnswers  [24 ints 1–5]       survey only
source: "ci", ci: {traits:{A..I}, job:{A..I}, traitsArrow, jobArrow, traitsEU, jobEU, pattern}   Culture Index uploads only
pattern                                   Culture Index pattern the person reported (quick survey only)
(no source = the app's own quick survey)
```
`results.mjs` `clean()` keeps only these fields. Update it if you add fields.
Older records used `pac` (Pace, high = fast). Both `clean()` and the page (`normRec`) turn it into `pat = 10 − pac`.

## Aligned with Culture Index

The Send uses Culture Index (CI), so the app follows CI's own guide ("How to Read a Culture Index Graph"):
- Traits use CI letters, names and directions: A Autonomy, B Social ability, C Patience (high = steady,
  patient; low = urgent, fast), D Conformity, L Logic, I Ingenuity. Internal keys stay ini/ppl/pat/str/log/cre.
- Uploading the CI report is the main path on the home page. The app's 24-statement survey is a "quick survey",
  labelled as not Culture Index everywhere, drawn as dashed dots on team charts, and the Team shape tab can
  filter to "Culture Index only". Never copy CI's adjective list into the app: it is CI's survey.
- Energy units (EU): natural and job EU are stored with CI uploads (typed in; the photo reader also asks for
  them, the PDF vector reader does not read them yet). Job EU ≥ 10 % above natural = giving more energy than
  they have; ≥ 10 % below = possible low morale or under-used. Shown on the person page and Team shape.
- Patterns: the 19 CI patterns in the four groups The Send's platform uses (`PATTERN_GROUPS`: Visionary,
  Research, Social, Organizer). CI uploads keep the pattern read from the PDF, matched to the list and
  correctable in a dropdown. Quick-survey people can pick theirs if they know it (shown as self-reported).
  The app never guesses a pattern from scores: only CI's scoring produces one. Team shape lists the team by
  pattern group, including empty groups.
- Big job stretch = a move of ≥ 3 on 2 or more traits at once (CI warns about large moves on several traits).
- **Open question for a trained CI reader:** the Job graph is read against the *Traits* arrow (so the dot
  moves match CI's drawing). CI says each graph has its own arrow. For Uriah (traits arrow 2.75, job arrow 7)
  the two readings differ a lot. Change `saveCI()` (`ciMap(ci.job, ci.traitsArrow)`) once The Send confirms.

## Scoring (all in index.html)

- Survey: 6 traits × 4 statements, one reverse-scored per trait, mapped to 0–10. Part 2 repeats the same
  statements as "how much does your job ask this of you".
- Culture Index → app traits: A, B, C, D, L, I map straight across (C is no longer reversed). A–D are read **relative to the red arrow** of the Traits chart (arrow becomes 5).
  The Job chart uses the Traits arrow too, so the gap between the charts matches how CI draws it. L and I are absolute.
- CI PDF reader (`parseCIPdf`): uses pdf.js 3.11.174 from cdnjs. It reads the vector drawing of page 1: dots by
  fill colour (A red, B yellow, C blue, D green, L purple, I light blue), first six = Traits, next six = Job;
  red vertical lines = arrows; scale origin X0 = 159, one step = 40 drawing units. Verified against Uriah's report.
  If a report doesn't match this layout, it falls back to rendering page 1 and `/api/read-image`.
- Lane fit: `LANES` holds 2–4 target ranges per lane, taken from "What it takes" in the campaign job
  descriptions. Fit % = mean of max(0, 1 − distance/4) over the lane's key traits. Strong ≥ 85, some stretch ≥ 60.
  Targets are Claude's reading of the job descriptions and are expected to be tuned with Uriah.
- "Big job stretch" = a move of ≥ 3 on 2 or more traits at once.
- Best-suited roles (`rankLanes`, `bestRolesHTML`): all ten lanes ranked by fit %, top three shown on the person
  page with ✓ / ≈ / ✗ per "What it takes" line (source: "Campaign Executive Team: Job Descriptions"). The
  People list shows "Best fit" when it differs from the person's lane; the CSV has both.

## Team views (Team results page)

Four tabs: **Team shape** (default), People, **Compare**, Lanes and job fit.

- Team shape (`vShape`): Everyone / Culture Index only switch; one 0–10 line per trait with a dot per person (initials, own colour, stacked when
  close), the team average as a dark line, and the names at each end (≤ 3.5 and ≥ 6.5). Above it, cards from
  `teamInsights()`: where the team leans (average ≥ 6.5 or ≤ 3.5, else the most extreme trait if ≥ 1 from 5),
  ends nobody covers and ends only one person covers (shown from 3 people up), and the traits where jobs pull
  hardest (mean job − natural ≥ 1.5), and people whose job EU is well above or below their natural EU. Respects the lane filter. Tapping a dot opens that person in People.
- Compare (`vCompare`): pick 2–4 people, natural or job profile, same dot lines plus numbers, then one talking
  point per pair from `pairTalk()` (largest difference ≥ 3, and shared highs).
- Person colours: `--c1`…`--c12`, assigned by alphabetical order of all results, so a person keeps one colour.
- New Khmer strings for these views also need the fluent-speaker review.

## Known items / next steps

1. Seed data is empty in this public repo. Uriah and Andrew re-enter their results after the first deploy.
2. Have a fluent Khmer speaker review every Khmer string (all statements, lane names, lane "why" lines).
3. Consider vendoring pdf.js into `public/vendor/` instead of loading it from cdnjs.
4. Lane targets may need tuning; consider making them editable by the admin (store in Blobs).
5. There are no automated tests yet. Approach used so far: bundle `results.mjs` with esbuild, alias
   `@netlify/blobs` to an in-memory mock, serve `public/` + the function from a small Node server, and drive it
   with Playwright at a 390px viewport (survey, CI upload with a real report PDF, team tab, lanes tab, delete, CSV,
   member vs admin).

## Principles

- It is a conversation tool, not a hiring test. Keep that wording in the UI.
- Bilingual everywhere: every user-facing string goes through `L(en, km)` or `one(en, km)`.
- Store numbers only; never store uploaded report files.
