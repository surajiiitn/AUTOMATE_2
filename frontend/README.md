# Auto Mate Frontend

React + Vite frontend for Auto Mate College Auto Management System.

## Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend defaults:
- App: `http://localhost:8080`
- API base: `http://localhost:5000/api`
- Socket server: `http://localhost:5000`

## Required Backend

Start backend first:

```bash
cd backend
npm install
npm run dev
```

Then login with seeded users from backend `.env`:
- Admin: `admin@automate.edu` / `Admin@12345`
- Driver: `driver@automate.edu` / `Driver@12345`
- Student: `student@automate.edu` / `Student@12345`
