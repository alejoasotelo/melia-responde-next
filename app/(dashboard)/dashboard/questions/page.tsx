import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getMeliAccountForTeam, getMeliAccountsForTeam } from '@/lib/db/queries';
import {
  fetchMeliItems,
  MeliApiError,
  searchMeliQuestions,
  type MeliQuestionStatus
} from '@/lib/meli/api';
import { getMeliContext } from '@/lib/meli/context';
import { getMeliAccessToken } from '@/lib/meli/tokens';
import { AccountSelector } from './account-selector';

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
  const accounts = await getMeliAccountsForTeam(ctx.team.id);

  if (accounts.length === 0) {
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

  // Falls back to the first account if the param is missing or not ours.
  const requestedId = Number(params.account);
  const current =
    accounts.find((a) => a.id === requestedId) ?? accounts[0];
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
  let questions: Awaited<ReturnType<typeof searchMeliQuestions>>['questions'] = [];
  let items: Awaited<ReturnType<typeof fetchMeliItems>> = {};
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
    questions = result.questions;
    items = await fetchMeliItems(
      token,
      questions.map((q) => q.item_id)
    );
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
        {accounts.length > 1 ? (
          <AccountSelector
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
      ) : questions.length === 0 ? (
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
          <ul className="space-y-4">
            {questions.map((question) => {
              const item = items[question.item_id];
              return (
                <li key={question.id}>
                  <Card className="gap-3 py-4">
                    <CardContent className="space-y-3">
                      <div className="flex items-start gap-3">
                        {item?.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumbnail}
                            alt=""
                            className="size-12 rounded object-cover"
                          />
                        ) : (
                          <div className="flex size-12 items-center justify-center rounded bg-gray-100">
                            <MessageCircleQuestion className="size-5 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          {item?.permalink ? (
                            <a
                              href={item.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-sm font-medium hover:underline"
                            >
                              {item.title}
                            </a>
                          ) : (
                            <p className="truncate text-sm font-medium">
                              {item?.title ?? question.item_id}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {question.item_id} · {formatDate(question.date_created)}
                          </p>
                        </div>
                      </div>
                      <p className="text-gray-900">{question.text}</p>
                      {question.answer && (
                        <div className="rounded-md bg-gray-50 p-3 text-sm">
                          <p className="text-gray-700">{question.answer.text}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Respondida el {formatDate(question.answer.date_created)}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
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
