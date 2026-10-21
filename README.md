# LifeXP

LifeXP turns everyday responsibilities into quests. The project is a React single-page application backed by a PHP JSON API and MySQL. It includes account registration and login, task management, checklist import, XP and coin rewards, streaks, achievements, an arcade with three browser games, analytics, an admin dashboard, and a coin shop for cosmetic titles.

## Features

- Session-based registration, login, logout, CSRF protection, per-user authorization, and administrator role checks.
- Create, edit, complete, reopen, search, filter, and delete quests. Difficulty rewards are calculated only by the server.
- TXT/CSV and pasted-list preview, editable rows, validation, duplicate detection, and bounded batch imports.
- Atomic task completion and reward transactions; a quest can grant XP and coins only once, including after it is reopened.
- Persistent levels, streaks, achievement unlocks, analytics, score history, and cosmetic purchases.
- Playable memory match, reaction time, and number guessing games. Games award no currency.
- Responsive layouts with keyboard-accessible forms and controls.

## Architecture

| Path | Purpose |
| --- | --- |
| `src/` | React pages, shared UI, game components, API client, and styles |
| `backend/api/index.php` | PHP REST API front controller |
| `backend/src/` | Environment, PDO/session helpers, and gamification rules |
| `backend/database/database.sql` | MySQL schema and achievement seed data |
| `backend/scripts/create_admin.php` | CLI-only administrator creation |
| `tests/api-smoke.mjs` | Dependency-free API integration smoke checks |

The frontend and API run on separate development ports. The frontend sends credentialed requests to `VITE_API_BASE_URL`; the backend allows only the configured `APP_ORIGIN`. PHP sessions use `HttpOnly`, `SameSite=Strict` cookies and use `Secure` cookies when HTTPS or `SESSION_SECURE=true` is configured.

### Dependency choices

- React and Vite provide the component-based client and fast local development/build.
- React Router handles client-side page navigation without full reloads.
- Bootstrap 5 supplies responsive base styles and form controls; the LifeXP theme is project CSS.
- Lucide React supplies consistent interface/game icons.
- The charts use responsive CSS bars, so a separate charting library is not required. The PHP API uses built-in PDO; there is no Composer dependency.

## Prerequisites

- Windows 10/11 and VS Code.
- Node.js 20+ and npm.
- PHP 8.1+ with `pdo_mysql` and `mbstring` enabled.
- MySQL 8+ (XAMPP is a beginner-friendly local PHP/MySQL option).
- A modern browser.

PHP and MySQL are separate prerequisites; `npm install` does not install or configure them.

## Windows setup

Open PowerShell in the project folder.

1. Install the frontend packages:

   ```powershell
   npm install
   ```

2. Start MySQL using XAMPP or your MySQL installation. Create the schema from the project root:

   ```powershell
   cmd /c "mysql -u root -p < backend\database\database.sql"
   ```

   Enter your local MySQL password when prompted. Alternatively, execute `backend\database\database.sql` in MySQL Workbench.

3. Create the backend environment file and set the database connection values:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   notepad backend\.env
   ```

   Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` to match your local MySQL configuration. Keep `APP_ORIGIN=http://localhost:5173` for the Vite default. The file is ignored by Git.

4. In one PowerShell terminal, start the PHP API from the project root:

   ```powershell
   php -S localhost:8000 backend/api/index.php
   ```

5. In another terminal, configure the frontend URL and start Vite:

   ```powershell
   Copy-Item .env.example .env
   npm run dev
   ```

6. Open the local address printed by Vite, normally <http://localhost:5173>. Register a user, add and complete quests, import a checklist, and try the arcade.

The API defaults to `http://localhost:8000/api`. To use a different API address, set `VITE_API_BASE_URL` in the root `.env` and set `APP_ORIGIN` in `backend\.env` to the exact frontend origin, including its port. Restart the dev servers after editing environment variables.

### Create an administrator

There is no public administrator registration. First configure `backend\.env` and initialize MySQL. In PowerShell, read the password without echoing it and run the CLI setup script:

