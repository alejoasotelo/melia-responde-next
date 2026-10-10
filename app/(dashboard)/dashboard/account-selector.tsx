'use client';

import { useRouter } from 'next/navigation';

export function AccountSelector({
  accounts,
  currentId,
  basePath
}: {
  accounts: { id: number; label: string }[];
  currentId: number;
  basePath: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="account" className="text-sm text-muted-foreground">
        Cuenta
      </label>
      <select
        id="account"
        value={currentId}
        onChange={(e) => router.push(`${basePath}?account=${e.target.value}`)}
        className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label}
          </option>
        ))}
      </select>
    </div>
  );
}
