 # Auto Mate

  Auto Mate is a college auto transport system with:
  - Student booking + live queue
  - Driver trip management (start with 1–4 students)
  - Admin dashboard (users, complaints, queue, schedules)
  - Real-time updates and chat using Socket.IO

  ## Tech Stack

  - Node.js
  - Express.js
  - MongoDB + Mongoose
  - JWT auth
  - bcryptjs
  - Socket.IO
  - React + Vite (frontend)
  - Axios

  ## Project Structure

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
        lib/
        components/

  ## Prerequisites

  - Node.js 18+
  - npm
  - MongoDB local OR MongoDB Atlas

  ———

  ## Local Setup (Step-by-step)

  ## 1) Start MongoDB

  If installed with Homebrew:

  brew services start mongodb-community

  If running manually:

  mkdir -p "$HOME/data/db"
  mongod --dbpath "$HOME/data/db"

  Verify MongoDB:

  mongosh "mongodb://127.0.0.1:27017/automate" --eval "db.runCommand({ ping: 1 })"

  ## 2) Backend Setup

  cd /Users/surajkiranshewale/Documents/AUTOMATE/backend
  npm install
  cp .env.example .env

  Open backend/.env and set values, or overwrite quickly:

  cat > .env <<'EOF'
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
  WEBAUTHN_RP_NAME=AutoMate
  # Optional override, defaults to origin hostname
  # WEBAUTHN_RP_ID=localhost
  APP_LOGIN_URL=http://localhost:8080/login
  FRONTEND_URL=http://localhost:8080

  # SMTP (required in production, optional in local dev fallback)
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=your_email@gmail.com
  SMTP_PASS=your_app_password
  MAIL_FROM=Auto Mate <your_email@gmail.com>

  # Seed users
  SEED_ADMIN_NAME=Auto Mate Admin
  SEED_ADMIN_EMAIL=admin@automate.edu
  SEED_ADMIN_PASSWORD=Admin@12345
  SEED_DRIVER_NAME=Default Driver
  SEED_DRIVER_EMAIL=driver@automate.edu
  SEED_DRIVER_PASSWORD=Driver@12345
  SEED_STUDENT_NAME=Default Student
  SEED_STUDENT_EMAIL=student@automate.edu
  SEED_STUDENT_PASSWORD=Student@12345
  EOF

  Run backend (dev):

  npm run dev

  Run backend (production mode):

  NODE_ENV=production npm start

  Health check:

  curl http://localhost:5000/health

  ## 3) Frontend Setup

  cd /Users/surajkiranshewale/Documents/AUTOMATE/frontend
  npm install

  Create frontend env:

  cat > .env <<'EOF'
  VITE_API_BASE_URL=http://localhost:5000/api
  VITE_SOCKET_URL=http://localhost:5000
  EOF

  Run frontend:

  npm run dev

  Open:

  open http://localhost:8080

  ———

  ## Default Seed Accounts

  These are created on backend startup (if not already present):

  - Admin: admin@automate.edu / Admin@12345
  - Driver: driver@automate.edu / Driver@12345
  - Student: student@automate.edu / Student@12345

  ———

  ## Core Behavior

  ## Queue + Trip Logic

  - Student joins live queue on booking.
  - Duplicate active queue booking is blocked.
  - Driver can start trip with 1 to 4 students.
  - Max capacity is 4.
  - Start trip picks first up to 4 waiting students (FIFO).
  - Student can leave queue while status is waiting.
  - If already locked in trip (assigned/pickup/in-transit), leave is blocked.

  ## Driver Cancel Rules

  - First cancel for a queue entry: move student to queue end.
  - Second cancel: remove student from queue.
  - cancelCount is stored server-side and enforced server-side only.

  ## Chat Rules

  - Queue chat is available while student is waiting.
  - Driver can chat with queue students.
  - Trip chat works for assigned trip participants.
  - Student cannot chat with other students.
  - Server validates role + membership from DB.

  ## Complaint Rules

  - Status values: submitted, in_review, resolved, rejected
  - Student can submit and view status/history.
  - Admin can update status + response.
  - Status updates are emitted via sockets.

  ———

  ## Main API Routes

  Base URL: /api

  ## Auth

  - POST /auth/signup
  - POST /auth/login
  - POST /auth/biometric/register/options
  - POST /auth/biometric/register/verify
  - POST /auth/biometric/login/options
  - POST /auth/biometric/login/verify
  - GET /auth/me

  ## Rides / Queue

  - POST /rides/book
  - DELETE /rides/student/leave
  - DELETE /rides/student/queue
  - GET /rides/student/current
  - GET /rides/student/history
  - GET /rides/driver/current
  - PATCH /rides/driver/students/:queueEntryId/arrive
  - PATCH /rides/driver/students/:queueEntryId/cancel
  - PATCH /rides/driver/start
  - PATCH /rides/driver/complete
  - GET /rides/admin/queue
  - GET /rides/admin/stats

  ## Chat

  - GET /chat/context
  - GET /chat/messages?roomType=queue|trip&roomId=<tripRoomId>
  - POST /chat/messages
  - GET /chat/ride/:rideId/messages
  - POST /chat/ride/:rideId/messages

  ## Complaints

  - POST /complaints
  - GET /complaints/mine
  - GET /complaints
  - PATCH /complaints/:complaintId/status

  ## Admin Users

  - GET /admin/users
  - POST /admin/users
  - DELETE /admin/users/:id (deactivate or permanent with query)
  - DELETE /admin/users/:id/permanent-delete
  - POST /admin/users/remove-by-email
  - PATCH /admin/users/:id/reactivate
  - POST /admin/users/:id/reset-password

  ———

  ## Socket.IO Events

  ## Client emits

  - joinQueueChat
  - leaveQueueChat
  - queueChatMessage
  - joinTripChat
  - leaveTripChat
  - tripChatMessage

  ## Server emits

  - socket:ready
  - queue:updated
  - queue:count
  - ride:updated
  - queueChatMessage
  - tripChatMessage
  - complaint:new
  - complaint:statusUpdated

  ———

  ## Deployment (Simple: Atlas + Render + Vercel)

  ## 1) Push code

  cd /Users/surajkiranshewale/Documents/AUTOMATE
  git add .
  git commit -m "deploy"
  git push origin main

  ## 2) MongoDB Atlas

  - Create cluster
  - Create DB user
  - Add IP/network access
  - Copy connection string
  - Use as MONGO_URI

  ## 3) Deploy Backend on Render

  - New Web Service from repo
  - Root Directory: backend
  - Build Command: npm install
  - Start Command: npm start
  - Add backend environment variables from .env

  ## 4) Deploy Frontend on Vercel

  - Import same repo
  - Root Directory: frontend
  - Build Command: npm run build
  - Output Directory: dist
  - Add env:
      - VITE_API_BASE_URL=https://<backend-domain>/api
      - VITE_SOCKET_URL=https://<backend-domain>

  ## 5) Update CORS in backend

  Set:

  - CORS_ORIGIN=https://<frontend-domain>
  - SOCKET_CORS_ORIGIN=https://<frontend-domain>

  Redeploy backend.

  ———

  ## Common Errors and Fixes

  ## Port already in use (EADDRINUSE)

  Check process:

  lsof -nP -iTCP:5000 -sTCP:LISTEN

  Kill process:

  kill -9 <PID>

  ## MongoDB connection failed

  brew services start mongodb-community
  mongosh "mongodb://127.0.0.1:27017/automate" --eval "db.runCommand({ ping: 1 })"

  ## CORS blocked

  Backend .env must match frontend URL:

  CORS_ORIGIN=http://localhost:8080
  SOCKET_CORS_ORIGIN=http://localhost:8080

  ## Email not sending

  - Use Gmail App Password (not Gmail account password)
  - Check SMTP values:
      - SMTP_HOST
      - SMTP_PORT
      - SMTP_USER
      - SMTP_PASS
      - MAIL_FROM

  ## “User already exists” during admin create

  If user is inactive, use reactivation endpoint instead of creating duplicate email.

  ———

  ## Security Notes

  - Do not commit .env files.
  - Use strong JWT_SECRET.
  - Rotate SMTP app password if leaked.
  - Use HTTPS URLs in production for API and Socket.
