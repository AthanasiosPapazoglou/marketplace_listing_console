import { RULE_LABELS } from '@/lib/rules';
import type { Violation } from '@/lib/types';

const TONES = {
  blocking: {
    box: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
    chip: 'bg-red-600 text-white',
    text: 'text-red-900 dark:text-red-100',
    detail: 'text-red-700/80 dark:text-red-200/70',
  },
  warning: {
    box: 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
    chip: 'bg-amber-500 text-black',
    text: 'text-amber-900 dark:text-amber-100',
    detail: 'text-amber-800/80 dark:text-amber-200/70',
  },
} as const;

export default function ViolationList({
  violations,
  tone,
  heading,
}: {
  violations: Violation[];
  tone: keyof typeof TONES;
  heading: string;
}) {
  if (violations.length === 0) return null;

  const styles = TONES[tone];

  return (
    <div className={`rounded-md border px-3 py-2.5 ${styles.box}`}>
      <p
        className={`mb-2 text-xs font-semibold uppercase tracking-wide ${styles.text}`}
      >
        {heading} ({violations.length})
      </p>
      <ul className="flex flex-col gap-2">
        {violations.map((violation, index) => (
          <li
            key={`${violation.ruleId}-${violation.field}-${index}`}
            className="flex gap-2 text-sm"
          >
            <span
              className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.chip}`}
            >
              {RULE_LABELS[violation.ruleId]}
            </span>
            <span className={styles.text}>
              {violation.message}
              {violation.detail ? (
                <span className={`block text-xs ${styles.detail}`}>
                  {violation.detail}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
