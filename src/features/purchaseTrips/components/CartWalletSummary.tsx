import { ShoppingCart, Wallet } from "lucide-react";
import { formatInr } from "@/lib/money";

interface Props {
  /** Σ per-leg planned purchase spend. */
  cartPaise: number;
  /** The owner's rough goods budget (planned_budget). */
  budgetPaise: number | null;
  /** Estimated trip expenses (travel/lodging/…). */
  expensesPaise: number;
}

/**
 * Trip-level planning readout, shown above the title (right-aligned). Plain calculated
 * values — no border, no highlight: the "cart" (planned purchases) and the "wallet"
 * (cash to carry = cart + estimated expenses).
 */
export function CartWalletSummary({ cartPaise, budgetPaise, expensesPaise }: Props) {
  const walletPaise = cartPaise + expensesPaise;
  const diff = budgetPaise == null ? null : budgetPaise - cartPaise;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1.5 text-fg-muted">
        <ShoppingCart className="h-4 w-4" />
        Cart
        <span className="font-medium text-fg">{formatInr(cartPaise)}</span>
        {diff != null && diff < 0 && (
          <span className="text-fg-muted">({formatInr(-diff)} over)</span>
        )}
      </span>
      <span className="inline-flex items-center gap-1.5 text-fg-muted">
        <Wallet className="h-4 w-4" />
        Cash to carry
        <span className="font-medium text-fg">{formatInr(walletPaise)}</span>
      </span>
    </div>
  );
}
