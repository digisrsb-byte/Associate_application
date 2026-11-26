import {
  paymentStatusClassName,
  paymentStatusLabel,
  type PaymentStatusKind,
} from '../utils/paymentStatusUi.ts';

export function PaymentStatusBadge({
  status,
  className = '',
}: {
  status: PaymentStatusKind;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-semibold leading-none ${paymentStatusClassName(status)} ${className}`}
    >
      {paymentStatusLabel(status)}
    </span>
  );
}
