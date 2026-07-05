import { MongoClient } from 'mongodb';

let client = null;
let db = null;

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('WARNING: MONGODB_URI is not set in environment variables! Database features will fail.');
    return null;
  }
  
  if (client) return db;

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('oasis');
    console.log('Connected successfully to MongoDB.');
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    client = null;
    db = null;
    throw error;
  }
}

export async function getGuildConfig(guildId) {
  if (!db) await connectDatabase();
  if (!db) return null;

  try {
    const collection = db.collection('configs');
    return await collection.findOne({ _id: guildId });
  } catch (error) {
    console.error(`Error fetching config for guild ${guildId}:`, error);
    return null;
  }
}

export async function setGuildConfig(guildId, configUpdates) {
  if (!db) await connectDatabase();
  if (!db) return false;

  try {
    const collection = db.collection('configs');
    await collection.updateOne(
      { _id: guildId },
      { $set: configUpdates },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error(`Error saving config for guild ${guildId}:`, error);
    return false;
  }
}
