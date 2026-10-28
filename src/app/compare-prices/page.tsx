'use client';

/**
 * Price Comparison — real products listed by sellers and dealers
 * (market_listings), compared by price, ordered with pay-after-delivery:
 * the buyer keeps the money until the goods arrive and are checked, then pays
 * the seller directly by UPI / bank (market_orders). KashRoot never holds it.
 *   Compare: farm inputs or produce, by type, search, cheapest first.
 *   My orders: the buyer's orders and the next step on each.
 *   Sell here: a seller's products, orders received and payout details.
 *
 * Browsing needs no account. Ordering or selling asks to sign in right here,
 * in a small window (SignInModal) — nobody is sent into a portal, and
 * signing in here opens no portal (each portal keeps its own sign-in). The
 * shop pieces are shared with the Buyer portal (components/market/shop).
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LogIn, LogOut, Search, ShieldCheck, ShoppingCart, Store, UserRound } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import type { KycRole } from '@/components/auth/KYCPanel';
import { ToolShell } from '@/components/layout/ToolShell';
import { OrderCard } from '@/components/market/OrderCard';
import { SellerDesk } from '@/components/market/SellerDesk';
import { ListingBrowser } from '@/components/market/shop/ListingBrowser';
import { OrderModal } from '@/components/market/shop/OrderModal';
import type { ShopListing } from '@/components/market/shop/useLiveListings';
import { Btn, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ListProductsButton, PriceComparisonHeader } from '@/components/price-comparison/PriceComparisonHeader';
import { SignInModal, type SignInReason } from '@/components/price-comparison/SignInModal';
import { portalsOf, signedInPortals } from '@/lib/auth/portalAccess';
import { MARKET_PLACES } from '@/lib/auth/roles';
import { signOutCompletely } from '@/lib/auth/session';
import { OPEN_KYC } from '@/lib/client/identityCheck';
import { loadAccount, supabase, type Account } from '@/lib/db/client';
import { buyerOrders, type MarketCategory, type MarketOrder } from '@/lib/db/market';
import { KYC_CHANGED } from '@/lib/db/security';

// The identity check is heavy: it loads only when someone needs it.
const KYCPanel = dynamic(() => import('@/components/auth/KYCPanel').then((m) => m.KYCPanel), { ssr: false });

/**
 * Which identity check this person gets, as in their portal: a farmer gets
 * the farmer's (Aadhaar only) whatever they do here; others the buyer's to
 * order and the seller's to sell.
 */
async function kycRoleFor(tab: Tab): Promise<KycRole> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  const meta = user?.user_metadata ?? {};
  const roles = [meta.role, ...(Array.isArray(meta.roles) ? meta.roles : [])];
  if (roles.includes('FARMER') || portalsOf(user)?.includes('farmer')) return 'FARMER';
  return tab === 'sell' ? 'SELLER' : 'BUYER';
}

const theme = PORTAL_THEMES.buyer;
type Tab = 'compare' | 'orders' | 'sell';

export default function ComparePricesPage() {
  return (
    <Suspense>
      <ComparePrices />
    </Suspense>
  );
}

