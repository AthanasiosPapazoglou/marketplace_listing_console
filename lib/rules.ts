/**
 * Marketplace rule engine.
 *
 * This module is the single source of truth for "is this listing legal?".
 * It is imported by BOTH the API route (`app/api/listings/generate/route.ts`)
 * and the browser UI (`app/workbench.tsx`), which is what guarantees the
 * server-side gate and the live editing feedback can never drift apart.
 *
 * It must therefore stay pure: no `fs`, no `next/*`, no environment access.
 */

import type {
  InventoryItem,
  ListingDraft,
  ListingField,
  Marketplace,
  RuleId,
  ValidationResult,
  Violation,
} from './types';

/**
 * The three rules the brief requires to be enforced. Tripping any of these
 * makes a listing unpublishable and unapprovable.
 */
export const BLOCKING_MARKETPLACE_RULES = [
  'title_max_chars',
  'banned_words',
  'require_condition_in_title',
] as const satisfies readonly RuleId[];

/**
 * The remaining two rules from `marketplaces.json`. Implemented and shown to
 * the user, but non-blocking.
 */
export const WARNING_MARKETPLACE_RULES = [
  'description_max_chars',
  'allow_html',
] as const satisfies readonly RuleId[];

export const RULE_LABELS: Record<RuleId, string> = {
  title_max_chars: 'Title length',
  banned_words: 'Banned words',
  require_condition_in_title: 'Condition in title',
  description_max_chars: 'Description length',
  allow_html: 'HTML allowed',
  title_required: 'Title present',
  description_required: 'Description present',
};

/* ------------------------------------------------------------------ */
/* Condition handling                                                  */
/* ------------------------------------------------------------------ */

/**
 * `inventory.json` stores condition as loose free text: "new",
 * "used - like new", "returned - unopened", "damaged", or null.
 *
 * Requiring the literal phrase in the title is impractical — eBay allows 55
 * characters and also requires the condition — so a condition is satisfied by
 * its full phrase, either of its parts, or a known synonym.
 */
const CONDITION_SYNONYMS: Record<string, readonly string[]> = {
  new: ['new', 'brand new'],
  used: ['used', 'pre-owned', 'preowned', 'second hand', 'secondhand'],
  returned: ['returned', 'customer return', 'open box', 'open-box'],
  damaged: ['damaged', 'faulty', 'for parts'],
  refurbished: ['refurbished', 'refurb'],
};

export interface ParsedCondition {
  /** Exactly as stored in inventory. */
  raw: string;
  /** Normalised full phrase, e.g. "used - like new". */
  full: string;
  /** Leading token, e.g. "used". */
  primary: string;
  /** Trailing qualifier, e.g. "like new". Null when there isn't one. */
  qualifier: string | null;
  /** Every wording that satisfies `require_condition_in_title`. */
  accepted: string[];
}

export function parseCondition(
  condition: string | null | undefined,
): ParsedCondition | null {
  if (!condition) return null;

  const full = normaliseSpace(condition).toLowerCase();
  if (!full) return null;

  const parts = full
    .split(/\s*[-–—/]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  const primary = parts[0] ?? full;
  const qualifier = parts.length > 1 ? parts.slice(1).join(' ') : null;

  return {
    raw: condition,
    full,
    primary,
    qualifier,
    accepted: unique([full, ...parts, ...(CONDITION_SYNONYMS[primary] ?? [])]),
  };
}

/* ------------------------------------------------------------------ */
/* Text matching                                                       */
/* ------------------------------------------------------------------ */

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

export function normaliseSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Whole-word / whole-phrase, case-insensitive containment.
 *
 * Deliberately index-based rather than regex-based: the banned word list
 * contains `l@@k`, and phrases like `best price` span a space. Using indexOf
 * plus manual boundary checks avoids both regex escaping bugs and lookbehind,
 * which older Safari does not support.
 *
 * "cheap" therefore does not match inside "cheapest".
 */
export function containsWholeTerm(haystack: string, term: string): boolean {
  const needle = normaliseSpace(term).toLowerCase();
  if (!needle) return false;

  const text = normaliseSpace(haystack).toLowerCase();

  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return false;

    const before = at > 0 ? text[at - 1] : undefined;
    const after =
      at + needle.length < text.length ? text[at + needle.length] : undefined;

    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = at + 1;
  }
}

