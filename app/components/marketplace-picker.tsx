import type { Marketplace } from '@/lib/types';

export default function MarketplacePicker({
  marketplaces,
  selectedId,
  onSelect,
}: {
  marketplaces: Marketplace[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Marketplace
      </span>
      <div
        role="radiogroup"
        aria-label="Target marketplace"
        className="flex flex-wrap gap-1.5"
      >
        {marketplaces.map((marketplace) => {
          const active = marketplace.id === selectedId;
          return (
            <button
              key={marketplace.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(marketplace.id)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
              }`}
            >
              {marketplace.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
