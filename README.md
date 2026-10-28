# Employee Management API

Node.js + Express + MongoDB REST API with email/OTP login, JWT authentication, role-based access control and full employee CRUD.

Prepared by **Uday**, Klentec Digital Solutions.

> ⚠️ **The OTP is hardcoded (`123456`) for development and testing only.** The server refuses to start with `NODE_ENV=production` while `HARDCODED_OTP` is set. See [Going to production](#going-to-production).

---

## Live staging server

**Base URL:** `https://employee-management-api-uupi.onrender.com/api`  
Health: https://employee-management-api-uupi.onrender.com/api/health

- Hosted on Render (free plan, Singapore) with MongoDB Atlas (`employee_management_staging`).
- Import `postman/Employee-Management-API.LIVE.postman_collection.json` to test it. The admin login is `qa-admin@klentec.com`, and the OTP is `123456`.
- The free plan sleeps after about 15 minutes idle, so the first request then takes about a minute.
- **Dummy data only.** Anyone with the URL can log in with the development OTP.
- Every push to `main` redeploys automatically.

## Contents

1. [Quick start](#quick-start)
2. [Architecture](#architecture)
3. [Authentication flow](#authentication-flow)
4. [Roles and permissions](#roles-and-permissions)
5. [API reference](#api-reference)
6. [Testing with Postman](#testing-with-postman)
7. [curl examples](#curl-examples)
8. [Automated tests](#automated-tests)
9. [Environment variables](#environment-variables)
10. [Security measures](#security-measures)
11. [Going to production](#going-to-production)
12. [Troubleshooting](#troubleshooting)
13. [Feature checklist](#feature-checklist)

---

## Quick start

**Requirements:** Node.js 18.18+ (tested on Node 22) and MongoDB 6+ (local, Docker, or MongoDB Atlas).

```bash
# 1. Install
npm install

# 2. Start MongoDB (pick one)
docker compose up -d                 # uses docker-compose.yml in this repo
# or: install MongoDB Community locally and start the service
# or: create a free MongoDB Atlas cluster and copy its connection string

# 3. Configure
cp .env.example .env                 # Windows: copy .env.example .env
# Edit .env: set MONGODB_URI, a long random JWT_SECRET, and ADMIN_EMAILS
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # → JWT_SECRET

# 4. Run
npm run dev                          # nodemon, auto-restart
# or
npm start
```

**Base URL:** `http://localhost:5000/api`

Check it works:

```bash
curl http://localhost:5000/api/health
# {"success":true,"message":"OK","data":{"status":"up","database":"connected",...}}
```

### npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with nodemon (development) |
| `npm start` | Start with node (production) |
| `npm test` | Run the Jest + Supertest suite against an isolated test database |
| `npm run test:coverage` | Same, with a coverage report |
| `npm run set-role -- <email> <admin\|user>` | Change a user's role from the server (see [Roles](#roles-and-permissions)) |

---

## Architecture

```
src/
├── config/
│   ├── env.js                 # loads + validates env vars, fails fast on unsafe config
│   └── database.js            # Mongo connection with retries, index creation
├── models/
│   ├── User.js                # auth identity (email, role) — no passwords stored
│   ├── Employee.js            # employee record, unique employeeId + email
│   └── RevokedToken.js        # logout denylist (jti + TTL)
├── services/                  # business logic, no Express objects
│   ├── otp.service.js         # OTP provider abstraction (hardcoded dev provider)
│   ├── auth.service.js        # signup, OTP request/verify, lockout, logout
│   └── employee.service.js    # CRUD, filters, pagination, duplicate checks
├── controllers/               # translate HTTP ⇄ service calls
├── routes/                    # URL → middleware chain → controller
├── validators/                # express-validator rules
├── middlewares/
│   ├── auth.middleware.js     # Bearer JWT verification → req.user
│   ├── role.middleware.js     # authorize('admin') → 403
│   ├── validation.middleware.js
│   ├── sanitize.middleware.js # strips $-operators / dotted keys (NoSQL injection)
│   ├── rateLimit.middleware.js
│   └── error.middleware.js    # one error format for everything
├── utils/                     # ApiError, response helper, JWT helpers
├── app.js                     # builds the Express app (used by tests)
└── server.js                  # connects DB, listens, graceful shutdown
scripts/set-role.js            # server-side role assignment
tests/                         # Jest + Supertest
postman/                       # importable Postman collection
```

**Request pipeline:** `helmet → cors → json (10kb limit) → sanitize → route → [rate limit] → [authenticate] → [authorize] → validate → controller → service → model`. Any thrown error goes to `error.middleware.js`.

**Design decisions**

- **Users and employees are separate collections.** Logging in gives you API access according to your role; it does not link you to an employee record.
- **Controllers stay thin.** All rules live in services, so they can be reused (CLI scripts, queues) and tested without HTTP.
- **Only validated fields reach the database.** Controllers use `matchedData()` and services whitelist writable fields, so extra body fields (`_id`, `createdAt`, `role`, …) are ignored.
- **Normalization:** emails are trimmed and lowercased; `employeeId` is trimmed and uppercased (`emp001` = `EMP001`). Unique indexes enforce both even under concurrent requests.
- **PUT vs PATCH:** `PUT` is a full update (all core fields required); `PATCH` is a partial update (send only what changes).
- **Delete vs deactivate:** `DELETE` removes the record permanently. `PATCH /:id/deactivate` is a soft delete (`isActive: false`) that keeps the record.

---

## Authentication flow

```
1. POST /api/auth/signup      { email, name? }   → 201, user created with role "user"
2. POST /api/auth/login       { email }          → 200, "OTP issued" (no token yet)
3. POST /api/auth/verify-otp  { email, otp }     → 200, { token, expiresAt, user }
4. Call protected APIs with   Authorization: Bearer <token>
5. POST /api/auth/logout                         → 200, token revoked
```

- The JWT is HS256-signed. Its payload contains `sub` (user id), `role`, `jti` (token id), `iss` and `exp`. The expiry comes from `JWT_EXPIRES_IN`.
- `verify-otp` only works within `OTP_TTL_MINUTES` (default 5) of calling `/login`.
- Each OTP request is **single-use**. Verify again and you must call `/login` again.
- After `OTP_MAX_ATTEMPTS` wrong codes (default 5), the account is locked for `OTP_LOCK_MINUTES` (default 15) and gets `429 OTP_LOCKED`.
- On every request, the middleware checks the token's signature, algorithm, issuer and expiry. It also checks the denylist and confirms the user still exists and is active.

### Logout and stateless JWTs

A JWT stays valid until it expires; the server keeps no session to destroy. So that logout takes effect immediately, `/logout` stores the token's `jti` in a **denylist** (`revokedtokens` collection), and the auth middleware rejects it with `401 TOKEN_REVOKED`. A MongoDB TTL index deletes denylist entries once the token would have expired anyway.

Trade-offs:

- Each authenticated request makes one small indexed lookup. At high traffic, move the denylist to Redis.
- Logout revokes only the token that was sent. Other devices stay logged in until their tokens expire.
- Keep `JWT_EXPIRES_IN` short (e.g. 15m–1h). For long sessions, add refresh tokens.

---

## Roles and permissions

| Action | admin | user |
| --- | :---: | :---: |
| List / get employees | ✅ | ✅ |
| Create employee | ✅ | ❌ 403 |
| Update (PUT / PATCH) | ✅ | ❌ 403 |
| Deactivate / activate | ✅ | ❌ 403 |
| Delete | ✅ | ❌ 403 |

**How roles are assigned (securely):**

1. **Every signup is `user` by default.** A `role` sent in any request body is ignored.
2. **`ADMIN_EMAILS` in `.env`.** Emails listed here get `admin` when they sign up. Only someone with server access can edit this.
3. **`npm run set-role -- someone@company.com admin`** changes the role of an existing user. It needs database access, which API clients never have. The user must log in again to get a token carrying the new role.

The role is read only from the verified token, never from the request.

---

## API reference

All responses share one shape.

```json
// success
{ "success": true, "message": "Employee created successfully", "data": { ... }, "meta": { ... } }

// error
{ "success": false, "message": "Employee not found", "error": { "code": "EMPLOYEE_NOT_FOUND", "details": [ ... ] } }
```

### Auth

| Method | Path | Auth | Body | Success |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/signup` | – | `{ "email", "name"? }` | 201 |
| POST | `/api/auth/login` | – | `{ "email" }` | 200 |
| POST | `/api/auth/verify-otp` | – | `{ "email", "otp" }` | 200 → `data.token` |
| POST | `/api/auth/logout` | Bearer | – | 200 |
| GET | `/api/auth/me` | Bearer | – | 200 |
| GET | `/api/health` | – | – | 200 / 503 |

### Employees (all require `Authorization: Bearer <token>`)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| POST | `/api/employees` | admin | All 6 fields required, `isActive` optional → 201 |
| GET | `/api/employees` | any | Pagination, filters, search, sort (below) |
| GET | `/api/employees/:id` | any | `:id` = MongoDB ObjectId |
| PUT | `/api/employees/:id` | admin | Full update; all 6 fields required |
| PATCH | `/api/employees/:id` | admin | Partial update; any subset of fields |
| PATCH | `/api/employees/:id/deactivate` | admin | Soft delete (`isActive: false`) |
| PATCH | `/api/employees/:id/activate` | admin | Undo soft delete |
| DELETE | `/api/employees/:id` | admin | Permanent delete |

**Employee fields**

| Field | Rules |
| --- | --- |
| `employeeId` | required, unique, 2–30 chars `[A-Za-z0-9_-]`, stored uppercase |
| `employeeName` | required, ≤ 100 chars |
| `email` | required, unique, valid email, stored lowercase |
| `phoneNumber` | required, 8–20 digits, optional leading `+`, spaces/dashes allowed |
| `designation` | required, ≤ 100 chars |
| `workLocation` | required, ≤ 100 chars |
| `isActive` | boolean, default `true` |
| `createdAt`, `updatedAt` | automatic |

**List query parameters** for `GET /api/employees`

| Param | Example | Notes |
| --- | --- | --- |
| `page` | `1` | default 1 |
| `limit` | `10` | default 10, max 100 |
| `designation` | `Software Engineer` | exact match, case-insensitive |
| `workLocation` | `Noida` | exact match, case-insensitive |
| `isActive` | `true` / `false` | |
| `search` | `rahul` | partial match on name, employeeId or email |
| `sortBy` | `employeeName` | `createdAt` (default), `updatedAt`, `employeeName`, `employeeId`, `designation`, `workLocation` |
| `order` | `asc` / `desc` | default `desc` |

Response `meta`: `{ total, page, limit, totalPages, hasNextPage, hasPrevPage, sortBy, order }`.

### Status and error codes

| HTTP | `error.code` examples | When |
| --- | --- | --- |
| 400 | `INVALID_PARAMS`, `INVALID_JSON`, `OTP_NOT_REQUESTED_OR_EXPIRED` | Malformed id/JSON, verify without login |
| 401 | `TOKEN_MISSING`, `TOKEN_MALFORMED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `USER_INACTIVE`, `INVALID_OTP` | Authentication failures |
| 403 | `INSUFFICIENT_ROLE`, `ACCOUNT_DISABLED` | Logged in but not allowed |
| 404 | `EMPLOYEE_NOT_FOUND`, `USER_NOT_FOUND`, `ROUTE_NOT_FOUND` | |
| 409 | `DUPLICATE_EMPLOYEE_ID`, `DUPLICATE_EMAIL`, `USER_ALREADY_EXISTS` | Unique conflicts |
| 413 | `PAYLOAD_TOO_LARGE` | Body over `BODY_LIMIT` |
| 422 | `VALIDATION_ERROR`, `NO_UPDATABLE_FIELDS` | Invalid input; `details` lists each field |
| 429 | `TOO_MANY_REQUESTS`, `TOO_MANY_OTP_ATTEMPTS`, `OTP_LOCKED` | Rate limit / OTP lockout |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected; internals never exposed |

---

## Testing with Postman

### Import the collection

1. Postman → **Import** → select `postman/Employee-Management-API.postman_collection.json`.
2. Open the collection → **Variables** tab and check:
   - `baseUrl`: `http://localhost:5000/api` (change it to your deployed URL if needed)
   - `adminEmail`: must be listed in the server's `ADMIN_EMAILS` (default `admin@example.com`)
   - `userEmail`, `otp` (`123456`)
3. Run the folders **in order** (0 → 5), or click **Run collection** to run all 34 requests with their built-in tests.

The collection is safe to re-run. Its first CRUD request removes `EMP001`/`EMP002` left over from earlier runs.

### How the JWT is reused automatically

The **Verify OTP** requests have a test script that saves the token:

```js
const t = pm.response.json().data.token;
pm.collectionVariables.set("adminToken", t);   // or "userToken"
pm.collectionVariables.set("token", t);        // admin only
```

The collection's **Authorization** tab is set to **Bearer Token** = `{{token}}`. Every request set to *Inherit auth from parent* uses it. Requests that need a specific identity set their own Bearer token: `{{adminToken}}` or `{{userToken}}`.

### Doing it by hand (without the collection)

1. `POST {{baseUrl}}/auth/signup` → Body → raw → JSON: `{ "email": "admin@example.com", "name": "Admin" }`
2. `POST {{baseUrl}}/auth/login` → `{ "email": "admin@example.com" }`
3. `POST {{baseUrl}}/auth/verify-otp` → `{ "email": "admin@example.com", "otp": "123456" }` → copy `data.token`
4. On any employee request: **Authorization** tab → Type **Bearer Token** → paste the token. Postman sends `Authorization: Bearer <token>`.

### Scenarios covered by the collection

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Sign up a user | 201 (409 if exists) |
| 2 | Request login OTP | 200 |
| 3 | Verify OTP, get JWT | 200 + token saved |
| 4 | Employees without a token | 401 `TOKEN_MISSING` |
| 5 | Employees with an invalid token | 401 `TOKEN_INVALID` |
| 6 | Create employee as admin | 201 |
| 7 | Get all employees | 200 + `meta` |
| 8 | Get employee by id | 200 |
| 9 | Update (PUT and PATCH) | 200 |
| 10 | Delete employee | 200, then 404 |
| 11 | Duplicate employeeId / email | 409 |
| 12 | Create/delete as normal user | 403 |
| 13 | Invalid input / malformed id / missing employee / expired token | 422 / 400 / 404 / 401 |
| 14 | Pagination + filter + search + sort | 200 |
| – | Logout, then reuse token | 200, then 401 `TOKEN_REVOKED` |

**Expired-token test:** start the server with `JWT_EXPIRES_IN=10s`, log in, wait 10 seconds, and call any employee endpoint. You get `401 TOKEN_EXPIRED`. The automated tests also cover this.

---

## curl examples

```bash
BASE=http://localhost:5000/api

# Sign up + log in as admin (admin@example.com is in ADMIN_EMAILS)
curl -s -X POST $BASE/auth/signup -H "Content-Type: application/json" -d '{"email":"admin@example.com","name":"Admin"}'
curl -s -X POST $BASE/auth/login  -H "Content-Type: application/json" -d '{"email":"admin@example.com"}'
TOKEN=$(curl -s -X POST $BASE/auth/verify-otp -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","otp":"123456"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.token")

# Create
curl -s -X POST $BASE/employees -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"employeeId":"EMP001","employeeName":"Rahul Sharma","email":"rahul@example.com","phoneNumber":"9876543210","designation":"Software Engineer","workLocation":"Noida"}'

# List with filters
curl -s "$BASE/employees?page=1&limit=10&workLocation=Noida&search=rahul&sortBy=employeeName&order=asc" -H "Authorization: Bearer $TOKEN"

# Get / update / deactivate / delete (replace ID)
ID=<employee id from the create response>
curl -s $BASE/employees/$ID -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH $BASE/employees/$ID -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"designation":"Tech Lead"}'
curl -s -X PATCH $BASE/employees/$ID/deactivate -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE $BASE/employees/$ID -H "Authorization: Bearer $TOKEN"

# Logout
curl -s -X POST $BASE/auth/logout -H "Authorization: Bearer $TOKEN"
```

On Windows PowerShell, use `curl.exe` and escape the inner quotes, or just use the Postman collection.

---

## Automated tests

```bash
npm test
```

- 61 tests across 4 suites (Jest + Supertest): auth flow, OTP lockout and single-use, JWT middleware (missing, malformed, invalid, forged, `alg:none`, expired, revoked, deactivated user), role checks, CRUD, validation, duplicates, pagination/filter/search/sort, error format, security headers, body limit, and startup config safety.
- **Isolated database:** with no extra config, the tests start a throwaway in-memory MongoDB (`mongodb-memory-server`, which downloads a MongoDB binary on first run). To use a running MongoDB instead, set `MONGODB_URI_TEST=mongodb://127.0.0.1:27017/anything`. Each test file then creates and drops its own randomly named database. Your real database is never touched.

---

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `MONGODB_URI` | – (required) | Mongo connection string |
| `MONGODB_URI_TEST` | – | Optional server for `npm test` |
| `JWT_SECRET` | – (required) | HS256 signing key; in production 32+ chars, not a placeholder |
| `JWT_EXPIRES_IN` | `1h` | e.g. `15m`, `1h`, `7d` |
| `HARDCODED_OTP` | – | Dev OTP (4–8 digits). **Must be unset in production** |
| `OTP_TTL_MINUTES` | `5` | How long after `/login` the OTP can be verified |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong OTPs before lockout |
| `OTP_LOCK_MINUTES` | `15` | Lockout duration |
| `ADMIN_EMAILS` | – | Comma-separated emails that sign up as admin |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `BODY_LIMIT` | `10kb` | Max JSON body size |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` | `15` | Rate-limit window for `/api/auth/*` |
| `AUTH_RATE_LIMIT_MAX` | `50` | Requests per IP per window (OTP verify gets half) |
| `TRUST_PROXY` | `0` | Set `1` behind a proxy/load balancer so rate limits see real IPs |

`.env` is in `.gitignore`. Never commit it.

---

## Security measures

- **Helmet** security headers, `x-powered-by` disabled, configurable **CORS**, **10kb** body limit.
- **Rate limiting** on all auth routes, stricter on OTP verify, plus a **per-account OTP lockout**.
- **JWT:** algorithm pinned to HS256 (`alg:none` and other algorithms rejected), issuer checked, expiry enforced, revocation denylist.
- **NoSQL injection:** `$`/dotted keys stripped from bodies and params, validators require strings, query values are coerced to strings, search input is regex-escaped, and Mongoose `strictQuery` is on.
- **Mass assignment** blocked by validator whitelists and service-level field picking.
- **Unique indexes** on `employeeId` and normalized `email`; duplicate-key races map to `409`.
- **No passwords stored** (OTP-only). OTP comparison is timing-safe.
- **Safe logging:** only method, path, status and time. No headers, bodies, tokens or OTPs. Stack traces are never sent to clients.
- **Fail-fast config:** missing `JWT_SECRET`/`MONGODB_URI`, a weak secret in production, or `HARDCODED_OTP` in production all stop startup.

---

## Going to production

1. **Replace the OTP provider.** In `src/services/otp.service.js`, implement a provider with `issue(email)` and `verify(email, otp)`:
   - generate a random 6-digit code with `crypto.randomInt`
   - store only its **hash** with an expiry (e.g. on the user document)
   - send it via an email/SMS service (SES, SendGrid, MSG91, Twilio…)
   - delete it on success (single-use)

   Then unset `HARDCODED_OTP`. Until a provider exists, `/login` returns `503 OTP_PROVIDER_NOT_CONFIGURED` in production.
2. Set `NODE_ENV=production`, a strong random `JWT_SECRET`, restricted `CORS_ORIGINS`, and `TRUST_PROXY=1` behind a load balancer.
3. Use a managed MongoDB (e.g. Atlas) with authentication and TLS.

### Getting a public base URL (for a shared dev/staging server)

Any Node host works. Example with **Render** + **MongoDB Atlas** (both have free tiers):

1. Atlas: create a free cluster → Database Access (create a user) → Network Access (allow `0.0.0.0/0` or Render's IPs) → copy the `mongodb+srv://…` connection string.
2. Push this folder to a GitHub repo.
3. Render → New → Web Service → pick the repo. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables: `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_EMAILS`, `TRUST_PROXY=1`. For a **dev/staging** server that keeps the hardcoded OTP, also set `NODE_ENV=development` and `HARDCODED_OTP=123456`.
5. Your base URL becomes `https://<service-name>.onrender.com/api`. Put it into the Postman `baseUrl` variable.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing required environment variable: JWT_SECRET` | Create `.env` from `.env.example` |
| `[db] Connection attempt 1/5 failed: connect ECONNREFUSED 127.0.0.1:27017` | MongoDB isn't running: `docker compose up -d` or start the service |
| Atlas: `bad auth` / timeout | Check the DB user/password in the URI and Atlas Network Access |
| `Refusing to start: HARDCODED_OTP is set while NODE_ENV=production` | Working as intended. Unset `HARDCODED_OTP` or use `NODE_ENV=development` for staging |
| Admin gets `403` on create | The email isn't in `ADMIN_EMAILS` at signup time. Run `npm run set-role -- <email> admin`, then log in again |
| `400 OTP_NOT_REQUESTED_OR_EXPIRED` | Call `/auth/login` first; the OTP is valid for `OTP_TTL_MINUTES` and is single-use |
| `429 OTP_LOCKED` | Too many wrong OTPs. Wait `OTP_LOCK_MINUTES` |
| `401 TOKEN_REVOKED` | You logged out with that token. Log in again |
| `npm test` hangs on first run | `mongodb-memory-server` is downloading MongoDB. Allow internet access, or set `MONGODB_URI_TEST` to a running MongoDB |
| Port already in use | Change `PORT` in `.env` |

---

## Feature checklist

- [x] Express + Mongoose, modular layers (routes / controllers / services / models / middleware / validators)
- [x] Employee model with unique `employeeId` + normalized `email`, timestamps, `isActive`
- [x] Signup, OTP login request, OTP verify → JWT (id + role), logout with denylist, `/me`
- [x] Hardcoded OTP isolated in `otp.service.js`, blocked in production
- [x] OTP expiry, single-use, attempt limit and lockout
- [x] JWT middleware: Bearer parsing, signature/expiry/issuer checks, 401 vs 403
- [x] RBAC: admin = full CRUD, user = read only; no self-promotion; `ADMIN_EMAILS` + `set-role` script
- [x] CRUD with pagination, filters, search, sorting; PUT (full) + PATCH (partial); soft delete + hard delete
- [x] Validation (422 with field details), consistent JSON envelope, proper status codes
- [x] Helmet, CORS, body limit, rate limiting, NoSQL-injection protection, safe logging
- [x] Env validation with fail-fast startup and graceful shutdown
- [x] 61 automated tests (Jest + Supertest) on an isolated database
- [x] Importable Postman collection (34 requests with assertions, token auto-saved)
