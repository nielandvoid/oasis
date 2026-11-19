import { MongoClient } from 'mongodb';
import { randomBytes } from 'crypto';
import { urlKey, linksOf } from './links.js';

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
    await db.collection('drafts').createIndex({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 3600 }).catch(() => null);
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

export async function createDraft(data) {
  if (!db) await connectDatabase();
  if (!db) return null;

  try {
    const id = randomBytes(5).toString('hex');
    await db.collection('drafts').insertOne({ _id: id, ...data, createdAt: new Date() });
    return id;
  } catch (error) {
    console.error('Error saving draft:', error);
    return null;
  }
}

export async function getDraft(id) {
  if (!db) await connectDatabase();
  if (!db) return null;

  try {
    return await db.collection('drafts').findOne({ _id: String(id) });
  } catch (error) {
    console.error(`Error fetching draft ${id}:`, error);
    return null;
  }
}

export async function saveSubmission(messageId, data) {
  if (!db) await connectDatabase();
  if (!db) return false;

  try {
    await db.collection('submissions').updateOne(
      { _id: messageId },
      { $set: { ...data, status: 'pending', createdAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error('Error saving submission:', error);
    return false;
  }
}

// pending to processing in one step, so two clicks can't both publish
export async function claimSubmission(messageId) {
  if (!db) await connectDatabase();
  if (!db) return null;

  try {
    return await db.collection('submissions').findOneAndUpdate(
      { _id: messageId, status: 'pending' },
      { $set: { status: 'processing' } },
      { returnDocument: 'after' }
    );
  } catch (error) {
    console.error(`Error claiming submission ${messageId}:`, error);
    return null;
  }
}

export async function finishSubmission(messageId, status, extra = {}) {
  if (!db) return;

  try {
    await db.collection('submissions').updateOne({ _id: messageId }, { $set: { status, ...extra, doneAt: new Date() } });
  } catch (error) {
    console.error(`Error closing submission ${messageId}:`, error);
  }
}

export async function releaseSubmission(messageId) {
  if (!db) return;

  try {
    await db.collection('submissions').updateOne({ _id: messageId, status: 'processing' }, { $set: { status: 'pending' } });
  } catch (error) {
    console.error(`Error releasing submission ${messageId}:`, error);
  }
}

// doneAt defaults to now; a reindex passes the post's own time
export async function recordPublished(id, data) {
  if (!db) await connectDatabase();
  if (!db) return false;

  try {
    await db.collection('submissions').updateOne(
      { _id: id },
      { $set: { doneAt: new Date(), ...data, status: 'approved' } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error('Error recording published resource:', error);
    return false;
  }
}

export async function listResources(guildId) {
  if (!db) await connectDatabase();
  if (!db) return [];

  try {
    return await db.collection('submissions')
      .find({ guildId, status: 'approved', publishedUrl: { $exists: true } })
      .sort({ doneAt: -1 })
      .limit(1000)
      .toArray();
  } catch (error) {
    console.error(`Error listing resources for guild ${guildId}:`, error);
    return [];
  }
}

const LIVE = ['pending', 'processing', 'approved'];

export async function findDuplicates(guildId, sub) {
  if (!db) await connectDatabase();
  if (!db) return [];

  try {
    const rows = await db.collection('submissions').find({ guildId, type: sub.type }).limit(2000).toArray();
    const mine = sub.type === 'link' ? linksOf(sub).map(urlKey) : [];
    const same = (r) => (sub.type === 'link'
      ? linksOf(r).some(u => mine.includes(urlKey(u)))
      : (r.files ?? []).some(f => (sub.files ?? []).some(g => g.name === f.name && g.size && g.size === f.size)));
    return rows
      .filter(r => LIVE.includes(r.status) && same(r))
      .slice(0, 3)
      .map(r => ({ id: r._id, status: r.status, title: r.title, link: r.publishedUrl ?? null }));
  } catch (error) {
    console.error('Error checking for duplicates:', error);
    return [];
  }
}

export async function updateResource(id, data) {
  if (!db) return false;

  try {
    await db.collection('submissions').updateOne({ _id: id }, { $set: data });
    return true;
  } catch (error) {
    console.error(`Error updating resource ${id}:`, error);
    return false;
  }
}

export async function listUserSubmissions(guildId, userId) {
  if (!db) await connectDatabase();
  if (!db) return [];

  try {
    const rows = await db.collection('submissions').find({ guildId, submitterId: userId }).limit(500).toArray();
    const when = (r) => new Date(r.createdAt ?? r.doneAt ?? 0).getTime();
    return rows.sort((a, b) => when(b) - when(a));
  } catch (error) {
    console.error(`Error listing submissions for ${userId}:`, error);
    return [];
  }
}

const MAX_BOOKMARKS = 100;

export async function listBookmarks(guildId, userId) {
  if (!db) await connectDatabase();
  if (!db) return [];

  try {
    return (await db.collection('bookmarks').find({ guildId, userId }).limit(MAX_BOOKMARKS + 50).toArray())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    console.error(`Error listing bookmarks for ${userId}:`, error);
    return [];
  }
}

export async function addBookmark(guildId, userId, resourceId) {
  if (!db) await connectDatabase();
  if (!db) return 'error';

  try {
    const _id = `${guildId}:${userId}:${resourceId}`;
    const existing = await listBookmarks(guildId, userId);
    if (existing.some(b => b._id === _id)) return 'exists';
    if (existing.length >= MAX_BOOKMARKS) return 'full';
    await db.collection('bookmarks').updateOne({ _id }, { $set: { guildId, userId, resourceId, createdAt: new Date() } }, { upsert: true });
    return 'added';
  } catch (error) {
    console.error('Error adding bookmark:', error);
    return 'error';
  }
}

export async function removeBookmark(guildId, userId, resourceId) {
  if (!db) await connectDatabase();
  if (!db) return false;

  try {
    const result = await db.collection('bookmarks').deleteOne({ _id: `${guildId}:${userId}:${resourceId}` });
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Error removing bookmark:', error);
    return false;
  }
}

export async function nextResourceNumber(guildId) {
  if (!db) await connectDatabase();
  if (!db) return null;

  try {
    const doc = await db.collection('counters').findOneAndUpdate(
      { _id: `resource:${guildId}` },
      { $inc: { n: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    return doc?.n ?? null;
  } catch (error) {
    console.error(`Error numbering a resource for guild ${guildId}:`, error);
    return null;
  }
}

export async function numberResources(guildId) {
  if (!db) await connectDatabase();
  if (!db) return 0;

  try {
    const rows = await db.collection('submissions').find({ guildId, status: 'approved' }).limit(5000).toArray();
    const todo = rows.filter(r => !r.number).sort((a, b) => new Date(a.doneAt ?? 0) - new Date(b.doneAt ?? 0));
    let done = 0;
    for (const r of todo) {
      const number = await nextResourceNumber(guildId);
      if (!number) break;
      await db.collection('submissions').updateOne({ _id: r._id }, { $set: { number } });
      done++;
    }
    return done;
  } catch (error) {
    console.error(`Error numbering resources for guild ${guildId}:`, error);
    return 0;
  }
}

export async function findResource(guildId, input) {
  const text = String(input ?? '').trim();
  const resources = await listResources(guildId);
  const n = /^#?(\d+)$/.exec(text);
  return (n && resources.find(r => r.number === Number(n[1]))) || resources.find(r => r._id === text) || null;
}
