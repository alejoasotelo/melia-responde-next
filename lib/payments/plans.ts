export type PlanKey = 'vendedor' | 'agencia';

export type Plan = {
  key: PlanKey;
  name: string;
  maxMeliAccounts: number;
  // Monthly price in CURRENCY. Override with PLAN_<KEY>_PRICE env vars.
  price: number;
  features: string[];
};

export const CURRENCY = process.env.PLAN_CURRENCY || 'ARS';
export const TRIAL_DAYS = 14;

export const PLANS: Record<PlanKey, Plan> = {
  vendedor: {
    key: 'vendedor',
    name: 'Vendedor',
    maxMeliAccounts: 1,
    price: Number(process.env.PLAN_VENDEDOR_PRICE) || 15000,
    features: [
      '1 cuenta de MercadoLibre',
      'Borradores de respuesta con IA',
      'Contexto personalizado por publicación'
    ]
  },
  agencia: {
    key: 'agencia',
    name: 'Agencia',
    maxMeliAccounts: 3,
    price: Number(process.env.PLAN_AGENCIA_PRICE) || 35000,
    features: [
      'Todo lo del plan Vendedor',
      'Hasta 3 cuentas de MercadoLibre',
      'Selector para alternar entre cuentas'
    ]
  }
};

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && value in PLANS;
}

export function getPlanByName(name: string | null | undefined): Plan | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return isPlanKey(key) ? PLANS[key] : null;
}
