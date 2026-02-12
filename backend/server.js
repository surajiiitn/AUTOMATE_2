const http = require("http");
const app = require("./app");
const env = require("./config/env");
const connectDB = require("./config/db");
const initSocketServer = require("./sockets");
const { seedDefaultUsers } = require("./services/seedService");
const { processQueue } = require("./services/queueService");

const startServer = async () => {
  await connectDB();
  await seedDefaultUsers();
  await processQueue();

  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Auto Mate backend running on http://localhost:${env.port}`);
  });
};

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error);
  process.exit(1);
});
