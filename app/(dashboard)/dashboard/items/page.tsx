import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, count, desc, eq, ilike, inArray } from 'drizzle-orm';
import { Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/db/drizzle';
import { meliItemContexts, meliItems } from '@/lib/db/schema';
import { getMeliAccountForTeam } from '@/lib/db/queries';
import { getMeliContext, selectMeliAccount } from '@/lib/meli/context';
import { ensureFresh } from '@/lib/meli/sync';
import { AccountSelector } from '../account-selector';
import { SyncBar } from '../sync-bar';
import { ContextForm } from './context-form';

type ItemStatus = 'active' | 'paused';

const PAGE_SIZE = 20;

const TABS: { status: ItemStatus; label: string }[] = [
  { status: 'active', label: 'Activas' },
  { status: 'paused', label: 'Pausadas' }
];

export default async function ItemsPage({
  searchParams
}: {
  searchParams: Promise<{
    account?: string;
    status?: string;
    page?: string;
    q?: string;
  }>;
}) {
  const ctx = await getMeliContext();
  if (!ctx) redirect('/sign-in');

  const params = await searchParams;
  const { accounts, current } = await selectMeliAccount(
    ctx.team.id,
    params.account
  );

  if (!current) {
    return (
      <section className="flex-1 p-4 lg:p-8">
        <h1 className="text-lg lg:text-2xl font-medium mb-6">Publicaciones</h1>
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <p className="text-muted-foreground">
              Conectá una cuenta de MercadoLibre para ver sus publicaciones.
            </p>
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
              <Link href="/dashboard/meli">Conectar cuenta</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const status: ItemStatus = params.status === 'paused' ? 'paused' : 'active';
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const q = params.q?.trim().slice(0, 100) || '';

  const href = (overrides: { status?: string; page?: number }) => {
    const query = new URLSearchParams({
      account: String(current.id),
      status: overrides.status ?? status,
      page: String(overrides.page ?? 1)
    });
    if (q) query.set('q', q);
    return `/dashboard/items?${query}`;
  };

  const account = await getMeliAccountForTeam(current.id, ctx.team.id);
  if (!account) redirect('/dashboard/meli');
  await ensureFresh(account, 'items');
  const fresh = (await getMeliAccountForTeam(current.id, ctx.team.id)) ?? account;

  const where = and(
    eq(meliItems.meliAccountId, current.id),
    eq(meliItems.status, status),
    q ? ilike(meliItems.title, `%${q}%`) : undefined
  );
  const [[{ total }], items] = await Promise.all([
    db.select({ total: count() }).from(meliItems).where(where),
    db
      .select()
      .from(meliItems)
      .where(where)
      .orderBy(desc(meliItems.syncedAt), meliItems.title)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
  ]);
  const contextRows = items.length
    ? await db
        .select()
        .from(meliItemContexts)
        .where(
          and(
            eq(meliItemContexts.meliAccountId, current.id),
            inArray(
              meliItemContexts.itemId,
              items.map((i) => i.itemId)
            )
          )
        )
    : [];
  const contexts = new Map(contextRows.map((r) => [r.itemId, r.context]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg lg:text-2xl font-medium">Publicaciones</h1>
        {accounts.length > 1 || ctx.team.planName === 'Agencia' ? (
          <AccountSelector
            basePath="/dashboard/items"
            currentId={current.id}
            accounts={accounts.map((a) => ({
              id: a.id,
              label: a.nickname ?? `Cuenta ${a.meliUserId}`
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Cuenta: {current.nickname ?? current.meliUserId}
          </p>
        )}
      </div>

      <SyncBar
        accountId={current.id}
        kind="items"
        syncedAtLabel={
          fresh.itemsSyncedAt
            ? fresh.itemsSyncedAt.toLocaleString('es-AR', {
                dateStyle: 'short',
                timeStyle: 'short'
              })
            : null
        }
        lastError={fresh.lastSyncError}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <Button
              key={tab.status}
              asChild
              size="sm"
              variant={tab.status === status ? 'secondary' : 'ghost'}
            >
              <Link href={href({ status: tab.status })}>{tab.label}</Link>
            </Button>
          ))}
        </div>
        <form action="/dashboard/items" className="flex gap-2">
          <input type="hidden" name="account" value={current.id} />
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por título"
            aria-label="Buscar publicaciones"
            className="h-9 w-full sm:w-64 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search />
            Buscar
          </Button>
        </form>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">
              {q
                ? 'No encontramos publicaciones con esa búsqueda.'
                : 'No hay publicaciones en este estado.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.itemId}>
                <Card className="gap-3 py-4">
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      {item.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="size-14 rounded object-cover"
                        />
                      ) : (
                        <div className="flex size-14 items-center justify-center rounded bg-gray-100">
                          <Package className="size-5 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        {item.permalink ? (
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block font-medium hover:underline"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <p className="font-medium">{item.title}</p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {item.itemId}
                          {item.price != null &&
                            ` · ${item.currencyId ?? ''} ${Number(item.price).toLocaleString('es-AR')}`}
                          {item.availableQuantity != null &&
                            ` · Stock: ${item.availableQuantity}`}
                        </p>
                      </div>
                    </div>
                    <ContextForm
                      accountId={current.id}
                      itemId={item.itemId}
                      context={contexts.get(item.itemId) ?? ''}
                    />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <Button asChild variant="outline" size="sm">
                <Link
                  href={href({ page: page - 1 })}
                  aria-disabled={page <= 1}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                >
                  Anterior
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages} · {total} publicaciones
              </span>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={href({ page: page + 1 })}
                  aria-disabled={page >= totalPages}
                  className={
                    page >= totalPages ? 'pointer-events-none opacity-50' : ''
                  }
                >
                  Siguiente
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
