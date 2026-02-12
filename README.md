# Auto Mate (Full Local Setup Guide)

This guide shows exactly what to do to run the full Auto Mate project locally.

## Prerequisites

- Node.js (18+ recommended)
- npm
- MongoDB installed locally

## 1) Start MongoDB

Use one of these options:

```bash
brew services start mongodb-community
```

or:

```bash
mkdir -p "$HOME/data/db"
mongod --dbpath "$HOME/data/db"
```

Verify MongoDB is running:

```bash
mongosh "mongodb://127.0.0.1:27017/automate" --eval "db.runCommand({ ping: 1 })"
```

## 2) Backend Setup

```bash
cd /Users/surajkiranshewale/Documents/AUTOMATE/backend
npm install
cp .env.example .env
```

Edit `backend/.env` to this:

```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/automate
JWT_SECRET=replace_with_long_random_secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:8080
SOCKET_CORS_ORIGIN=http://localhost:8080
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=20
SEED_ADMIN_NAME=Auto Mate Admin
SEED_ADMIN_EMAIL=admin@automate.edu
SEED_ADMIN_PASSWORD=Admin@12345
SEED_DRIVER_NAME=Default Driver
SEED_DRIVER_EMAIL=driver@automate.edu
SEED_DRIVER_PASSWORD=Driver@12345
SEED_STUDENT_NAME=Default Student
SEED_STUDENT_EMAIL=student@automate.edu
SEED_STUDENT_PASSWORD=Student@12345
```

Run backend in development:

```bash
cd /Users/surajkiranshewale/Documents/AUTOMATE/backend
npm run dev
```

Run backend in production:

```bash
cd /Users/surajkiranshewale/Documents/AUTOMATE/backend
NODE_ENV=production npm start
```

Notes:
- Required vars: `MONGO_URI`, `JWT_SECRET`
- Seed users are auto-created when backend starts.

## 3) Frontend Setup

```bash
cd /Users/surajkiranshewale/Documents/AUTOMATE/frontend
npm install
cp .env.example .env
```

Ensure `frontend/.env` contains:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

Run frontend:

```bash
cd /Users/surajkiranshewale/Documents/AUTOMATE/frontend
npm run dev
```

Frontend URL:
- `http://localhost:8080`

## 4) Login Accounts (Seed Data)

These accounts are created automatically from backend `.env`:

- Admin: `admin@automate.edu` / `Admin@12345`
- Driver: `driver@automate.edu` / `Driver@12345`
- Student: `student@automate.edu` / `Student@12345`

Check users in MongoDB:

```bash
mongosh "mongodb://127.0.0.1:27017/automate" --eval "db.users.find({}, {name:1,email:1,role:1,_id:0}).pretty()"
```

## 5) How Realtime Works

- Socket.IO server starts with backend startup (`backend/server.js`).
- Frontend connects after login using JWT (`frontend/src/lib/socket.ts`).
- Main events used:
  - `queue:updated`
  - `ride:updated`
  - `ride:full`
  - `chat:message`

No extra command is required beyond running backend + frontend.

## 6) Testing Flow

### A) Login in UI

Open:

```bash
open http://localhost:8080/login
```

Login as:
- Student (seed account)
- Driver (seed account)
- Admin (seed account)

### B) Create extra students (for 4-seat ride/full tests)

```bash
for i in 2 3 4; do
  curl -s -X POST http://localhost:5000/api/auth/signup \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Student $i\",\"email\":\"student$i@automate.edu\",\"password\":\"Student@12345\",\"role\":\"student\"}" >/dev/null
done
```

### C) API token helper

```bash
get_token() {
  local email="$1"; local password="$2"; local role="$3";
  curl -s -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"role\":\"$role\"}" \
    | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).data.token"
}
```

