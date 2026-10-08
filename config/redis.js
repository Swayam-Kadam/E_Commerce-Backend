const { createClient } = require('redis');

let client;
let connectPromise;

function getRedis() {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      socket:
        process.env.NODE_ENV === 'test'
          ? { reconnectStrategy: () => false }
          : undefined,
    });
    client.on('error', (err) => console.error('Redis error:', err.message));
    connectPromise = client.connect().then(() => {
      console.log('Redis connected');
      return client;
    });
  }
  return { client, ready: connectPromise };
}

module.exports = { getRedis };