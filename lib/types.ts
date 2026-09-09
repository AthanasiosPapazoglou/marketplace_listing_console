/**
 * Shared shapes for inventory, marketplaces and listings.
 *
 * The nullability here mirrors `data/inventory.json` exactly: brand, category,
 * condition, cost, weight and dimensions are all genuinely missing on some
 * items, so every consumer has to cope with that.
 */

export interface InventoryItem {
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  condition: string | null;
  quantity: number;
  cost_price_dkk: number | null;
  weight_kg: number | null;
  dimensions_cm: string | null;
  attributes: Record<string, string | number | boolean>;
  notes: string | null;
}

export interface Marketplace {
  id: string;
  name: string;
  title_max_chars: number;
  description_max_chars: number;
  allow_html: boolean;
  require_condition_in_title: boolean;
  banned_words: string[];
}

export interface ListingDraft {
  title: string;
  description: string;
}

/**
 * The five rules defined in `marketplaces.json`, plus two app-level sanity
 * checks (`title_required` / `description_required`) that stop an empty
 * listing being approved. The sanity checks do not come from the marketplace
 * data and are labelled as such in the UI.
 */
export type RuleId =
  | 'title_max_chars'
  | 'banned_words'
  | 'require_condition_in_title'
  | 'description_max_chars'
  | 'allow_html'
  | 'title_required'
  | 'description_required';

export type Severity = 'blocking' | 'warning';

export type ListingField = 'title' | 'description';

export interface Violation {
  ruleId: RuleId;
  severity: Severity;
  field: ListingField;
  /** Short, user-facing statement of what is wrong. */
  message: string;
  /** Optional extra context, e.g. the exact counts or the accepted wording. */
  detail?: string;
}

export interface ValidationResult {
  blocking: Violation[];
  warnings: Violation[];
  /** True only when there are no blocking violations. */
  canApprove: boolean;
}

/** A listing the user has approved. Held in memory only. */
export interface ApprovedListing {
  id: string;
  sku: string;
  itemName: string;
  marketplaceId: string;
  marketplaceName: string;
  title: string;
  description: string;
  approvedAt: string;
  /** How many generation attempts the server needed before a clean draft. */
  attempts: number;
}

/* ---------- API contract for POST /api/listings/generate ---------- */

export interface GenerateRequestBody {
  sku: string;
  marketplaceId: string;
}

/** A draft the server generated and then threw away for breaking a rule. */
export interface RejectedAttempt {
  attempt: number;
  /**
   * Only the violation messages travel to the client. The offending text is
   * deliberately never returned, so invalid copy cannot reach the user.
   */
  violations: string[];
}

export interface GenerateSuccessResponse {
  draft: ListingDraft;
  /** Attempt number that finally passed (1 = first try). */
  attempts: number;
  rejected: RejectedAttempt[];
  /** Non-blocking rule notes on the returned draft. */
  warnings: Violation[];
}

export type GenerateErrorCode =
  | 'bad_request'
  | 'unknown_item'
  | 'unknown_marketplace'
  | 'preflight_impossible'
  | 'model_unavailable'
  | 'validation_exhausted';

export interface GenerateErrorResponse {
  error: GenerateErrorCode;
  message: string;
  hint?: string;
  attempts?: number;
  rejected?: RejectedAttempt[];
}
