# The Send Cambodia · CRM

A small CRM for The Send Cambodia campaign, built instead of HubSpot: phone-first, Khmer and English,
church-based. Phase 1 of the plan: people, churches, roles, phone de-duplication, spreadsheet import.
Lives in `crm/` of the public `gonpreah/sendcambodia` repo; it is its own Netlify site (base directory `crm`).

## Layout

```
public/index.html                 page shell + all CSS (The Send look)
public/app.js                     the whole app: views, forms, import, export (no build step, no framework)
netlify/functions/api.mjs         /api/*: auth, validation, storage in Netlify Blobs (store "crm")
```

## Look (The Send branding)

Yellow `#F6C744`, red `#E8382D` (red text on light: `#C42D23`), ink `#141210`, cream `#F7F1E3`. Anton (uppercase)
for English headings, Archivo for text, Kantumruy Pro for all Khmer. Black top bar with the red arrow-in-circle
logo, yellow buttons with an ink border, as on The Send's own platform. Every string is `t(en, km)`; Khmer default.

## Data (Netlify Blobs, store "crm")

- `p/<id>` person: nameKm, nameEn, phone (E.164, +855…), telegram, email, province, district, gender, ageBand,
  lang, roles[], churchId, notes, consentMsg, guardianConsent, created/updated at+by.
- `c/<id>` church: nameKm, nameEn, phone, province, district, network, pastorName, size, stage, notes.
- `ix/phone/<e164>` → person id. One person per phone number: saving a second person with the same phone
  returns 409 `duplicate`; import fills the existing record's empty fields and adds roles instead.
- Lists (provinces, roles, stages, ages, sizes) exist in BOTH `api.mjs` and `app.js`; change them together.
- `normPhone` exists in both too: 012 345 678 / 855… / +855… → +855…; other countries allowed.
- `GET /api/data` returns everything; filtering is in the browser. Fine for thousands of records; before
  registration opens at scale, move storage to Postgres behind the same API and load-test (see the plan).

## Access

`STAFF_CODE` (add and edit) and `ADMIN_CODE` (also delete and CSV export) are Netlify environment variables;
codes change only after a redeploy. Each person signs in with their name, stored as created/updated by.
This is a shared-code model: before real attendee data (especially under-18s and responders) goes in, move to
individual accounts (Netlify Identity or magic links) with per-church access, and confirm the privacy rules with
The Send Global. Never commit real data: the repo is public.

## Test

No test suite yet. The approach used: run `api.mjs` in Node with `globalThis.__crmStore` set to an in-memory
store and `globalThis.Netlify.env` stubbed, serve `public/`, and drive it with Playwright at 390px wide
(sign-in, add church, add person, duplicate phone, bad phone, CSV import with merge and skipped rows, staff
cannot delete).

## Next phases (from the plan)

2 registration forms + group sign-up for pastors + Telegram bot · 3 volunteers and shifts · 4 event-day QR
check-in and response cards · 5 follow-up pipeline and pastor pages · 6 dashboards and the Global export.