function ComparePrices() {
  const params = useSearchParams();
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'orders' ? 'orders' : params.get('tab') === 'sell' ? 'sell' : 'compare');
  const [category, setCategory] = useState<MarketCategory>(params.get('category') === 'produce' ? 'produce' : 'supplies');
  // Came by an older "Produce" / "Supplies" link (the site's top bar had them): say where each now lives.
  const asked = params.get('category');
  // (Not when a search came with it: that is a comparison asked for, e.g. by voice — "cheapest urea".)
  const cameFor = (asked === 'produce' || asked === 'supplies') && !params.get('q') ? asked : null;
  const [ordering, setOrdering] = useState<ShopListing | null>(null);
  const [signIn, setSignIn] = useState<SignInReason | null>(null);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  // The identity check, open for this role; null while closed.
  const [kycRole, setKycRole] = useState<KycRole | null>(null);

  useEffect(() => {
    void loadAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    // "Verify now" on an error (ordering or selling before the identity check) opens the check right here.
    const openKyc = () => void kycRoleFor(tab).then(setKycRole, () => setKycRole(tab === 'sell' ? 'SELLER' : 'BUYER'));
    window.addEventListener(OPEN_KYC, openKyc);
    return () => window.removeEventListener(OPEN_KYC, openKyc);
  }, [tab]);

  const loadOrders = useCallback(async () => {
    if (!account) return;
    try {
      setOrders(await buyerOrders(account.id));
    } catch {
      setOrders([]);
    }
  }, [account]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await loadOrders();
    };
    void run();
    return () => {
      live = false;
    };
  }, [loadOrders]);

  const openOrders = account ? orders.filter((o) => ['accepted', 'shipped', 'delivered'].includes(o.status)).length : 0;
  // Signed in only here (no portal on this device): Sign out lives on this page. Otherwise it is in their portal.
  const onlyHere = Boolean(account) && signedInPortals(account!.id).length === 0;

  // Sign in only when nobody is: an account still loading is waited for first.
  const needAccount = (reason: SignInReason) => {
    if (account === undefined) void loadAccount().then((a) => (a ? setAccount(a) : setSignIn(reason)), () => setSignIn(reason));
    else if (!account) setSignIn(reason);
  };
  const order = (l: ShopListing) => {
    setOrdering(l);
    needAccount('order');
  };
  const sell = () => {
    setTab('sell');
    needAccount('sell');
  };
  const signedIn = (a: Account) => {
    setAccount(a);
    if (signIn === 'sell') setTab('sell');
    if (signIn === 'orders') setTab('orders');
    // Ordering: the order window opens next, for the product they chose.
    if (ordering?.seller_id === a.id) {
      setOrdering(null);
      toast.info('This is your own product, so you cannot order it.');
    }
    setSignIn(null);
  };
  const signOut = async () => {
    await signOutCompletely();
    setAccount(null);
    setOrders([]);
    setTab('compare');
  };

  return (
    <ToolShell tool="priceComparison" header={<PriceComparisonHeader actions={<ListProductsButton onClick={sell} />} />}>
      {cameFor && <WhereToGo cameFor={cameFor} />}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Price Comparison" className="inline-flex flex-wrap gap-1 rounded-2xl bg-white/80 p-1 shadow-sm ring-1 ring-slate-900/5">
          {([
            ['compare', 'Compare prices', Search],
            ['orders', `My orders${openOrders ? ` (${openOrders})` : ''}`, ShoppingCart],
            ['sell', 'Sell here', Store],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === id ? 'bg-sky-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-900/5'}`}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        {account && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <UserRound className="h-4 w-4 text-slate-500" aria-hidden /> Signed in as <strong>{account.name}</strong>
            {onlyHere && <Btn theme={theme} variant="ghost" icon={LogOut} className="min-h-11" onClick={() => void signOut()}>Sign out</Btn>}
          </p>
        )}
      </div>

      {tab === 'compare' && (
        <div className="space-y-5">
          <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-200">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
            <span><strong>Pay after delivery.</strong> Order now; pay the seller directly by UPI only when the goods reach you and you have checked them. KashRoot never holds your money.</span>
          </p>
          <ListingBrowser
            key={category}
            category={category}
            theme={theme}
            accountId={account?.id}
            onOrder={order}
            toolbar={
              <div role="group" aria-label="What" className="inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto sm:justify-self-start">
                {([['supplies', 'Farm inputs & supplies'], ['produce', 'Fruit & produce']] as const).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)} className={`min-h-11 flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold sm:flex-none ${category === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>{label}</button>
                ))}
              </div>
            }
            // The marketplace only shows real products listed by real people — nothing made up.
            empty={
              <EmptyState
                theme={theme}
                icon={Store}
                title={category === 'produce' ? 'No fruit or produce listed yet' : 'No farm inputs or supplies listed yet'}
                text={
                  category === 'produce'
                    ? 'KashRoot shows only real produce listed by growers — nothing made up. Be the first: list your apples, walnuts or cherries with your price, and buyers can order and pay you by UPI after delivery.'
                    : 'KashRoot shows only real products listed by dealers and sellers — nothing made up. Dealers and shops: list your fertilisers, sprays, cartons and tools with your price.'
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Btn theme={theme} icon={Store} className="min-h-11" onClick={sell}>
                      {category === 'produce' ? 'List my produce' : 'List my products'}
                    </Btn>
                    {category === 'produce' ? (
                      <Btn theme={theme} variant="soft" className="min-h-11" href="/mandi-weather">See today’s mandi prices</Btn>
                    ) : (
                      <Btn theme={theme} variant="soft" className="min-h-11" href="/supplies/tester">KashRoot TrueScan — is it genuine?</Btn>
                    )}
                  </div>
                }
              />
            }
          />
        </div>
      )}

      {tab === 'orders' && (
        account ? (
          <Panel theme={theme} title="My orders" icon={ShoppingCart}>
            {orders.length === 0 ? (
              <EmptyState theme={theme} icon={ShoppingCart} title="No orders yet" text="Order from Compare prices. You pay the seller only after the goods reach you." />
            ) : (
              <ul className="space-y-3">{orders.map((o) => <OrderCard key={o.id} order={o} as="buyer" theme={theme} onChange={() => void loadOrders()} />)}</ul>
            )}
          </Panel>
        ) : (
          <SignInPrompt text="Sign in to see your orders and the next step on each." loading={account === undefined} onSignIn={() => setSignIn('orders')} />
        )
      )}

      {tab === 'sell' && (account ? <SellerDesk account={account} theme={theme} mixed /> : <SignInPrompt text="Sign in to list your products and receive orders. Buyers pay you by UPI after delivery." loading={account === undefined} onSignIn={() => setSignIn('sell')} />)}

      {ordering && account && (
        <OrderModal listing={ordering} account={account} theme={theme} onClose={() => setOrdering(null)} onPlaced={() => { setOrdering(null); setTab('orders'); void loadOrders(); }} />
      )}

      {signIn && (
        <SignInModal
          reason={signIn}
          onClose={() => {
            setSignIn(null);
            setOrdering(null);
          }}
          onSignedIn={signedIn}
        />
      )}

      {kycRole && (
        <KYCPanel
          open
          onClose={() => setKycRole(null)}
          defaultRole={kycRole}
          // As in every portal: marked submitted (the server records what was verified).
          onComplete={() => {
            try {
              localStorage.setItem('kyc_status', 'submitted');
            } catch {
              /* private mode */
            }
            window.dispatchEvent(new Event(KYC_CHANGED));
            // Remember it on the account, so other devices don't ask again.
            void supabase.auth.updateUser({ data: { kyc_status: 'submitted' } }).catch(() => undefined);
          }}
        />
      )}
    </ToolShell>
  );
}

