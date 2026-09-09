# Listing workbench

Turns warehouse inventory into marketplace listings, enforcing each
marketplace's rules on both the server and the client.

Built on Next.js 16.3.4 (App Router), React 19, Tailwind v4, TypeScript.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Everything runs locally: there is no database,
no external service, and no API key. Approved listings live in React state, so a
refresh clears them.

```bash
npm run build      # production build
npx tsc --noEmit   # typecheck
npm run lint       # eslint
```

## How to try it

1. Pick a marketplace at the top. **eBay** is the interesting one — it has the
   tightest title limit (55 chars) *and* is the only marketplace requiring the
   condition in the title.
2. Click an inventory item, then **Generate listing**. Watch the attempt summary:
   it will often say the server discarded one or more drafts for breaking the
   rules before returning a clean one.
3. Edit the title — add `wow` (eBay), type past the character counter, or delete
   the condition word. Violations appear as you type and **Approve** disables.
4. With a draft open, switch marketplace. The draft is deliberately kept and
   re-checked, so a title that is legal on DBA (80 chars) can turn illegal on
   eBay (55) in front of you.
5. Try **B2S-10047 "Unknown item - pallet 14"** on eBay. It fails instantly and
   explains why (see *Fast-fail* below). The same item on DBA generates fine.
6. **Approve** a clean listing to move it into the approved list.

## Architecture

| File | Role |
| --- | --- |
| [lib/rules.ts](lib/rules.ts) | **The rule engine.** Pure, no `fs`/`next` imports. |
| [lib/generator.ts](lib/generator.ts) | Stubbed "LLM" client: latency, canned copy, deliberate faults. |
| [lib/data.ts](lib/data.ts) | Reads the two JSON files. |
| [lib/types.ts](lib/types.ts) | Shared types, including the API contract. |
| [app/api/listings/generate/route.ts](app/api/listings/generate/route.ts) | The API route: generate → check → regenerate loop. |
| [app/page.tsx](app/page.tsx) | Server Component; loads data, passes it down. |
| [app/workbench.tsx](app/workbench.tsx) | Client Component; all state and live validation. |
| [app/components/](app/components/) | Presentational pieces. |

### One validator, imported by both sides

`lib/rules.ts` is imported by *both* the API route and the browser. That single
shared import is what guarantees the server-side gate and the live editing
feedback cannot drift apart — there is no second copy of the rules to keep in
sync. It is kept dependency-free precisely so it can cross that boundary.

### The generate → check → regenerate loop

`POST /api/listings/generate` with `{ sku, marketplaceId }`:

1. **Validate input.** Unknown SKU or marketplace → `404`.
2. **Fast-fail (pre-flight).** `canEverSatisfy()` catches item/marketplace pairs
   where *no* possible listing could pass, and returns `422` immediately with
   the reason. `B2S-10047` has `condition: null` and eBay requires the condition
   in the title, so retrying 10 times could only ever fail — better to say so at
   once than to burn the budget and return something vague.
3. **Generate, then check.** The stub returns a draft; the draft is validated
   with `lib/rules.ts`.
4. **On failure, discard and regenerate.** Loop, up to `MAX_ATTEMPTS = 10`.
5. **Return only a clean draft**, plus `attempts` and the reasons the discarded
   drafts were rejected. Only the violation *messages* travel — the offending
   copy is never sent to the browser.
6. **Exhausted** → `502 validation_exhausted`.

The attempt cap is a deliberate addition. "Retry until valid" is unbounded as
literally specified; the cap makes a misbehaving generator degrade into the
required *failed* state instead of hanging the request.

### Simulating a model that misbehaves

`lib/generator.ts` composes copy from the item's real fields, then with
`faultRate = 0.45` injects a fault that breaks a **blocking** rule: appending a
banned word, padding the title past the cap, or stripping the condition. The
faults are chosen from those that actually apply to the target marketplace, so
every faulty generation is genuinely caught by the loop rather than slipping
through.

`transportFailureRate = 0.08` makes the "model" throw, so the *failed* state is
reachable for any item. Both knobs are constants in `GENERATOR_CONFIG`; set them
to `0` for a deterministic demo.

### Swapping in a real model

`generateListing()` is already shaped like a real client — async, latent, and
able to throw. Replacing the body is the whole change:

```ts
export async function generateListing(item, marketplace, options = {}) {
  const response = await client.messages.create({ ... });
  return parseDraft(response);
}
```

Nothing else moves. The route, the retry loop, the validator and the UI are all
indifferent to where the text came from — which is the point of validating the
*output* rather than trusting the prompt.

## The rules

`marketplaces.json` defines five rules. Per the brief, three are enforced as
blocking and two are implemented but advisory:

| Rule | DBA | Amazon DE | eBay | Enforcement |
| --- | --- | --- | --- | --- |
| `title_max_chars` | 80 | 200 | 55 | **blocks approval** |
| `banned_words` | cheap, billig | best price, guaranteed, free gift | l@@k, wow | **blocks approval** |
| `require_condition_in_title` | no | no | **yes** | **blocks approval** |
| `description_max_chars` | 1000 | 2000 | 4000 | advisory |
| `allow_html` | no | yes | yes | advisory |

Two app-level sanity checks also block: an empty title or description. They are
not marketplace rules and are labelled separately in the UI.

### Decisions worth calling out

