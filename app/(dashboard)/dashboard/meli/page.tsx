import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PlusCircle, Store, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { getMeliAccountsForTeam } from '@/lib/db/queries';
import { getMeliContext } from '@/lib/meli/context';
import { getMeliAccountLimit } from '@/lib/meli/plans';
import { disconnectMeliAccount } from './actions';

const ERRORS: Record<string, string> = {
  not_owner: 'Solo los propietarios del equipo pueden gestionar las cuentas.',
  not_configured: 'La integración con MercadoLibre no está configurada.',
  no_plan: 'Necesitás una suscripción activa para conectar cuentas.',
  limit_reached: 'Alcanzaste el máximo de cuentas de tu plan.',
  denied: 'Cancelaste la autorización en MercadoLibre.',
  invalid_state: 'La solicitud expiró o no es válida. Intentá de nuevo.',
  oauth_failed: 'No pudimos completar la conexión con MercadoLibre.'
};

export default async function MeliPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const ctx = await getMeliContext();
  if (!ctx) redirect('/sign-in');

  const { error, connected } = await searchParams;
  const accounts = await getMeliAccountsForTeam(ctx.team.id);
  const limit = getMeliAccountLimit(ctx.team);
  const canAdd = ctx.isOwner && accounts.length < limit;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">
        Cuentas de MercadoLibre
      </h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {ERRORS[error] ?? 'Ocurrió un error inesperado.'}
        </p>
      )}
      {connected && (
        <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Cuenta conectada correctamente.
        </p>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Tu plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row justify-between gap-4 sm:items-center">
          <div>
            <p className="font-medium">
              {limit > 0 ? ctx.team.planName : 'Sin suscripción activa'}
            </p>
            <p className="text-sm text-muted-foreground">
              {accounts.length} de {limit}{' '}
              {limit === 1 ? 'cuenta conectada' : 'cuentas conectadas'}
            </p>
          </div>
          {limit === 0 ? (
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
              <Link href="/pricing">Ver planes</Link>
            </Button>
          ) : accounts.length >= limit && ctx.team.planName?.toLowerCase() !== 'agencia' ? (
            <Button asChild variant="outline">
              <Link href="/pricing">Mejorar a Agencia</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas conectadas</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-muted-foreground">
              Todavía no conectaste ninguna cuenta.
            </p>
          ) : (
            <ul className="space-y-4">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="rounded-full bg-yellow-100 p-2">
                      <Store className="h-5 w-5 text-yellow-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {account.nickname ?? `Cuenta ${account.meliUserId}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ID {account.meliUserId}
                        {account.siteId ? ` · ${account.siteId}` : ''}
                      </p>
                    </div>
                  </div>
                  {ctx.isOwner && (
                    <form action={disconnectMeliAccount}>
                      <input type="hidden" name="accountId" value={account.id} />
                      <Button type="submit" variant="outline" size="sm">
                        <Unplug />
                        Desconectar
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          {/* Plain <a>: this hits a route handler that sets a cookie, so it must not be prefetched. */}
          {canAdd ? (
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
              <a href="/api/meli/connect">
                <PlusCircle />
                Conectar cuenta de MercadoLibre
              </a>
            </Button>
          ) : (
            <Button disabled>
              <PlusCircle />
              Conectar cuenta de MercadoLibre
            </Button>
          )}
          {!ctx.isOwner && (
            <p className="text-sm text-muted-foreground">
              Solo los propietarios del equipo pueden conectar cuentas.
            </p>
          )}
        </CardFooter>
      </Card>
    </section>
  );
}
