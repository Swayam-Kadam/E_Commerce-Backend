require('dotenv').config();

const mongoose = require('mongoose');
const validateEnv = require('./config/env');
const connecToMongo = require('./config/db');
const { getRedis } = require('./config/redis');
const logger = require('./utils/logger');
const app = require('./app');

const port = Number(process.env.PORT) || 4000;

function registerShutdown(server) {
  let shuttingDown = false;

  const shutdown = (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Shutting down (${signal})`);

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(exitCode || 1);
    }, 10000);
    forceExit.unref();

    server.close(async () => {
      try {
        await mongoose.disconnect();
        const { client } = getRedis();
        if (client.isOpen) {
          await client.quit();
        }
      } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
      } finally {
        clearTimeout(forceExit);
        process.exit(exitCode);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    logger.error(`Unhandled rejection: ${message}`);
    shutdown('unhandledRejection', 1);
  });
}

async function start() {
  try {
    validateEnv();
    await connecToMongo();
    await getRedis().ready;

    const server = app.listen(port, () => {
      logger.info(`App listening on port ${port}`);
    });

    registerShutdown(server);
  } catch (error) {
    logger.error(`Failed to start: ${error.message}`);
    process.exit(1);
  }
}

start();
