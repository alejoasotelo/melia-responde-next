'use client';

import { useActionState, useState } from 'react';
import { Loader2, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DraftEditor } from './draft-editor';
import { generateDrafts, type DraftState } from './actions';

export type QuestionView = {
  id: number;
  text: string;
  dateLabel: string;
  itemId: string;
  itemTitle: string | null;
  itemThumbnail: string | null;
  itemPermalink: string | null;
  answer: { text: string; dateLabel: string } | null;
  draft: string | null;
};

export function QuestionsBoard({
  accountId,
  questions,
  selectable
}: {
  accountId: number;
  questions: QuestionView[];
  selectable: boolean;
}) {
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

  return (
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
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.success && (
            <p className="text-sm text-green-600">{state.success}</p>
          )}
        </div>
      )}

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
                      Respondida el {question.answer.dateLabel}
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
    </form>
  );
}
