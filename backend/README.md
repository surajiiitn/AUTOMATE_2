# Auto Mate Backend

Node.js + Express + MongoDB backend for **Auto Mate — College Auto Management System**.

## Tech Stack

- Node.js + Express.js
- MongoDB + Mongoose
- JWT authentication + role guards
- bcrypt password hashing
- Socket.io real-time updates/chat
- express-validator request validation
- Helmet + rate limiting + CORS

## Folder Structure

```txt
backend/
  config/
  controllers/
  middleware/
  models/
  routes/
  services/
  sockets/
  utils/
  server.js
  app.js
```

## Setup

1. Install dependencies:

```bash
cd backend
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Update `.env` values (especially `MONGO_URI`, `JWT_SECRET`, and seeded account passwords).

4. Start dev server:

```bash
npm run dev
```

Backend runs on `http://localhost:5000` by default.

## Environment Variables

- `PORT`: API port
- `MONGO_URI`: Mongo connection string
- `JWT_SECRET`: JWT signing secret
- `JWT_EXPIRES_IN`: token expiry (default `7d`)
- `CORS_ORIGIN`: comma-separated frontend origins
- `SOCKET_CORS_ORIGIN`: comma-separated socket origins
- `RATE_LIMIT_WINDOW_MS`: global rate-limit window
- `RATE_LIMIT_MAX`: global rate-limit max requests
- `AUTH_RATE_LIMIT_MAX`: auth route limit

Seed users (created if not present):
- `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
- `SEED_DRIVER_NAME`, `SEED_DRIVER_EMAIL`, `SEED_DRIVER_PASSWORD`
- `SEED_STUDENT_NAME`, `SEED_STUDENT_EMAIL`, `SEED_STUDENT_PASSWORD`

## API Overview

Base URL: `/api`

### Auth
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`

### Rides / Queue
- `POST /rides/book` (student)
- `GET /rides/student/current` (student)
- `GET /rides/student/history` (student)
- `GET /rides/driver/current` (driver)
- `PATCH /rides/driver/students/:queueEntryId/arrive` (driver)
- `PATCH /rides/driver/students/:queueEntryId/cancel` (driver)
- `PATCH /rides/driver/start` (driver)
- `PATCH /rides/driver/complete` (driver)
- `GET /rides/admin/queue` (admin)
- `GET /rides/admin/stats` (admin)

### Chat
- `GET /chat/current-room`
- `GET /chat/ride/:rideId/messages`
- `POST /chat/ride/:rideId/messages`

### Complaints
- `POST /complaints` (student)
- `GET /complaints/mine` (student)
- `GET /complaints` (admin)
- `PATCH /complaints/:complaintId/status` (admin)

### Schedules
- `GET /schedules` (all authenticated users)
- `POST /schedules` (admin)

### Users (admin)
- `GET /users`
- `POST /users`

## Real-time Socket Events

Client listens to:
- `queue:updated`
- `ride:updated`
- `ride:full`
- `chat:message`
- `complaint:new`

Client emits:
- `chat:join` `{ rideId }`
- `chat:send` `{ rideId, content }`

Socket auth: pass JWT as `auth.token`.

## Queue + Driver Logic

- Student booking uses FIFO queue (`queueAt` ordering).
- Duplicate active booking is blocked.
- Queue processor forms 4-seat ride groups.
- Driver is auto-assigned when possible on full group.
- Driver cancel rules:
  - 1st cancel: student requeued to end
  - 2nd cancel: student removed (`cancelled`)
- Driver can mark arrival, start trip, complete trip.

## Frontend Connection

Frontend should set:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

The frontend already uses these values through `src/lib/api.ts` and `src/lib/socket.ts`.
