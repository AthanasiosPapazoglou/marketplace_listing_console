import type { ApprovedListing } from '@/lib/types';

/**
 * Approved listings, held in memory only — a refresh clears them, which is in
 * scope per the brief.
 */
export default function ApprovedListings({
  listings,
  onRemove,
}: {
  listings: ApprovedListing[];
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-baseline justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Approved listings
        </h2>
        <span className="text-xs text-zinc-500">
          {listings.length} approved &middot; in memory only
        </span>
      </header>

      {listings.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">
          Nothing approved yet. A listing can only be approved once it passes
          every blocking rule for its marketplace.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {listings.map((listing) => (
            <li key={listing.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {listing.marketplaceName}
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  {listing.sku}
                </span>
                <span className="text-[11px] text-zinc-400">
                  approved{' '}
                  {new Date(listing.approvedAt).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  {listing.attempts > 1
                    ? ` · ${listing.attempts} generation attempts`
                    : null}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(listing.id)}
                  className="ml-auto text-xs text-zinc-500 underline decoration-dotted hover:text-red-600"
                >
                  Remove
                </button>
              </div>

              <p className="mt-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {listing.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {listing.description}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