**Banned words match whole words and phrases.** `cheap` does not flag inside
`cheapest`. Matching is index-based with manual boundary checks rather than
regex — the list contains `l@@k` (regex-hostile) and `best price` (spans a
space), and avoiding lookbehind keeps it working in older Safari. The trade-off:
a real marketplace filter would probably also catch `cheapest`.

**Condition matching normalises and accepts synonyms.** The data stores
condition as loose free text: `new`, `used - like new`, `returned - unopened`,
`damaged`, `null`. Demanding the literal phrase would be impractical — eBay
allows 55 characters *and* requires the condition — so a condition is satisfied
by its full phrase, either of its parts, or a known synonym. `used - like new`
is satisfied by "Used" or "Like New"; `used - good` by "Pre-Owned". The UI lists
the accepted wording when the rule is broken, so the requirement is never a
guessing game.

**Approval is guarded twice.** The button is disabled, and the handler
re-validates before mutating state. Approval is client-side because approved
listings are in-memory only; a real publish endpoint would re-validate
server-side, which is the same one-line `validateListing()` call.

## Handling the data as it actually is

The inventory is deliberately messy, and the app is built for that:

- **Nulls everywhere.** `brand`, `category`, `condition`, `cost_price_dkk`,
  `weight_kg` and `dimensions_cm` are all null on some items. Every field is
  rendered and composed defensively.
- **B2S-10047 "Unknown item - pallet 14"** has almost every field null. It
  fast-fails on eBay with an explanation and lists fine on DBA.
- **B2S-10050 (Milwaukee)** has a 148-character name. Against eBay's 55-char cap
  *with* the condition required, the generator composes and truncates on word
  boundaries, then tidies the seam — cutting `Impact Wrench w/ Friction Ring`
  yields `Impact Wrench`, not a stranded `w/`.
- **Attribute units live in the keys** (`blade_width_mm`, `torque_nm`), so they
  render as "blade width 32 mm", not "blade width mm 32".
- **Brand duplication** is suppressed: `brand: "IKEA"` plus
  `name: "IKEA BEKANT desk"` gives "IKEA BEKANT desk", not "IKEA IKEA BEKANT".
- **B2S-10052 is literally named "damaged - do not list".** It is shown with its
  condition visible, but *not* blocked — the brief defines no such rule, and
  inventing one would be scope creep. Worth a real conversation before shipping.

## How I would test this

Tests are out of scope for the exercise, so there are none in the repo. What I
did instead, and what I would write with more time:

**What I actually verified locally.** Two throwaway harnesses, not committed:

- A sweep hitting the route for all 14 items × 3 marketplaces, ~110 successful
  generations, independently re-validating every returned draft against the
  rules re-implemented in Python. Result: **0 rule-breaking drafts returned**,
  58 drafts discarded server-side, plus `model_unavailable` and
  `preflight_impossible` responses observed.
- 29 assertions against `validateListing` covering the edit paths, the
  marketplace-switch paths, whole-word matching and the synonym table. All pass.

**Unit tests — `lib/rules.ts`.** This is where the value is, because it is pure
and it is the thing that must not break. Table-driven cases per rule:

- `title_max_chars`: at the limit, one over, empty, multi-byte characters.
- `banned_words`: exact hit, casing, `cheapest` (must *not* flag), the `l@@k`
  regex-hostile term, the `best price` phrase, hits in the description, a term
  at the very start and very end of the string.
- `require_condition_in_title`: each condition in the data file, each synonym,
  a near-miss ("Pristine"), and `condition: null`.
- Advisory rules stay out of `blocking` — a regression here would silently make
  approval stricter than intended.
- `canEverSatisfy`: the null-condition/eBay pair, and that it passes otherwise.

**Integration tests — the route.** With the generator's randomness injected or
seeded rather than left to `Math.random`:

- Force the generator to always emit a faulty draft, then assert the response is
  `validation_exhausted` and that no draft is present.
- Force faulty-then-clean, and assert the response is `200`, `attempts === 2`,
  and `rejected` carries reasons but **no copy**.
- Assert the invariant directly: for every item × marketplace, any `200`
  response satisfies `validateListing`. This is the contract that matters, and
  it is cheap to assert exhaustively.
- `400`/`404` for malformed bodies and unknown ids; `422` for the pre-flight.

To make this testable I would lift the randomness behind a seam — pass an
`rng`/`generate` dependency into the route, or export the loop as a function
taking a generator. Right now the loop calls `generateListing` directly, which
is the one thing I would refactor first for testability.

**Component tests — React Testing Library.** Type into the title field and
assert the violation appears and Approve becomes disabled; clear the violation
and assert it re-enables. Switch marketplace with a draft open and assert the
violations change. Mock the route to assert the generating, ready and failed
states each render.

**One end-to-end test (Playwright).** The happy path only: pick eBay, pick an
item, generate, edit into a violation, fix it, approve, see it in the approved
list. Enough to catch wiring breakage without an E2E suite to maintain.

**What I would not test:** the exact wording of the canned copy. It is a stub,
and asserting on it would only create churn when a real model replaces it.

## Out of scope

No auth, no database or persistence, no real publishing, no deployment/Docker/CI,
no committed tests, no image handling, pricing, translation or multi-language —
all per the brief. Visual design is tidy-and-usable rather than polished.

`AGENTS.md` and `CLAUDE.md` are generated by `next dev` and are committed as-is.