```bash
S1=$(get_token "student@automate.edu" "Student@12345" "student")
S2=$(get_token "student2@automate.edu" "Student@12345" "student")
S3=$(get_token "student3@automate.edu" "Student@12345" "student")
S4=$(get_token "student4@automate.edu" "Student@12345" "student")
DRIVER=$(get_token "driver@automate.edu" "Driver@12345" "driver")
```

### D) Test queue booking

```bash
curl -s -X POST http://localhost:5000/api/rides/book -H "Authorization: Bearer $S1" -H "Content-Type: application/json" -d '{"pickup":"Main Gate","destination":"Library"}'
curl -s -X POST http://localhost:5000/api/rides/book -H "Authorization: Bearer $S2" -H "Content-Type: application/json" -d '{"pickup":"Hostel A","destination":"Admin Block"}'
curl -s -X POST http://localhost:5000/api/rides/book -H "Authorization: Bearer $S3" -H "Content-Type: application/json" -d '{"pickup":"Hostel B","destination":"Cafeteria"}'
curl -s -X POST http://localhost:5000/api/rides/book -H "Authorization: Bearer $S4" -H "Content-Type: application/json" -d '{"pickup":"Sports Complex","destination":"Main Gate"}'
```

### E) Test ride full logic

```bash
curl -s -H "Authorization: Bearer $DRIVER" http://localhost:5000/api/rides/driver/current
```

Expected: ride has `4` students and becomes ready for driver.

### F) Test cancel + requeue logic

```bash
QE_ID=$(curl -s -H "Authorization: Bearer $DRIVER" http://localhost:5000/api/rides/driver/current | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).data.ride.students[0].queueEntryId")
curl -s -X PATCH http://localhost:5000/api/rides/driver/students/$QE_ID/cancel -H "Authorization: Bearer $DRIVER"
curl -s -X PATCH http://localhost:5000/api/rides/driver/students/$QE_ID/cancel -H "Authorization: Bearer $DRIVER"
```

Expected:
- 1st cancel: student goes to queue end (`cancelCount=1`)
- 2nd cancel: student becomes cancelled/removed (`cancelCount=2`)

### G) Test chat

```bash
RIDE_ID=$(curl -s -H "Authorization: Bearer $DRIVER" http://localhost:5000/api/rides/driver/current | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).data.ride.id")
curl -s -X POST http://localhost:5000/api/chat/ride/$RIDE_ID/messages -H "Authorization: Bearer $S1" -H "Content-Type: application/json" -d '{"content":"Hi driver"}'
curl -s -X POST http://localhost:5000/api/chat/ride/$RIDE_ID/messages -H "Authorization: Bearer $DRIVER" -H "Content-Type: application/json" -d '{"content":"On my way"}'
curl -s -H "Authorization: Bearer $S1" http://localhost:5000/api/chat/ride/$RIDE_ID/messages
```

## 7) Common Errors and Fixes

1. Missing env variable:

```bash
cd /Users/surajkiranshewale/Documents/AUTOMATE/backend
cp .env.example .env
```

2. MongoDB connection refused:

```bash
brew services start mongodb-community
mongosh "mongodb://127.0.0.1:27017/automate" --eval "db.runCommand({ ping: 1 })"
```

3. CORS blocked:
- Ensure backend `.env` has:
  - `CORS_ORIGIN=http://localhost:8080`
  - `SOCKET_CORS_ORIGIN=http://localhost:8080`

4. Port already in use:

```bash
lsof -nP -iTCP:5000 -sTCP:LISTEN
lsof -nP -iTCP:8080 -sTCP:LISTEN
kill -9 <PID>
```

5. Active booking conflict (`You already have an active booking`):
- Complete or cancel current ride before booking again.

## 8) Folder Structure

```txt
AUTOMATE/
  backend/
    app.js
    server.js
    config/
    controllers/
    middleware/
    models/
    routes/
    services/
    sockets/
    utils/
  frontend/
    src/
      pages/
      services/
      contexts/
      lib/
      components/
```

