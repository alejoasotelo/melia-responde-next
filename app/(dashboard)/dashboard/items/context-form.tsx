'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveItemContext, type ContextState } from './actions';
import { MAX_CONTEXT_LENGTH } from './constants';

export function ContextForm({
  accountId,
  itemId,
  context
}: {
  accountId: number;
  itemId: string;
  context: string;
}) {
  const [state, formAction, isPending] = useActionState<ContextState, FormData>(
    saveItemContext,
    {}
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="itemId" value={itemId} />
      <label htmlFor={`context-${itemId}`} className="text-sm font-medium">
        Contexto extra para la IA
      </label>
      <textarea
        id={`context-${itemId}`}
        name="context"
        defaultValue={context}
        rows={3}
        maxLength={MAX_CONTEXT_LENGTH}
        placeholder="Ej: Hacemos envíos a todo el país en 24 hs. No aceptamos cambios por talle. Retiro en Palermo de 9 a 18."
        className="w-full rounded-md border bg-white p-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white"
          disabled={isPending}
        >
          {isPending && <Loader2 className="animate-spin" />}
          Guardar
        </Button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.success && !isPending && (
          <p className="text-sm text-green-600">{state.success}</p>
        )}
      </div>
    </form>
  );
}