```powershell
$env:ADMIN_NAME = Read-Host 'Admin name'
$env:ADMIN_EMAIL = Read-Host 'Admin email'
$securePassword = Read-Host 'Admin password (12+ characters)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  php backend\scripts\create_admin.php
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  Remove-Item Env:ADMIN_NAME,Env:ADMIN_EMAIL,Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

The script hashes the password and inserts an `admin` role account. Never run the setup script on a public web server.

## Verify and test

Build the production frontend:

```powershell
npm run build
```

For API integration checks, start MySQL and the PHP API, then run the smoke script from a **disposable/test database**:

```powershell
node tests\api-smoke.mjs
```

The script creates persistent uniquely named test accounts and checks protected access, registration and login errors, task validation/ownership, reward idempotency (including reopening), imports and duplicate detection, achievements, analytics, score validation/history, coin balance rejection, admin authorization, deletion, and logout. It intentionally does not delete or mutate unrelated records.

### Manual browser checks

1. Register two accounts and confirm each sees only their own quests.
2. Create, edit, complete, reopen, and delete a quest. Confirm the first completion grants the correct XP/coins and a second completion (even after reopening) grants nothing.
3. Import a `.txt` file, a CSV with `title,category,difficulty`, and pasted text. Edit/remove preview rows, try an unsupported extension and an oversized file, and import the same list twice.
4. Earn enough coins and buy one cosmetic title from **My profile**; confirm the balance changes once and the item becomes owned.
5. Unlock a first-task achievement, inspect the analytics page, and play all three games. Confirm each finished score appears in Game history but games do not increase XP or coins.
6. Log out and verify `/dashboard` returns to the login screen. Log in as a regular account and visit `/admin`; the API must reject access.
7. Create an admin with the CLI setup, then verify that the admin page can list users and disable/reactivate regular accounts.
8. Resize the browser to phone width and test the navigation drawer, forms, dialogs, and keyboard focus.

## Reward and data rules

- Easy, Medium, Hard quests award respectively 10/20/40 XP and 1/2/4 coins.
- Each quest has one reward entitlement stored in `task_completions` plus unique XP/coin transaction constraints. Reopening changes its current checklist status, not its historical reward.
- Level is `floor(lifetime XP / 100) + 1`; XP is never spendable.
- A streak advances on the date of the first valid rewarded completion that day. A missed calendar day resets it on the next rewarded completion.
- Cosmetic titles have fixed server-owned prices and are purchased once in a database transaction. Games never award coins or XP.
- Task deletion is a soft delete; historical reward records are retained. Imported and pasted task data is treated as untrusted text.

## Security notes and limitations

- Passwords are stored with PHP `password_hash()` and verified with `password_verify()`. API SQL uses PDO prepared statements.
- Session identifiers rotate on login and registration. Mutating requests require a session CSRF token; CORS is limited to the configured frontend origin.
- Every task, achievement, profile, import, score, and reward query is scoped to the authenticated account. Admin operations have server-side role checks.
- Authentication attempts are rate-limited by a hashed remote IP and action for a 15-minute window. The `auth_attempts` table should be periodically cleaned (the API does sampled cleanup).
- The browser submits game results, so server-side range checks and authenticated ownership cannot prove that a client actually played honestly. These scores are personal history only, have no prizes, and are not used for currency, leaderboards, or account progression.
- Configure HTTPS and `SESSION_SECURE=true` in production, use a dedicated least-privilege MySQL user, restrict database network access, and back up the database. The PHP built-in server is for local development only.
- No PHP/MySQL runtime is bundled. Their installation, database availability, schema import, and production hosting must be configured separately.

## Git and deployment

The project ignores `.env`, `backend\.env`, `node_modules`, and build output. To initialize and publish it:

```powershell
git init
git add .
git commit -m "Build LifeXP application"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the remote URL with your repository. Review `git status` and `git diff --cached` before committing; never add database passwords, session secrets, or private keys.

### Example deployment: static frontend plus PHP/MySQL hosting

Use a static frontend host (for example, Netlify) and a PHP/MySQL host with a custom domain. For straightforward session cookies, use sibling HTTPS subdomains on the **same site**, such as `app.example.com` for React and `api.example.com` for PHP. The API uses `SameSite=Strict`, which is not suitable when the frontend and API are on unrelated sites.

1. On the PHP/MySQL host, create a MySQL database and a dedicated database user. Grant that user access to this database. Hosting providers often prefix the database and username; use their exact names.
2. Import `backend/database/database.sql` into the database you created. If the host does not allow the database user to create databases, remove or skip the file's `CREATE DATABASE` and `USE lifexp` statements and import the remaining schema into the selected database.
3. Create an API subdomain and set its document root to the uploaded `backend/` directory. Upload the contents of `backend/`, including `.htaccess`, `api/`, and `src/`. Ensure Apache `mod_rewrite` and PHP 8.1+ with `pdo_mysql` and `mbstring` are enabled.
4. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `APP_ORIGIN`, `APP_TIMEZONE`, and `SESSION_SECURE=true` in the host's PHP environment settings. If environment settings are unavailable, create `backend/.env` from `.env.example`; the supplied `.htaccess` blocks web access to that file and to the backend source, scripts, and database folder. Never upload a real `.env` to a public repository.
5. Create the administrator once from a terminal that can reach the production database, using `backend/scripts/create_admin.php` and the `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` environment variables. Do not expose or execute this setup script over HTTP.
6. On your development computer, build the frontend with the production API URL:

   ```powershell
   $env:VITE_API_BASE_URL = 'https://api.example.com/api'
   npm ci
   npm run build
   Remove-Item Env:VITE_API_BASE_URL
   ```

   Replace `example.com` with your domain. Upload the **contents** of `dist/` to the static host. Set that host's `VITE_API_BASE_URL` build variable to the same API URL if it builds from Git instead.
7. Set `APP_ORIGIN=https://app.example.com` in the PHP host, configure both domains for HTTPS, and enable `SESSION_SECURE=true`. The origin must exactly match the URL users open, including any `www` choice.
8. Check `https://api.example.com/api/auth/csrf` returns JSON, open the frontend, register a test account, and verify task creation and completion. Check the hosting PHP error log if the API reports a server error. Do not use the PHP built-in server in production.

The deployment rewrites in `backend/.htaccess` send `/api/...` requests to the PHP front controller. This example assumes an Apache-compatible PHP host. For Nginx or a managed PHP platform, configure its equivalent rewrite and deny rules. Apply future schema changes through reviewed SQL migrations and back up the production database before deployment.
