# LibraCore — Real Library Management System

A production-oriented college library application using a web frontend, Node.js/Express REST API, MySQL, and a Java/JDBC analytics client.

## Features

### Students
- Secure login and self-registration
- Search the active catalogue
- Issue available books
- Configurable due period
- Return books
- Server-side late-day calculation and penalty calculation
- Personal borrowing history and overdue/penalty statistics

### Faculty
- Secure faculty login
- Add books with ISBN, author, publisher, category, year, description and copies
- Increase/decrease inventory safely
- Soft-remove books from the active catalogue
- Library inventory and circulation analytics
- Most-issued books, category analysis and monthly circulation
- Recent audit log

### Backend
- Node.js + Express
- MySQL connection pool
- JWT authentication
- bcrypt password hashing
- Role-based authorization
- Helmet security headers
- Rate limiting
- Transaction-safe issue/return operations
- Server-side business rules
- Audit logging

### JDBC
The `jdbc/` module connects to the same MySQL database and generates read-only analytics reports using Java JDBC.

## Important production rule
Do not commit `.env`, database passwords, JWT secrets, or real user data to GitHub.

## Project structure
```text
frontend/  Browser application
backend/   Node.js + Express REST API + MySQL schema
jdbc/      Java/JDBC analytics client
docs/      Deployment instructions
```

## Local development
1. Create `library_db` by running `backend/db/schema.sql` in MySQL.
2. Copy `backend/.env.example` to `backend/.env` and fill in the values.
3. In `backend/`, run `npm install` and `npm start`.
4. Serve `frontend/index.html` through a local static server. For the simplest test, use VS Code Live Server.
5. The frontend defaults to `http://localhost:5000/api`; for production set the browser's API base using `localStorage.setItem('library_api','https://YOUR-API/api')` before loading the app, or update the deployment configuration described in `docs/DEPLOYMENT.md`.
6. Create the first faculty account with `npm run create-faculty -- "Faculty Name" faculty@example.com StrongPassword`.

## Production architecture
```text
HTTPS browser
     |
     v
Static frontend host
     |
     | HTTPS REST
     v
Node.js/Express API
     |
     | TLS MySQL connection
     v
Cloud MySQL

Java JDBC analytics ---> Cloud MySQL (read-only reporting)
```
