/**
 * POST /api/listings/generate
 *
 * Generates a listing for one inventory item on one marketplace.
 *
 * The contract that matters: a draft breaking any blocking rule NEVER leaves
 * this route. Every generation is validated server-side with the same
 * `lib/rules.ts` the browser uses; a failing draft is discarded and the model
 * is called again, repeatedly, until a clean draft appears or the attempt
 * budget runs out. Only violation *messages* from discarded attempts are
 * returned — never the offending copy.
 */

import { findItem, findMarketplace } from '@/lib/data';
import { ModelUnavailableError, generateListing } from '@/lib/generator';
import { canEverSatisfy, validateListing } from '@/lib/rules';
import type {
  GenerateErrorResponse,
  GenerateSuccessResponse,
  RejectedAttempt,
} from '@/lib/types';

/**
 * Upper bound on the retry loop. The brief asks for "regenerate until valid";
 * a cap is what keeps a misbehaving generator from hanging the request, and it
 * degrades into the required "failed" state instead.
 */
const MAX_ATTEMPTS = 10;

function fail(body: GenerateErrorResponse, status: number) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(
      { error: 'bad_request', message: 'Request body must be JSON.' },
      400,
    );
  }

  const { sku, marketplaceId } = (payload ?? {}) as Record<string, unknown>;

  if (typeof sku !== 'string' || typeof marketplaceId !== 'string') {
    return fail(
      {
        error: 'bad_request',
        message: 'Both "sku" and "marketplaceId" are required.',
      },
      400,
    );
  }

  const item = findItem(sku);
  if (!item) {
    return fail(
      { error: 'unknown_item', message: `No inventory item with SKU ${sku}.` },
      404,
    );
  }

  const marketplace = findMarketplace(marketplaceId);
  if (!marketplace) {
    return fail(
      {
        error: 'unknown_marketplace',
        message: `No marketplace with id ${marketplaceId}.`,
      },
      404,
    );
  }

  // Fail fast when no possible listing could pass, rather than burning the
  // whole attempt budget to reach a vague error.
  const satisfiable = canEverSatisfy(item, marketplace);
  if (!satisfiable.ok) {
    return fail(
      {
        error: 'preflight_impossible',
        message: satisfiable.reason,
        hint: satisfiable.hint,
      },
      422,
    );
  }

  const rejected: RejectedAttempt[] = [];
  const baseSeed = Math.floor(Math.random() * 1_000_000_000);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let draft;
    try {
      // Swap this call for a real model client and nothing below changes.
      draft = await generateListing(item, marketplace, {
        seed: baseSeed + attempt,
      });
    } catch (error) {
      if (error instanceof ModelUnavailableError) {
        return fail(
          {
            error: 'model_unavailable',
            message: error.message,
            hint: 'Transient generator failure. Try again.',
            attempts: attempt,
            rejected,
          },
          502,
        );
      }
      throw error;
    }

    const result = validateListing(draft, item, marketplace);

    if (result.canApprove) {
      const body: GenerateSuccessResponse = {
        draft,
        attempts: attempt,
        rejected,
        warnings: result.warnings,
      };
      return Response.json(body);
    }

    // Broke a rule: keep the reasons, throw the text away, generate again.
    rejected.push({
      attempt,
      violations: result.blocking.map((violation) => violation.message),
    });
  }

  return fail(
    {
      error: 'validation_exhausted',
      message: `Could not produce a compliant listing for ${marketplace.name} in ${MAX_ATTEMPTS} attempts.`,
      hint: 'Every draft broke a rule and was discarded. Try again, or edit a draft by hand.',
      attempts: MAX_ATTEMPTS,
      rejected,
    },
    502,
  );
}
