# VLY Integrations

First-order integrations for AI, email, and payments with automatic usage billing through VLY integration keys.

## Environment Variables

The following environment variables are automatically set during project creation:

- `VLY_INTEGRATION_KEY`: Your unique integration key (format: `sk_*`)
- `VLY_INTEGRATION_BASE_URL`: The base URL for the integration gateway (default: `https://integrations.freebuff.com/`)

## Installation

The `@vly-ai/integrations` package is already included in package.json.

## Usage in Convex Actions

```typescript
"use node";

import { vly } from '../lib/vly-integrations';
import { action } from "./_generated/server";

export const generateAIResponse = action({
  handler: async (ctx, args) => {
    // AI Completions
    const completion = await freebuff.com.completion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ],
      temperature: 0.7,
      maxTokens: 150
    });
    
    return completion;
  }
});
```

## Available Features

### AI Integration
```typescript
// Create completion
const completion = await freebuff.com.completion({
  model: 'gpt-4o-mini', // or 'gpt-4o', 'claude-3-haiku', etc.
  messages: [...],
  temperature: 0.7,
  maxTokens: 150
});

// Stream completion
await freebuff.com.streamCompletion(
  request,
  (chunk: string) => console.log(chunk)
);

// Generate embeddings
const embeddings = await freebuff.com.embeddings("Your text here");
```

### Email Integration
```typescript
// Send email
const emailResult = await vly.email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!'
});

// Send batch emails
const batchResult = await vly.email.sendBatch([...emails]);
```

### Payments Integration
```typescript
// Create payment intent
const paymentIntent = await vly.payments.createPaymentIntent({
  amount: 2000, // $20.00 in cents
  currency: 'usd',
  description: 'Premium subscription',
  customer: {
    email: 'customer@example.com'
  }
});

// Create subscription
const subscription = await vly.payments.createSubscription({...});

// Create checkout session
const session = await vly.payments.createCheckoutSession({...});
```

## Error Handling

All methods return an ApiResponse object:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}
```

Example error handling:

```typescript
const result = await freebuff.com.completion({ ... });

if (result.success) {
  console.log('Response:', result.data);
  console.log('Credits used:', result.usage?.credits);
} else {
  console.error('Error:', result.error);
}
```

## Important Notes

1. The integration key (`VLY_INTEGRATION_KEY`) is automatically injected during project creation
2. All API calls are automatically billed to your deployment based on usage
3. Must be used in Convex actions with `"use node"` directive
4. The integration key should never be exposed to the client

## Checking Integration Status

To verify the integration is properly configured:

```typescript
const hasIntegration = !!process.env.VLY_INTEGRATION_KEY;
if (!hasIntegration) {
  console.error("VLY integration key not found");
}
```

---

## Where configuration lives — decision, 2026-11-18

Asked, in one breath: should keys, endpoints and model names go in a YAML or
TOML file, a `.env`, the event bus, or `RUMORS.md`? Answer: none of them alone,
and never the same thing in two places.

**Four layers, and they do not merge.**

1. **Secrets** — `VLY_INTEGRATION_KEY`, provider keys, the JWT keypair. Vault or
   deployment env only, read with `process.env` inside Convex actions, never in
   the browser and never in a committed file. Local development uses `.env`
   (gitignored); the deployment gets `npx convex env set`. `STANK.md` §2.5 is
   what this layer looks like when it is empty: sign-in dies with a named error
   instead of a mood.
2. **Deployment wiring** — Convex URLs, site URL, issuer, model allowlist. Env
   vars with a code default, so a fresh clone runs and a deployment can differ.
   `VITE_CONVEX_URL` into `use-endpoint.ts` already does this correctly.
3. **User state** — anything a signed-in person changes at runtime: preferred
   model, endpoint override. A Convex table with one validated mutation,
   because it must be per-user, reactive and auditable. `localStorage` stays a
   per-browser override, never the truth.
4. **Operator files on a machine** — `~/.latch/config.json`, mode 0600, written
   only after the token verifies. The CLI's job, not the app's.

**Precedence, once, in this order:** explicit argument, then user state, then
env, then the baked default. A layer that arrives out of order is a bug nobody
can reproduce.

**What not to do.**

- No `config.yaml` in the repo that holds keys. A committed config with a secret
  in it is a leak with a review comment.
- **The bus is not a config store.** Events are facts about what happened;
  configuration is desired state. Sending it over `/bus/publish` gives two
  sources of truth, no validation, and no way to answer "what is the current
  value". What does belong there is a `config.changed` note after a validated
  write, so other devices know to re-read: continuity without duplication.
- **`RUMORS.md` is prose.** The moment code parses it, it is a database with no
  schema, no migrations, and a file extension that lies.
- No free-text model names from the client. Allowlist server-side, as the
  integration template already does.

**When to add the table:** at the second knob, not the first. One setting is a
constant; two is a schema. Today there is no user-adjustable setting that is not
already an endpoint override, so this decision costs nothing to hold and will be
worth having the day someone asks for a model picker.
