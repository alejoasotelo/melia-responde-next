'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteDraft, saveDraft } from './actions';

export function DraftEditor({
  accountId,
  questionId,
  draft
}: {
  accountId: number;
  questionId: number;
  draft: string;
}) {
  const [text, setText] = useState(draft);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dirty = text !== draft;

  const buildForm = () => {
    const fd = new FormData();
    fd.set('accountId', String(accountId));
    fd.set('questionId', String(questionId));
    fd.set('draft', text);
    return fd;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context / permissions)
    }
  };

  return (
    <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
      <p className="mb-2 text-xs font-medium text-orange-700">
        Borrador generado con IA
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
        aria-label="Borrador de respuesta"
        className="w-full rounded-md border bg-white p-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white"
          disabled={!dirty || !text.trim() || isPending}
          onClick={() => startTransition(() => saveDraft(buildForm()))}
        >
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => startTransition(() => deleteDraft(buildForm()))}
        >
          <Trash2 />
          Descartar
        </Button>
      </div>
    </div>
  );
}
