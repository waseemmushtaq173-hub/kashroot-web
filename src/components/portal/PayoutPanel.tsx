'use client';

/**
 * Escrow payout account form + current destination, shared by every portal
 * that receives money. Only the account's last four digits are stored.
 */
import { useState } from 'react';
import { Banknote, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Btn, EmptyState, Field, INPUT, Panel, type PortalTheme } from '@/components/portal/kit';
import { formatAccountNumber, formatIfsc, isValidAccountNumber, isValidIfsc } from '@/lib/kyc/validators';
import { usePersistentState } from '@/lib/portal-store';

interface Payout {
  holder: string;
  ifsc: string;
  last4: string;
  upi: string;
}

const NO_PAYOUT: Payout | null = null;
const EMPTY_BANK = { holder: '', account: '', ifsc: '', upi: '' };

export function PayoutPanel({ theme, storageKey }: { theme: PortalTheme; storageKey: string }) {
  const [payout, setPayout] = usePersistentState<Payout | null>(storageKey, NO_PAYOUT);
  const [bank, setBank] = useState(EMPTY_BANK);

  const save = () => {
    const account = formatAccountNumber(bank.account);
    const ifsc = formatIfsc(bank.ifsc);
    if (!bank.holder.trim()) return toast.error('Enter the account holder name.');
    if (!isValidAccountNumber(account)) return toast.error('Account numbers are 9 to 18 digits.');
    if (!isValidIfsc(ifsc)) return toast.error('IFSC is 11 characters, e.g. ABCD0123456.');
    setPayout({ holder: bank.holder.trim(), ifsc, last4: account.slice(-4), upi: bank.upi.trim() });
    setBank(EMPTY_BANK);
    toast.success('Payout details saved');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel theme={theme} title="Escrow payout account" icon={Banknote}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label="Account holder name">
            <input className={INPUT} value={bank.holder} onChange={(e) => setBank({ ...bank, holder: e.target.value })} placeholder="As per bank records" />
          </Field>
          <Field label="Account number" hint="9 to 18 digits. Only the last four are kept here.">
            <input className={INPUT} inputMode="numeric" value={bank.account} onChange={(e) => setBank({ ...bank, account: formatAccountNumber(e.target.value) })} placeholder="Enter account number" />
          </Field>
          <Field label="IFSC code">
            <input className={`${INPUT} uppercase tracking-widest`} value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: formatIfsc(e.target.value) })} placeholder="ABCD0123456" />
          </Field>
          <Field label="UPI ID (optional)">
            <input className={INPUT} value={bank.upi} onChange={(e) => setBank({ ...bank, upi: e.target.value })} placeholder="name@bank" />
          </Field>
          <Btn theme={theme} type="submit" icon={ShieldCheck}>Save payout account</Btn>
        </form>
      </Panel>
      <Panel theme={theme} title="Current payout destination" icon={ShieldCheck}>
        {payout ? (
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Holder</dt><dd className="font-semibold">{payout.holder}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Account</dt><dd className="font-semibold tabular-nums">•••• {payout.last4}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">IFSC</dt><dd className="font-semibold">{payout.ifsc}</dd></div>
            {payout.upi && <div className="flex justify-between"><dt className="text-slate-500">UPI</dt><dd className="font-semibold">{payout.upi}</dd></div>}
            <Btn theme={theme} variant="danger" size="sm" className="mt-2 justify-self-start" onClick={() => { setPayout(null); toast.success('Payout account removed'); }}>
              Remove account
            </Btn>
          </dl>
        ) : (
          <EmptyState theme={theme} icon={Banknote} title="No payout account yet" text="Add a bank account so escrow can release your money automatically." />
        )}
      </Panel>
    </div>
  );
}
