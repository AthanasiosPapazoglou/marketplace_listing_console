import ViolationList from './violation-list';
import type {
  InventoryItem,
  ListingDraft,
  Marketplace,
  RejectedAttempt,
  ValidationResult,
} from '@/lib/types';

export type EditorStatus = 'idle' | 'generating' | 'ready' | 'failed';

export interface GenerationMeta {
  attempts: number;
  rejected: RejectedAttempt[];
}

export interface FailureInfo {
  code: string;
  message: string;
  hint?: string;
  rejected: RejectedAttempt[];
}

export default function ListingEditor({
  item,
  marketplace,
  status,
  draft,
  validation,
  meta,
  failure,
  onGenerate,
  onRegenerate,
  onTitleChange,
  onDescriptionChange,
  onApprove,
  onDiscard,
}: {
  item: InventoryItem | null;
  marketplace: Marketplace;
  status: EditorStatus;
  draft: ListingDraft | null;
  validation: ValidationResult | null;
  meta: GenerationMeta | null;
  failure: FailureInfo | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  if (!item) {
    return (
      <Panel>
        <EmptyState
          title="Pick an inventory item"
          body={`Choose an item on the left, then generate a listing for ${marketplace.name}.`}
        />
      </Panel>
    );
  }

  const titleViolations =
    validation?.blocking.filter((v) => v.field === 'title') ?? [];
  const descriptionViolations =
    validation?.blocking.filter((v) => v.field === 'description') ?? [];

  return (
    <Panel>
      <header className="mb-4 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[11px] text-zinc-500">{item.sku}</span>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {marketplace.name}
          </span>
          <StatusChip status={status} />
        </div>
        <h2 className="mt-1 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
          {item.name}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Condition: {item.condition ?? 'not recorded'}
        </p>
      </header>

      {status === 'idle' ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No draft yet for this item on {marketplace.name}.
          </p>
          <PrimaryButton onClick={onGenerate}>Generate listing</PrimaryButton>
        </div>
      ) : null}

      {status === 'generating' ? <GeneratingState /> : null}

      {status === 'failed' && failure ? (
        <FailedState failure={failure} onRetry={onGenerate} />
      ) : null}

      {status === 'ready' && draft && validation ? (
        <div className="flex flex-col gap-4">
          {meta ? <AttemptSummary meta={meta} /> : null}

          <Field
            label="Title"
            invalid={titleViolations.length > 0}
            counter={
              <Counter
                length={draft.title.length}
                max={marketplace.title_max_chars}
              />
            }
          >
            <input
              type="text"
              value={draft.title}
              onChange={(event) => onTitleChange(event.target.value)}
              className={inputClasses(titleViolations.length > 0)}
            />
          </Field>

          <Field
            label="Description"
            invalid={descriptionViolations.length > 0}
            counter={
              <Counter
                length={draft.description.length}
                max={marketplace.description_max_chars}
              />
            }
          >
            <textarea
              rows={8}
              value={draft.description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              className={`${inputClasses(
                descriptionViolations.length > 0,
              )} resize-y leading-relaxed`}
            />
          </Field>

          <ViolationList
            violations={validation.blocking}
            tone="blocking"
            heading="Blocks approval"
          />
          <ViolationList
            violations={validation.warnings}
            tone="warning"
            heading="Advisory"
          />

          {validation.canApprove ? (
            <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100">
              Passes all {marketplace.name} rules and can be approved.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <PrimaryButton onClick={onApprove} disabled={!validation.canApprove}>
              Approve listing
            </PrimaryButton>
            <SecondaryButton onClick={onRegenerate}>Regenerate</SecondaryButton>
            <SecondaryButton onClick={onDiscard}>Discard draft</SecondaryButton>
            {!validation.canApprove ? (
              <span className="text-xs text-red-700 dark:text-red-300">
                Approval is blocked by {validation.blocking.length} rule
                {validation.blocking.length === 1 ? '' : 's'} above.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {children}
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

function StatusChip({ status }: { status: EditorStatus }) {
  const map: Record<EditorStatus, { label: string; className: string }> = {
    idle: { label: 'no draft', className: 'bg-zinc-200 text-zinc-700' },
    generating: { label: 'generating', className: 'bg-blue-600 text-white' },
    ready: { label: 'draft ready', className: 'bg-green-600 text-white' },
    failed: { label: 'failed', className: 'bg-red-600 text-white' },
  };
  const { label, className } = map[status];

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

function GeneratingState() {
  return (
    <div
      role="status"
      className="flex items-center gap-3 py-10 text-sm text-zinc-600 dark:text-zinc-400"
    >
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600"
      />
      Generating, checking against the rules, and retrying if the draft breaks
      them...
    </div>
  );
}

function FailedState({
  failure,
  onRetry,
}: {
  failure: FailureInfo;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2.5 dark:border-red-900 dark:bg-red-950/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-900 dark:text-red-100">
          Generation failed &middot; {failure.code}
        </p>
        <p className="mt-1 text-sm text-red-900 dark:text-red-100">
          {failure.message}
        </p>
        {failure.hint ? (
          <p className="mt-1 text-xs text-red-700/80 dark:text-red-200/70">
            {failure.hint}
          </p>
        ) : null}
      </div>

      {failure.rejected.length > 0 ? (
        <RejectedDetails rejected={failure.rejected} />
      ) : null}

      <div>
        <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
      </div>
    </div>
  );
}

function AttemptSummary({ meta }: { meta: GenerationMeta }) {
  const discarded = meta.rejected.length;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
      {discarded === 0 ? (
        <span>Passed the server-side rule check on the first attempt.</span>
      ) : (
        <span>
          Server discarded {discarded} draft
          {discarded === 1 ? '' : 's'} for breaking the rules, then returned a
          compliant one on attempt {meta.attempts}.
        </span>
      )}
      {discarded > 0 ? <RejectedDetails rejected={meta.rejected} /> : null}
    </div>
  );
}

function RejectedDetails({ rejected }: { rejected: RejectedAttempt[] }) {
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
        Why they were rejected
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1 pl-1">
        {rejected.map((attempt) => (
          <li key={attempt.attempt} className="text-xs text-zinc-500">
            <span className="font-mono">#{attempt.attempt}</span>{' '}
            {attempt.violations.join(' ')}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] italic text-zinc-400">
        The rejected copy itself is never sent to the browser.
      </p>
    </details>
  );
}

function Field({
  label,
  invalid,
  counter,
  children,
}: {
  label: string;
  invalid: boolean;
  counter: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${
            invalid ? 'text-red-700 dark:text-red-300' : 'text-zinc-500'
          }`}
        >
          {label}
        </span>
        {counter}
      </span>
      {children}
    </label>
  );
}

function Counter({ length, max }: { length: number; max: number }) {
  const over = length > max;
  return (
    <span
      className={`font-mono text-[11px] ${
        over ? 'font-bold text-red-600' : 'text-zinc-500'
      }`}
    >
      {length}/{max}
    </span>
  );
}

function inputClasses(invalid: boolean): string {
  return `w-full rounded-md border px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 dark:bg-zinc-950 dark:text-zinc-100 ${
    invalid
      ? 'border-red-400 focus:ring-red-200 dark:border-red-800'
      : 'border-zinc-300 focus:ring-blue-200 dark:border-zinc-700'
  }`;
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
    >
      {children}
    </button>
  );
}