function containsHtml(text: string): boolean {
  return /<\/?[a-zA-Z][^<>]*>/.test(text) || /&(?:[a-zA-Z]+|#\d+);/.test(text);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Validates a draft against one marketplace's rules.
 *
 * Called on the server before any draft is returned, and again in the browser
 * on every keystroke while the user edits.
 */
export function validateListing(
  draft: ListingDraft,
  item: InventoryItem,
  marketplace: Marketplace,
): ValidationResult {
  const violations: Violation[] = [];
  const title = draft.title ?? '';
  const description = draft.description ?? '';

  // App-level sanity checks — not marketplace rules, but approving an empty
  // listing should never be possible.
  if (!title.trim()) {
    violations.push({
      ruleId: 'title_required',
      severity: 'blocking',
      field: 'title',
      message: 'Title is empty.',
    });
  }
  if (!description.trim()) {
    violations.push({
      ruleId: 'description_required',
      severity: 'blocking',
      field: 'description',
      message: 'Description is empty.',
    });
  }

  // Rule 1 (required): title_max_chars
  if (title.length > marketplace.title_max_chars) {
    const over = title.length - marketplace.title_max_chars;
    violations.push({
      ruleId: 'title_max_chars',
      severity: 'blocking',
      field: 'title',
      message: `Title is ${over} character${over === 1 ? '' : 's'} over the ${
        marketplace.name
      } limit.`,
      detail: `${title.length} / ${marketplace.title_max_chars} characters.`,
    });
  }

  // Rule 2 (required): banned_words, anywhere in the listing
  const fields: { field: ListingField; text: string; label: string }[] = [
    { field: 'title', text: title, label: 'Title' },
    { field: 'description', text: description, label: 'Description' },
  ];

  for (const { field, text, label } of fields) {
    const found = marketplace.banned_words.filter((word) =>
      containsWholeTerm(text, word),
    );
    if (found.length > 0) {
      violations.push({
        ruleId: 'banned_words',
        severity: 'blocking',
        field,
        message: `${label} uses banned word${
          found.length === 1 ? '' : 's'
        }: ${found.map((word) => `"${word}"`).join(', ')}.`,
        detail: `${marketplace.name} bans: ${marketplace.banned_words.join(
          ', ',
        )}.`,
      });
    }
  }

  // Rule 3 (required): require_condition_in_title
  if (marketplace.require_condition_in_title) {
    const condition = parseCondition(item.condition);

    if (!condition) {
      violations.push({
        ruleId: 'require_condition_in_title',
        severity: 'blocking',
        field: 'title',
        message: `${item.sku} has no recorded condition, and ${marketplace.name} requires the condition in the title.`,
        detail: 'The inventory record needs fixing before listing here.',
      });
    } else if (
      !condition.accepted.some((term) => containsWholeTerm(title, term))
    ) {
      violations.push({
        ruleId: 'require_condition_in_title',
        severity: 'blocking',
        field: 'title',
        message: `Title must state the condition ("${condition.raw}").`,
        detail: `Accepted wording: ${condition.accepted
          .map((term) => `"${term}"`)
          .join(', ')}.`,
      });
    }
  }

  // Rule 4 (non-blocking): description_max_chars
  if (description.length > marketplace.description_max_chars) {
    const over = description.length - marketplace.description_max_chars;
    violations.push({
      ruleId: 'description_max_chars',
      severity: 'warning',
      field: 'description',
      message: `Description is ${over} character${
        over === 1 ? '' : 's'
      } over the ${marketplace.name} limit.`,
      detail: `${description.length} / ${marketplace.description_max_chars} characters.`,
    });
  }

  // Rule 5 (non-blocking): allow_html
  if (!marketplace.allow_html) {
    for (const { field, text, label } of fields) {
      if (containsHtml(text)) {
        violations.push({
          ruleId: 'allow_html',
          severity: 'warning',
          field,
          message: `${label} contains HTML, which ${marketplace.name} does not allow.`,
          detail: 'Plain text only.',
        });
      }
    }
  }

  const blocking = violations.filter((v) => v.severity === 'blocking');
  const warnings = violations.filter((v) => v.severity === 'warning');

  return { blocking, warnings, canApprove: blocking.length === 0 };
}

export type SatisfiabilityCheck =
  | { ok: true }
  | { ok: false; reason: string; hint?: string };

/**
 * Pre-flight check, run before spending any time generating.
 *
 * Some item/marketplace pairs can never produce a legal listing no matter what
 * the model returns — B2S-10047 has no condition, and eBay requires the
 * condition in the title. Detecting that up front turns a confusing
 * retry-until-exhausted into an immediate, explicable failure.
 */
export function canEverSatisfy(
  item: InventoryItem,
  marketplace: Marketplace,
): SatisfiabilityCheck {
  if (!item.name?.trim()) {
    return {
      ok: false,
      reason: `${item.sku} has no product name to build a listing from.`,
      hint: 'Add a name to the inventory record.',
    };
  }

  if (marketplace.require_condition_in_title && !parseCondition(item.condition)) {
    return {
      ok: false,
      reason: `${item.sku} has no recorded condition, and ${marketplace.name} requires the condition in the title.`,
      hint: 'No possible title could satisfy that rule, so generation was not attempted. Record the condition, or pick a marketplace that does not require it.',
    };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
