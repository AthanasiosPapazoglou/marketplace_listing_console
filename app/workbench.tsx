'use client';

import { useMemo, useState } from 'react';
import ApprovedListings from './components/approved-listings';
import InventoryList from './components/inventory-list';
import ListingEditor, {
  type EditorStatus,
  type FailureInfo,
  type GenerationMeta,
} from './components/listing-editor';
import MarketplacePicker from './components/marketplace-picker';
import RulesPanel from './components/rules-panel';
import { validateListing } from '@/lib/rules';
import type {
  ApprovedListing,
  GenerateErrorResponse,
  GenerateSuccessResponse,
  InventoryItem,
  ListingDraft,
  Marketplace,
} from '@/lib/types';

export default function Workbench({
  inventory,
  marketplaces,
}: {
  inventory: InventoryItem[];
  marketplaces: Marketplace[];
}) {
  const [marketplaceId, setMarketplaceId] = useState(marketplaces[0].id);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [status, setStatus] = useState<EditorStatus>('idle');
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [failure, setFailure] = useState<FailureInfo | null>(null);
  const [approved, setApproved] = useState<ApprovedListing[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const marketplace =
    marketplaces.find((entry) => entry.id === marketplaceId) ?? marketplaces[0];
  const item = selectedSku
    ? inventory.find((entry) => entry.sku === selectedSku) ?? null
    : null;

  /**
   * Live validation using the exact same function the API route runs before it
   * will hand a draft over. Recomputed on every keystroke, and on every
   * marketplace switch — so an edit that breaks a rule, or a draft that was
   * legal on DBA but is not on eBay, is flagged immediately.
   */
  const validation = useMemo(
    () => (draft && item ? validateListing(draft, item, marketplace) : null),
    [draft, item, marketplace],
  );

  function resetDraft() {
    setDraft(null);
    setMeta(null);
    setFailure(null);
    setStatus('idle');
  }

  function selectItem(sku: string) {
    if (sku === selectedSku) return;
    setSelectedSku(sku);
    setNotice(null);
    resetDraft();
  }

  function selectMarketplace(id: string) {
    setMarketplaceId(id);
    setNotice(null);
    // A draft is kept on purpose so its violations are re-evaluated against the
    // new marketplace. A failed generation is specific to the old target, so
    // that gets cleared.
    if (status === 'failed') resetDraft();
  }

  async function generate() {
    if (!selectedSku) return;

    setStatus('generating');
    setFailure(null);
    setNotice(null);

    try {
      const response = await fetch('/api/listings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: selectedSku, marketplaceId }),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        const error = body as GenerateErrorResponse;
        setDraft(null);
        setMeta(null);
        setFailure({
          code: error.error ?? 'unknown',
          message: error.message ?? 'Generation failed.',
          hint: error.hint,
          rejected: error.rejected ?? [],
        });
        setStatus('failed');
        return;
      }

      const success = body as GenerateSuccessResponse;
      setDraft(success.draft);
      setMeta({ attempts: success.attempts, rejected: success.rejected });
      setStatus('ready');
    } catch {
      setDraft(null);
      setMeta(null);
      setFailure({
        code: 'network_error',
        message: 'Could not reach the listing API.',
        hint: 'Check that the dev server is still running, then try again.',
        rejected: [],
      });
      setStatus('failed');
    }
  }

  function approve() {
    if (!item || !draft) return;

    // Belt and braces: the button is disabled, and the handler refuses too.
    const result = validateListing(draft, item, marketplace);
    if (!result.canApprove) {
      setNotice('That listing still breaks a rule, so it cannot be approved.');
      return;
    }

    const id = `${item.sku}:${marketplace.id}`;
    if (approved.some((listing) => listing.id === id)) {
      setNotice(
        `${item.sku} is already approved for ${marketplace.name}. Remove it below to replace it.`,
      );
      return;
    }

    setApproved((previous) => [
      {
        id,
        sku: item.sku,
        itemName: item.name,
        marketplaceId: marketplace.id,
        marketplaceName: marketplace.name,
        title: draft.title,
        description: draft.description,
        approvedAt: new Date().toISOString(),
        attempts: meta?.attempts ?? 1,
      },
      ...previous,
    ]);

    setNotice(`Approved ${item.sku} for ${marketplace.name}.`);
    setSelectedSku(null);
    resetDraft();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Listing workbench
          </h1>
          <p className="text-sm text-zinc-500">
            Turn warehouse inventory into marketplace listings. Rules are
            enforced on the server before a draft is returned, and again here on
            every keystroke.
          </p>
        </div>
        <MarketplacePicker
          marketplaces={marketplaces}
          selectedId={marketplaceId}
          onSelect={selectMarketplace}
        />
      </header>

      {notice ? (
        <p
          role="status"
          className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100"
        >
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <RulesPanel marketplace={marketplace} />
          <InventoryList
            inventory={inventory}
            marketplace={marketplace}
            selectedSku={selectedSku}
            approved={approved}
            onSelect={selectItem}
          />
        </div>

        <div className="flex flex-col gap-4">
          <ListingEditor
            item={item}
            marketplace={marketplace}
            status={status}
            draft={draft}
            validation={validation}
            meta={meta}
            failure={failure}
            onGenerate={generate}
            onRegenerate={generate}
            onTitleChange={(title) =>
              setDraft((current) => (current ? { ...current, title } : current))
            }
            onDescriptionChange={(description) =>
              setDraft((current) =>
                current ? { ...current, description } : current,
              )
            }
            onApprove={approve}
            onDiscard={resetDraft}
          />
          <ApprovedListings
            listings={approved}
            onRemove={(id) =>
              setApproved((previous) =>
                previous.filter((listing) => listing.id !== id),
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
