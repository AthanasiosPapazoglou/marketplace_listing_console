import type { Marketplace } from '@/lib/types';

/**
 * Shows the active marketplace's rules, so the user can see what they are
 * being held to while editing. The three required rules are marked as
 * blocking; the other two are advisory, per scope.
 */
export default function RulesPanel({
  marketplace,
}: {
  marketplace: Marketplace;
}) {
  const rules: { label: string; value: string; blocking: boolean }[] = [
    {
      label: 'Title limit',
      value: `${marketplace.title_max_chars} chars`,
      blocking: true,
    },
    {
      label: 'Banned words',
      value: marketplace.banned_words.join(', ') || 'none',
      blocking: true,
    },
    {
      label: 'Condition in title',
      value: marketplace.require_condition_in_title ? 'required' : 'not required',
      blocking: true,
    },
    {
      label: 'Description limit',
      value: `${marketplace.description_max_chars} chars`,
      blocking: false,
    },
    {
      label: 'HTML',
      value: marketplace.allow_html ? 'allowed' : 'not allowed',
      blocking: false,
    },
  ];

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {marketplace.name} rules
      </h2>
      <dl className="flex flex-col gap-2">
        {rules.map((rule) => (
          <div key={rule.label} className="flex items-baseline gap-2 text-sm">
            <dt className="flex items-center gap-1.5 text-zinc-500">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  rule.blocking ? 'bg-red-500' : 'bg-amber-400'
                }`}
              />
              {rule.label}
            </dt>
            <dd className="ml-auto text-right font-medium text-zinc-800 dark:text-zinc-200">
              {rule.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />{' '}
        blocks approval &nbsp;
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />{' '}
        advisory only
      </p>
    </section>
  );
}
