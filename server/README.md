# AI Interview Platform — server

Express 5 (ES modules) + PostgreSQL via Prisma 7. The client lives in `../client`.

## Setup

```bash
npm install
cp .env.example .env        # then fill in your postgres password + JWT_SECRET
npm run db:ensure           # creates the ai_interview database
npx prisma migrate deploy   # applies committed migrations
npm run dev                 # http://localhost:3000
```

## Environment variables (server/.env — never committed)

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://postgres:PASSWORD@localhost:5432/ai_interview?schema=public` |
| `JWT_SECRET` | yes | ≥32 chars. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `AI_PROVIDER` | no | `gemini` (default) |
| `AI_API_KEY` | no | Google Gemini API key. **Without it the app runs on clearly-labeled development fixtures** (question set + heuristic feedback). With it, every generation/evaluation call goes to the real provider. |
| `AI_MODEL` | no | Default `gemini-2.5-flash`. |
| `AI_TIMEOUT_MS` | no | Per-request timeout, default 30000. |

Get a Gemini key at https://aistudio.google.com/apikey (free tier available).
The key is read only from this file, used only server-side, and is never sent
to the browser. Prompts carry interview content only — role, topics,
difficulty, question and answer text — never names, emails or credentials.

## Testing safely (no API credits)

- `npm test` — the whole suite (71 tests) runs against the `ai_interview_test`
  database with the Gemini HTTP client **mocked**. It never makes a network
  call and never needs a key.
- `npm run ai:check` — makes **one** real, tiny request to the provider to
  verify your key and model (a fraction of a cent on the free tier). Run this
  after setting `AI_API_KEY`, then try one short interview end to end.

## Scripts

`dev` · `start` · `test` · `db:ensure` · `db:health` · `ai:check` · `migrate`
· `migrate:status` · `studio`
