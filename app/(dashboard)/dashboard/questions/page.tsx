import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/db/drizzle';
import { questionDrafts } from '@/lib/db/schema';
import { getMeliAccountForTeam } from '@/lib/db/queries';
import {
  fetchMeliItems,
  MeliApiError,
  searchMeliQuestions,
  type MeliQuestionStatus
} from '@/lib/meli/api';
import { getMeliContext, selectMeliAccount } from '@/lib/meli/context';
import { getMeliAccessToken } from '@/lib/meli/tokens';
import { AccountSelector } from '../account-selector';
import { QuestionsBoard, type QuestionView } from './questions-board';

const PAGE_SIZE = 20;

const TABS: { status: MeliQuestionStatus; label: string }[] = [
  { status: 'UNANSWERED', label: 'Sin responder' },
  { status: 'ANSWERED', label: 'Respondidas' }
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

export default async function QuestionsPage({
  searchParams
}: {
  searchParams: Promise<{ account?: string; status?: string; page?: string }>;
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
        <h1 className="text-lg lg:text-2xl font-medium mb-6">Preguntas</h1>
        <Card>
          <CardContent className="flex flex-col items-start gap-4">
            <p className="text-muted-foreground">
              Conectá una cuenta de MercadoLibre para ver sus preguntas.
            </p>
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
              <Link href="/dashboard/meli">Conectar cuenta</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const status: MeliQuestionStatus =
    params.status === 'ANSWERED' ? 'ANSWERED' : 'UNANSWERED';
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);

  const href = (overrides: { status?: string; page?: number }) => {
    const q = new URLSearchParams({
      account: String(current.id),
      status: overrides.status ?? status,
      page: String(overrides.page ?? 1)
    });
    return `/dashboard/questions?${q}`;
  };

  let total = 0;
  let views: QuestionView[] = [];
  let errorMessage: string | null = null;

  try {
    const account = await getMeliAccountForTeam(current.id, ctx.team.id);
    if (!account) throw new MeliApiError('Account not found', 404);

    const token = await getMeliAccessToken(account);
    const result = await searchMeliQuestions(token, {
      sellerId: current.meliUserId,
      status,
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE
    });
    total = result.total;
    const [items, drafts] = await Promise.all([
      fetchMeliItems(
        token,
        result.questions.map((q) => q.item_id)
      ),
      result.questions.length
        ? db
            .select()
            .from(questionDrafts)
            .where(
              and(
                eq(questionDrafts.meliAccountId, current.id),
                inArray(
                  questionDrafts.meliQuestionId,
                  result.questions.map((q) => q.id)
                )
              )
            )
        : []
    ]);
    const draftByQuestion = new Map(drafts.map((d) => [d.meliQuestionId, d.draft]));

    views = result.questions.map((question) => {
      const item = items[question.item_id];
      return {
        id: question.id,
        text: question.text,
        dateLabel: formatDate(question.date_created),
        itemId: question.item_id,
        itemTitle: item?.title ?? null,
        itemThumbnail: item?.thumbnail ?? null,
        itemPermalink: item?.permalink ?? null,
        answer: question.answer
          ? {
              text: question.answer.text,
              dateLabel: formatDate(question.answer.date_created)
            }
          : null,
        draft: draftByQuestion.get(question.id) ?? null
      };
    });
  } catch (error) {
    console.error('Error loading MercadoLibre questions:', error);
    errorMessage =
      error instanceof MeliApiError && [400, 401, 403].includes(error.status)
        ? 'MercadoLibre rechazó el acceso de esta cuenta. Volvé a conectarla desde la sección MercadoLibre.'
        : 'No pudimos cargar las preguntas. Intentá de nuevo en unos minutos.';
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg lg:text-2xl font-medium">Preguntas</h1>
        {accounts.length > 1 || ctx.team.planName === 'Agencia' ? (
          <AccountSelector
            basePath="/dashboard/questions"
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

      <div className="mb-4 flex gap-2">
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

      {errorMessage ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : views.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">
              {status === 'UNANSWERED'
                ? 'No tenés preguntas sin responder. ¡Todo al día!'
                : 'Todavía no hay preguntas respondidas.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <QuestionsBoard
            // Reset selection when switching account/tab/page.
            key={`${current.id}-${status}-${page}`}
            accountId={current.id}
            questions={views}
            selectable={status === 'UNANSWERED'}
          />

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
                Página {page} de {totalPages} · {total} preguntas
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
