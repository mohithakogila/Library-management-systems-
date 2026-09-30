# Deployment — HTTPS production setup

The application is designed to be deployed as two services: a static HTTPS frontend and an HTTPS Node.js API connected to a managed MySQL database.

## 1. GitHub
Upload the project folders and files to a repository. Do not upload `backend/.env`.

## 2. Cloud MySQL
Create a managed MySQL 8.x database. Create/import the schema from `backend/db/schema.sql`.

Record the provider's host, port, database name, username and password. If the provider requires TLS, set `DB_SSL=true`.

## 3. Backend environment
Set these variables on the Node.js hosting service:

```text
PORT=5000
DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=library_db
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=8h
FRONTEND_ORIGIN=https://your-frontend-domain
LATE_FEE_PER_DAY=5
MAX_LOAN_DAYS=14
MAX_ACTIVE_LOANS=5
```

Do not expose these values in frontend JavaScript.

## 4. Install and start API
```bash
cd backend
npm install
npm start
```

The API must be reachable through HTTPS in production. Use a hosting provider that supplies TLS automatically or place the Node.js service behind a TLS reverse proxy.

## 5. Create faculty account
Run this once from a trusted environment after the production database is configured:

```bash
cd backend
npm run create-faculty -- "Library Faculty" faculty@college.edu StrongPasswordHere
```

Do not put this password in GitHub.

## 6. Frontend
Host `frontend/index.html` on an HTTPS static host. Before using it in production, configure the API base URL to your HTTPS API. The application stores the API base in `localStorage` under `library_api`.

For example, in the browser developer console on the deployed site:

```js
localStorage.setItem('library_api','https://YOUR-API-DOMAIN/api');
location.reload();
```

For a polished production deployment, replace the localStorage configuration with your host's build/deployment configuration or edit the `API` constant in `frontend/index.html` before deployment.

## 7. CORS
Set `FRONTEND_ORIGIN` to the exact HTTPS frontend origin. Multiple origins can be comma-separated if required.

## 8. JDBC analytics
Use Java 17+ and Maven. Set the same database environment variables and run:

```bash
cd jdbc
mvn clean package
mvn exec:java -Dexec.mainClass=com.library.jdbc.AnalyticsApp
```

The JDBC module is intentionally read-only.

## 9. Production checklist
- HTTPS enabled for the frontend and API
- TLS enabled for MySQL where supported/required
- Strong random JWT secret
- No `.env` in Git
- No real passwords in source code
- CORS restricted to the frontend domain
- Database backups enabled
- Least-privilege database user configured where supported
- Monitor API logs and database health
- Change the late-fee and loan-limit environment settings to your college policy
