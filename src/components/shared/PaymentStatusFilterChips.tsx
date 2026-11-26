import {
  paymentStatusLabel,
  type PaymentStatusFilter,
  type PaymentStatusKind,
} from '../../utils/paymentStatusUi.ts';

const KINDS: PaymentStatusKind[] = [
  'paid',
  'partial',
  'pending',
  'no-billing',
];

export function PaymentStatusFilterChips({
  value,
  onChange,
}: {
  value: PaymentStatusFilter;
  onChange: (v: PaymentStatusFilter) => void;
}) {
  const chips: { id: PaymentStatusFilter; label: string }[] = [
    { id: 'all', label: 'All statuses' },
    ...KINDS.map((id) => ({ id, label: paymentStatusLabel(id) })),
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Payment status filter"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.id)}
          aria-pressed={value === chip.id}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors border ${
            value === chip.id
              ? 'bg-[var(--navy-900)] text-white border-[var(--navy-900)]'
              : 'bg-[var(--card)] text-[var(--muted)] border-[var(--line)] hover:bg-[var(--frost-100)] hover:text-[var(--ink)]'
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
