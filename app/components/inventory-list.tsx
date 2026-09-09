import type { ApprovedListing, InventoryItem, Marketplace } from '@/lib/types';

/**
 * The warehouse feed. Every field except sku/name/quantity can be null in the
 * source data, so everything here is rendered defensively.
 */
export default function InventoryList({
  inventory,
  marketplace,
  selectedSku,
  approved,
  onSelect,
}: {
  inventory: InventoryItem[];
  marketplace: Marketplace;
  selectedSku: string | null;
  approved: ApprovedListing[];
  onSelect: (sku: string) => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-baseline justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Inventory
        </h2>
        <span className="text-xs text-zinc-500">{inventory.length} items</span>
      </header>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {inventory.map((item) => {
          const isSelected = item.sku === selectedSku;
          const isApproved = approved.some(
            (listing) =>
              listing.sku === item.sku &&
              listing.marketplaceId === marketplace.id,
          );

          return (
            <li key={item.sku}>
              <button
                type="button"
                onClick={() => onSelect(item.sku)}
                aria-current={isSelected}
                className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/40'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[11px] text-zinc-500">
                    {item.sku}
                  </span>
                  {isApproved ? (
                    <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Approved
                    </span>
                  ) : null}
                </div>

                <span className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                  {item.name}
                </span>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                  <ConditionBadge condition={item.condition} />
                  {item.brand ? <span>{item.brand}</span> : null}
                  {item.category ? <span>&middot; {item.category}</span> : null}
                  <span>&middot; qty {item.quantity}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConditionBadge({ condition }: { condition: string | null }) {
  if (!condition) {
    return (
      <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
        no condition
      </span>
    );
  }

  const primary = condition.toLowerCase().split(/\s*[-–—/]\s*/)[0];
  const palette: Record<string, string> = {
    new: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
    used: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
    returned:
      'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
    damaged: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  };

  return (
    <span
      className={`rounded px-1.5 py-0.5 font-medium ${
        palette[primary] ??
        'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
      }`}
    >
      {condition}
    </span>
  );
}
