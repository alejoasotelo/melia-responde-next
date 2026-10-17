import { checkoutAction } from '@/lib/payments/actions';
import { Check } from 'lucide-react';
import { CURRENCY, PLANS, TRIAL_DAYS, type Plan } from '@/lib/payments/plans';
import { SubmitButton } from './submit-button';

export default function PricingPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid md:grid-cols-2 gap-8 max-w-xl mx-auto">
        {Object.values(PLANS).map((plan) => (
          <PricingCard key={plan.key} plan={plan} />
        ))}
      </div>
    </main>
  );
}

function PricingCard({ plan }: { plan: Plan }) {
  const price = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0
  }).format(plan.price);

  return (
    <div className="pt-6">
      <h2 className="text-2xl font-medium text-gray-900 mb-2">{plan.name}</h2>
      <p className="text-sm text-gray-600 mb-4">
        con {TRIAL_DAYS} días de prueba gratis
      </p>
      <p className="text-4xl font-medium text-gray-900 mb-6">
        {price}{' '}
        <span className="text-xl font-normal text-gray-600">/ mes</span>
      </p>
      <ul className="space-y-4 mb-8">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start">
            <Check className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
            <span className="text-gray-700">{feature}</span>
          </li>
        ))}
      </ul>
      <form action={checkoutAction}>
        <input type="hidden" name="plan" value={plan.key} />
        <SubmitButton />
      </form>
    </div>
  );
}
