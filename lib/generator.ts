/**
 * Stubbed listing generator.
 *
 * This stands in for a real LLM call. It is written to the shape a real client
 * would have — async, latent, and capable of failing or returning something
 * that breaks the rules — so swapping in a real model means replacing the body
 * of `generateListing` and nothing else:
 *
 *   export async function generateListing(item, marketplace, options) {
 *     const response = await client.messages.create({ ... });
 *     return parseDraft(response);
 *   }
 *
 * No network calls are made and no API key is needed. The "bad output" case is
 * produced by local string manipulation.
 */

import { parseCondition } from './rules';
import type { InventoryItem, ListingDraft, Marketplace } from './types';

export const GENERATOR_CONFIG = {
  /** Simulated round-trip latency. */
  minLatencyMs: 350,
  maxLatencyMs: 900,
  /**
   * Chance that a generation returns copy which breaks a blocking rule. This
   * simulates a real model ignoring its instructions; the API route's check
   * loop is what stops it ever reaching the user.
   */
  faultRate: 0.45,
  /**
   * Chance the "model" is unreachable, so the failed state is reachable for
   * any item. Set to 0 for a deterministic demo.
   */
  transportFailureRate: 0.08,
} as const;

/** Thrown when the stubbed model is "unreachable" — mirrors a client error. */
export class ModelUnavailableError extends Error {
  constructor(message = 'The listing model did not respond.') {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export interface GenerateOptions {
  /**
   * Varies the output. The route passes a different seed per attempt so
   * regenerating never returns byte-identical copy.
   */
  seed?: number;
}

export async function generateListing(
  item: InventoryItem,
  marketplace: Marketplace,
  options: GenerateOptions = {},
): Promise<ListingDraft> {
  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const random = seededRandom(seed);

  const { minLatencyMs, maxLatencyMs } = GENERATOR_CONFIG;
  await delay(minLatencyMs + random() * (maxLatencyMs - minLatencyMs));

  if (random() < GENERATOR_CONFIG.transportFailureRate) {
    throw new ModelUnavailableError();
  }

  const draft: ListingDraft = {
    title: composeTitle(item, marketplace, random),
    description: composeDescription(item, marketplace, random),
  };

  return maybeInjectFault(draft, item, marketplace, random);
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

function composeTitle(
  item: InventoryItem,
  marketplace: Marketplace,
  random: () => number,
): string {
  const max = marketplace.title_max_chars;
  const condition = parseCondition(item.condition);
  const name = normaliseSpace(item.name);
  const brand = item.brand?.trim() || null;

  const core = withBrand(name, brand);

  let suffix = '';
  if (condition) {
    const required = marketplace.require_condition_in_title;
    // Longer titles can carry the full phrase ("Used - Like New"); tight ones
    // fall back to the primary token, which also satisfies the rule.
    const useFull = Boolean(condition.qualifier) && max >= 80 && random() < 0.5;
    const label = titleCase(useFull ? condition.full : condition.primary);

    // On marketplaces that do not require it, mention it only sometimes.
    if (required || (max >= 80 && random() < 0.6)) {
      suffix = ` - ${label}`;
    }
  }

  const highlight = pickHighlight(item, random);
  let body = core;
  if (highlight && core.length + highlight.length + 2 + suffix.length <= max) {
    body = `${core}, ${highlight}`;
  }

  const room = Math.max(0, max - suffix.length);
  const truncated = truncateOnWord(body, room);

  return `${truncated}${suffix}`.trim() || truncateOnWord(name, max);
}

function composeDescription(
  item: InventoryItem,
  marketplace: Marketplace,
  random: () => number,
): string {
  const condition = parseCondition(item.condition);
  const name = normaliseSpace(item.name);
  const brand = item.brand?.trim() || null;
  const category = item.category?.trim() || null;

  const sentences: string[] = [];

  const branded = withBrand(name, brand);
  const openers = [
    `${branded}${
      category ? `, from our ${category.toLowerCase()} stock` : ''
    }.`,
    `Now available: ${branded}.`,
    `${branded}, shipped from our Danish warehouse.`,
  ];
  sentences.push(pick(openers, random));

  if (condition) {
    sentences.push(`Condition: ${condition.full}.`);
  } else {
    sentences.push(
      'Condition is not recorded for this stock item; please ask before buying.',
    );
  }

  const details = formatAttributes(item.attributes);
  if (details.length > 0) {
    sentences.push(`Key details — ${details.join('; ')}.`);
  }

  const measurements: string[] = [];
  if (item.dimensions_cm) measurements.push(`${item.dimensions_cm} cm`);
  if (typeof item.weight_kg === 'number') measurements.push(`${item.weight_kg} kg`);
  if (measurements.length > 0) {
    sentences.push(`Dimensions and weight: ${measurements.join(', ')}.`);
  }

  if (item.notes) {
    // Notes are inconsistently punctuated in the source data.
    const notes = normaliseSpace(item.notes).replace(/\.+$/, '');
    sentences.push(`Please note: ${lowerFirst(notes)}.`);
  }

  if (item.quantity > 1) {
    sentences.push(`${item.quantity} units in stock and ready to dispatch.`);
  } else if (item.quantity === 1) {
    sentences.push('One unit only.');
  } else {
    sentences.push('Currently out of stock.');
  }

  const closers = [
    'Dispatched within one working day.',
    'Buy with confidence from a trade seller.',
    'Questions are welcome before purchase.',
  ];
  sentences.push(pick(closers, random));

  return truncateOnWord(sentences.join(' '), marketplace.description_max_chars);
}

/**
 * Attribute keys carry their unit as a suffix (`blade_width_mm`, `torque_nm`),
 * which reads wrong if the key is simply de-underscored: "blade width mm 32".
 */
const UNIT_SUFFIXES = new Set([
  'mm',
  'cm',
  'm',
  'kg',
  'g',
  'gb',
  'tb',
  'nm',
  'v',
  'w',
  'ohm',
  'ml',
  'l',
]);

function splitUnit(key: string): { label: string; unit: string | null } {
  const parts = key.split('_');
  const last = parts[parts.length - 1].toLowerCase();

  if (parts.length > 1 && UNIT_SUFFIXES.has(last)) {
    return {
      label: parts.slice(0, -1).join(' '),
      unit: last === 'gb' || last === 'tb' ? last.toUpperCase() : last,
    };
  }

  return { label: parts.join(' '), unit: null };
}

/**
 * Renders one attribute as human text.
 * `pair` gives "blade width: 32 mm"; `phrase` gives "blade width 32 mm".
 */
function describeAttribute(
  key: string,
  value: string | number | boolean,
  style: 'pair' | 'phrase',
): string | null {
  const { label, unit } = splitUnit(key);

  if (typeof value === 'boolean') {
    if (style === 'pair') return `${label}: ${value ? 'yes' : 'no'}`;
    return value ? label : `no ${label}`;
  }

  if (value === null || value === undefined || value === '') return null;

  const rendered = unit ? `${value} ${unit}` : String(value);
  return style === 'pair' ? `${label}: ${rendered}` : `${label} ${rendered}`;
}

function formatAttributes(
  attributes: Record<string, string | number | boolean>,
): string[] {
  return Object.entries(attributes ?? {})
    .map(([key, value]) => describeAttribute(key, value, 'pair'))
    .filter((entry): entry is string => entry !== null);
}

function pickHighlight(
  item: InventoryItem,
  random: () => number,
): string | null {
  const name = item.name.toLowerCase();

  const entries = Object.entries(item.attributes ?? {})
    .filter(([key, value]) => {
      // Skip anything the name already says, to avoid
      // "BEKANT desk, 160x80, white, colour white".
      const probe =
        typeof value === 'boolean'
          ? splitUnit(key).label
          : String(value).toLowerCase();
      return !name.includes(probe.toLowerCase());
    })
    .map(([key, value]) => describeAttribute(key, value, 'phrase'))
    .filter((entry): entry is string => entry !== null);

  if (entries.length === 0) return null;
  return pick(entries, random);
}

/* ------------------------------------------------------------------ */
/* Fault injection — simulates a model that ignores its instructions   */
/* ------------------------------------------------------------------ */

type FaultKind = 'banned_word' | 'overflow_title' | 'drop_condition';

function maybeInjectFault(
  draft: ListingDraft,
  item: InventoryItem,
  marketplace: Marketplace,
  random: () => number,
): ListingDraft {
  if (random() >= GENERATOR_CONFIG.faultRate) return draft;

  const condition = parseCondition(item.condition);

  // Only faults that actually break a *blocking* rule on this marketplace, so
  // every faulty generation is genuinely caught by the check loop.
  const kinds: FaultKind[] = ['overflow_title'];
  if (marketplace.banned_words.length > 0) kinds.push('banned_word');
  if (marketplace.require_condition_in_title && condition) {
    kinds.push('drop_condition');
  }

  switch (pick(kinds, random)) {
    case 'banned_word': {
      const word = pick(marketplace.banned_words, random);
      return random() < 0.5
        ? { ...draft, title: `${draft.title} ${word}`.trim() }
        : { ...draft, description: `${draft.description} Truly ${word}.` };
    }

    case 'overflow_title': {
      // Pad until it definitely exceeds the cap, whatever the cap is.
      const filler =
        ' plus extra notes on packaging, dispatch and warehouse handling';
      let title = draft.title;
      for (let i = 0; i < 20 && title.length <= marketplace.title_max_chars; i++) {
        title += filler;
      }
      return { ...draft, title };
    }

    case 'drop_condition': {
      // Strip every accepted wording so the condition rule is definitely broken.
      let title = draft.title;
      for (const term of condition!.accepted) {
        title = title.replace(
          new RegExp(escapeRegex(term).replace(/\s+/g, '\\s+'), 'gi'),
          '',
        );
      }
      return {
        ...draft,
        title: normaliseSpace(title).replace(/[\s\-–—,;:]+$/, ''),
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** mulberry32 — small deterministic PRNG so a seed reproduces an output. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

function normaliseSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Words that read as broken when a truncation lands just after them, e.g.
 * cutting "Impact Wrench w/ Friction Ring" leaves "Impact Wrench w/".
 */
const DANGLING_WORD = /\s+(?:w\/?|with|and|or|for|the|an?|of|to|in|by|plus|&)$/i;
const TRAILING_PUNCTUATION = /[\s,;:/\-–—]+$/;

/** Truncates without cutting a word in half, and tidies up the seam. */
function truncateOnWord(text: string, max: number): string {
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  let kept = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;

  // Dangling words first: stripping punctuation first would turn a trailing
  // "w/" into a stranded "w". Two passes tidies "... Wrench w/ and".
  for (let pass = 0; pass < 2; pass++) {
    kept = kept.replace(DANGLING_WORD, '').replace(TRAILING_PUNCTUATION, '');
  }

  return kept;
}

/** Prepends the brand only when the product name does not already carry it. */
function withBrand(name: string, brand: string | null): string {
  if (!brand) return name;
  return name.toLowerCase().includes(brand.toLowerCase())
    ? name
    : `${brand} ${name}`;
}

function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
