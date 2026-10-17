'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircleQuestion, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DraftEditor } from './draft-editor';
import { generateDrafts, sendDrafts, type DraftState } from './actions';
import type { SendState } from '@/lib/meli/send';

export type QuestionView = {
  id: number;
  text: string;
  dateLabel: string;
  itemId: string;
  itemTitle: string | null;
  itemThumbnail: string | null;
  itemPermalink: string | null;
  answer: { text: string; dateLabel: string; sentBy: string | null } | null;
  draft: string | null;
};

export function QuestionsBoard({
  accountId,
  questions,
  accountDraftCount,
  selectable
}: {
  accountId: number;
  questions: QuestionView[];
  accountDraftCount: number;
  selectable: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [sendState, sendAction, isSending] = useActionState<SendState, FormData>(
    sendDrafts,
    {}
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [state, formAction, isPending] = useActionState<DraftState, FormData>(
    async (prev, formData) => {
      const result = await generateDrafts(prev, formData);
      if (result.success) setSelected([]);
      return result;
    },
    {}
  );

  const toggle = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const allSelected = selected.length === questions.length;

  // What "Enviar borradores" will publish: the selected drafts, or (with no
  // selection) every draft of this account, up to 50 per click.
  const selectedWithDraft = questions.filter(
    (q) => q.draft && selected.includes(q.id)
  );
  const sendIds = selected.length ? selectedWithDraft.map((q) => q.id) : [];
  const sendCount = selected.length
    ? selectedWithDraft.length
    : Math.min(accountDraftCount, 50);
  const preview = (
    selected.length ? selectedWithDraft : questions.filter((q) => q.draft)
  ).slice(0, 10);

  const [dismissed, setDismissed] = useState<SendState | null>(null);
  const showResult = !!sendState.details && dismissed !== sendState;

  // Clear the selection once a send finishes (those drafts are gone).
  useEffect(() => {
    if (sendState.details) setSelected([]);
  }, [sendState]);

  const openDialog = () => dialogRef.current?.showModal();
  const closeDialog = () => {
    setDismissed(sendState);
    dialogRef.current?.close();
  };

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="accountId" value={accountId} />
        {selected.map((id) => (
          <input key={id} type="hidden" name="questionId" value={id} />
        ))}

      {selectable && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? [] : questions.map((q) => q.id))
              }
            />
            Seleccionar todas
          </label>
          <Button
            type="submit"
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            disabled={selected.length === 0 || isPending}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isPending
              ? 'Generando...'
              : `Generar borrador con IA${selected.length ? ` (${selected.length})` : ''}`}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sendCount === 0 || isSending}
            onClick={openDialog}
          >
            <Send />
            {`Enviar borradores (${sendCount})`}
          </Button>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.success && (
            <p className="text-sm text-green-600">{state.success}</p>
          )}
        </div>
      )}
      </form>

      <ul className="space-y-4">
        {questions.map((question) => (
          <li key={question.id}>
            <Card className="gap-3 py-4">
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  {selectable && (
                    <input
                      type="checkbox"
                      className="mt-4"
                      checked={selected.includes(question.id)}
                      onChange={() => toggle(question.id)}
                      aria-label={`Seleccionar pregunta ${question.id}`}
                    />
                  )}
                  {question.itemThumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={question.itemThumbnail}
                      alt=""
                      className="size-12 rounded object-cover"
                    />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded bg-gray-100">
                      <MessageCircleQuestion className="size-5 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    {question.itemPermalink ? (
                      <a
                        href={question.itemPermalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {question.itemTitle}
                      </a>
                    ) : (
                      <p className="truncate text-sm font-medium">
                        {question.itemTitle ?? question.itemId}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {question.itemId} · {question.dateLabel}
                    </p>
                  </div>
                </div>

                <p className="text-gray-900">{question.text}</p>

                {question.answer && (
                  <div className="rounded-md bg-gray-50 p-3 text-sm">
                    <p className="text-gray-700">{question.answer.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {question.answer.sentBy
                        ? `Enviada desde la app por ${question.answer.sentBy}`
                        : 'Respondida en MercadoLibre'}
                      {question.answer.dateLabel && ` · ${question.answer.dateLabel}`}
                    </p>
                  </div>
                )}

                {question.draft && (
                  <DraftEditor
                    // Remount when a regenerated draft replaces the old text.
                    key={question.draft}
                    accountId={accountId}
                    questionId={question.id}
                    draft={question.draft}
                  />
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setDismissed(sendState)}
        className="m-auto w-[min(90vw,40rem)] rounded-lg p-0 backdrop:bg-black/40"
      >
        <form action={sendAction} className="space-y-4 p-6">
          <input type="hidden" name="accountId" value={accountId} />
          {sendIds.map((id) => (
            <input key={id} type="hidden" name="questionId" value={id} />
          ))}

          {showResult ? (
            <>
              <h2 className="text-lg font-medium">Resultado del envío</h2>
              <p className="text-sm">
                <span className="text-green-700">{sendState.sent} enviadas</span>
                {' · '}
                {sendState.skipped} omitidas
                {' · '}
                <span className={sendState.failed ? 'text-red-600' : ''}>
                  {sendState.failed} con error
                </span>
              </p>
              <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">
                {sendState.details
                  ?.filter((d) => d.status !== 'sent')
                  .map((d) => (
                    <li key={d.questionId} className="rounded bg-gray-50 p-2">
                      <span className="font-medium">Pregunta {d.questionId}:</span>{' '}
                      {d.message}
                    </li>
                  ))}
              </ul>
              <div className="flex justify-end">
                <Button type="button" onClick={closeDialog}>
                  Cerrar
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-medium">
                Enviar {sendCount} {sendCount === 1 ? 'respuesta' : 'respuestas'} a MercadoLibre
              </h2>
              <p className="text-sm text-muted-foreground">
                Se van a publicar ahora, en lotes, a nombre de la cuenta. No se
                pueden deshacer. Se envía el texto <b>guardado</b> de cada
                borrador: guardá antes los cambios que hayas hecho.
              </p>
              {sendError(sendState) && (
                <p className="text-sm text-red-600">{sendState.error}</p>
              )}
              <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">
                {preview.map((q) => (
                  <li key={q.id} className="rounded bg-gray-50 p-2">
                    <p className="line-clamp-1 text-muted-foreground">{q.text}</p>
                    <p className="line-clamp-2">{q.draft}</p>
                  </li>
                ))}
                {sendCount > preview.length && (
                  <li className="text-muted-foreground">
                    y {sendCount - preview.length} más…
                  </li>
                )}
              </ul>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={isSending || sendCount === 0}
                >
                  {isSending ? <Loader2 className="animate-spin" /> : <Send />}
                  {isSending ? 'Enviando...' : 'Enviar ahora'}
                </Button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </div>
  );
}

const sendError = (state: SendState) => !!state.error && !state.details;