function SignInPrompt({ text, loading, onSignIn }: { text: string; loading: boolean; onSignIn: () => void }) {
  if (loading) return null;
  return (
    <div className="rounded-2xl bg-white/90 p-6 text-center ring-1 ring-slate-900/5">
      <p className="text-slate-700">{text}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Btn theme={theme} icon={LogIn} className="min-h-11" onClick={onSignIn}>Sign in</Btn>
      </div>
      <p className="mt-3 text-sm text-slate-600">No account yet? Press Sign in, then “Create an account”.</p>
    </div>
  );
}

/**
 * For someone who came by an older Produce / Supplies link: buying, selling and
 * farm supplies each have their own portal now. Price Comparison stays below.
 */
function WhereToGo({ cameFor }: { cameFor: 'produce' | 'supplies' }) {
  const choices = cameFor === 'produce' ? [MARKET_PLACES.buyProduce, MARKET_PLACES.sellProduce, MARKET_PLACES.farmSupplies] : [MARKET_PLACES.farmSupplies, MARKET_PLACES.buyProduce, MARKET_PLACES.sellProduce];
  return (
    <nav aria-label="Where to buy and sell" className="mb-5 rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-slate-900/5">
      <p className="text-sm font-semibold text-slate-900">{cameFor === 'produce' ? 'Buying or selling produce? Each has its own place now:' : 'Farm supplies have their own shop now:'}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {choices.map((m, i) => (
          <Link key={m.href} href={m.href} className={`flex min-h-12 flex-col justify-center rounded-xl px-4 py-2 no-underline ring-1 transition hover:no-underline ${i === 0 ? 'bg-emerald-700 text-white ring-emerald-700 hover:bg-emerald-800' : 'bg-white text-slate-900 ring-slate-200 hover:ring-emerald-300'}`}>
            <span className="text-base font-semibold">{m.label}</span>
            <span className={`text-xs ${i === 0 ? 'text-emerald-100' : 'text-slate-600'}`}>{m.where}</span>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-600">Or compare prices below, cheapest first.</p>
    </nav>
  );
}
