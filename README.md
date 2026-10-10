# Next.js SaaS Starter

This is a starter template for building a SaaS application using **Next.js** with support for authentication, MercadoPago subscriptions for payments, and a dashboard for logged-in users.

**Demo: [https://next-saas-start.vercel.app/](https://next-saas-start.vercel.app/)**

## Features

- Marketing landing page (`/`) with animated Terminal element
- Pricing page (`/pricing`) (plans Vendedor and Agencia) which connects to MercadoPago subscriptions
- Dashboard pages with CRUD operations on users/teams
- Basic RBAC with Owner and Member roles
- Subscription changes and cancellation through the MercadoPago API
- MercadoLibre accounts (1 for Vendedor, up to 3 for Agencia), questions, listings with extra AI context and AI-drafted answers (OpenAI)
- Email/password authentication with JWTs stored to cookies
- Global middleware to protect logged-in routes
- Local middleware to protect Server Actions or validate Zod schemas
- Activity logging system for any user events

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/)
- **Database**: [Postgres](https://www.postgresql.org/)
- **ORM**: [Drizzle](https://orm.drizzle.team/)
- **Payments**: [MercadoPago](https://www.mercadopago.com.ar/developers)
- **AI**: [OpenAI](https://platform.openai.com/) Chat Completions API
- **UI Library**: [shadcn/ui](https://ui.shadcn.com/)

## Getting Started

```bash
git clone https://github.com/nextjs/saas-starter
cd saas-starter
pnpm install
```

## Running Locally

You need a MercadoPago application (access token), a MercadoLibre application (client id/secret, with `$BASE_URL/api/meli/callback` as redirect URI) and an OpenAI API key.

Use the included setup script to create your `.env` file:

```bash
pnpm db:setup
```

Run the database migrations and seed the database with a default user and team:

```bash
pnpm db:migrate
pnpm db:seed
```

This will create the following user and team:

- User: `test@test.com`
- Password: `admin123`

You can also create new users through the `/sign-up` route.

Finally, run the Next.js development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the app in action.

MercadoPago and MercadoLibre need a public URL to call back, so expose your local server with a tunnel (ngrok, cloudflared...) and set `BASE_URL` to it.

## Testing Payments

Use MercadoPago [test users and test cards](https://www.mercadopago.com.ar/developers/en/docs/subscriptions/additional-content/your-integrations/test). The subscription payer email must be a test user's email.

## Going to Production

When you're ready to deploy your SaaS application to production, follow these steps:

### Set up the MercadoPago webhook

1. In your MercadoPago application, open Webhooks and configure the production URL `https://yourdomain.com/api/mercadopago/webhook`.
2. Enable the "Planes y suscripciones" (`subscription_preapproval`) topic.
3. Copy the signing secret into `MP_WEBHOOK_SECRET`.

### Deploy to Vercel

1. Push your code to a GitHub repository.
2. Connect your repository to [Vercel](https://vercel.com/) and deploy it.
3. Follow the Vercel deployment process, which will guide you through setting up your project.

### Add environment variables

In your Vercel project settings (or during deployment), add all the necessary environment variables. Make sure to update the values for the production environment, including:

1. `BASE_URL`: Set this to your production domain.
2. `MP_ACCESS_TOKEN` and `MP_WEBHOOK_SECRET`: MercadoPago production credentials.
3. `MELI_CLIENT_ID` and `MELI_CLIENT_SECRET`: MercadoLibre application credentials.
4. `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`).
5. `POSTGRES_URL`: Set this to your production database URL.
6. `AUTH_SECRET`: Set this to a random string. `openssl rand -base64 32` will generate one.

## Other Templates

While this template is intentionally minimal and to be used as a learning resource, there are other paid versions in the community which are more full-featured:

- https://achromatic.dev
- https://shipfa.st
- https://makerkit.dev
- https://zerotoshipped.com
- https://turbostarter.dev
