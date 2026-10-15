'use client';

import { useActionState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncNow, type SyncState } from './sync-actions';

export function SyncBar({
  accountId,
  kind,
  syncedAtLabel,
  lastError
}: {
  accountId: number;
  kind: 'questions' | 'items';
  syncedAtLabel: string | null;
  lastError: string | null;
}) {
  const [state, formAction, isPending] = useActionState<SyncState, FormData>(
    syncNow,
    {}
  );
  const error = state.error ?? lastError;

  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-center gap-3">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="kind" value={kind} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Sincronizar
      </Button>
      <span className="text-sm text-muted-foreground">
        {syncedAtLabel ? `Última sincronización: ${syncedAtLabel}` : 'Sin sincronizar todavía'}
      </span>
      {error && <span className="text-sm text-red-600">{error}</span>}
      {state.success && !error && (
        <span className="text-sm text-green-600">{state.success}</span>
      )}
    </form>
  );
}
