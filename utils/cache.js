const { getRedis } = require('../config/redis');

async function getClient() {
  const { client, ready } = getRedis();
  await ready;
  return client;
}

const getJson = async (key) => {
  try {
    const client = await getClient();
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('cache getJson:', error.message);
    return null;
  }
};

const setJson = async (key, value, ttlSeconds = 60) => {
  try {
    const client = await getClient();
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.error('cache setJson:', error.message);
  }
};

const del = async (key) => {
  try {
    const client = await getClient();
    await client.del(key);
  } catch (error) {
    console.error('cache del:', error.message);
  }
};

const delByPrefix = async (prefix) => {
  try {
    const client = await getClient();
    const pattern = prefix.endsWith('*') ? prefix : `${prefix}*`;
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (error) {
    console.error('cache delByPrefix:', error.message);
  }
};

module.exports = { getJson, setJson, del, delByPrefix };