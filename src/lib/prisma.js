import { PrismaClient } from '@prisma/client';

const globalForPrisma = global;

// In-memory fallback store for offline/ephemeral environment
const inMemoryStore = {
  users: new Map([['default-user', { id: 'default-user', email: 'demo@moneymap.app', createdAt: new Date() }]]),
  sources: new Map(),
  documents: new Map(),
  transactions: new Map(),
  obligations: new Map(),
  merchantAliases: new Map(),
  insights: new Map(),
  feedback: new Map(),
};

function createInMemoryModel(collectionName) {
  const store = inMemoryStore[collectionName] || new Map();
  return {
    findMany: async (args = {}) => {
      let items = Array.from(store.values());
      if (args.where) {
        if (args.where.userId) {
          items = items.filter(i => i.userId === args.where.userId);
        }
        if (args.where.period) {
          items = items.filter(i => i.period === args.where.period);
        }
        if (args.where.merchantNormalized) {
          items = items.filter(i => i.merchantNormalized === args.where.merchantNormalized);
        }
      }
      return items;
    },
    findFirst: async (args = {}) => {
      const items = await createInMemoryModel(collectionName).findMany(args);
      return items[0] || null;
    },
    findUnique: async (args = {}) => {
      if (args.where?.id) {
        return store.get(args.where.id) || null;
      }
      if (args.where?.email) {
        for (const item of store.values()) {
          if (item.email === args.where.email) return item;
        }
      }
      return null;
    },
    create: async (args = {}) => {
      const id = args.data?.id || `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const created = { id, ...args.data, createdAt: new Date() };
      store.set(id, created);
      return created;
    },
    update: async (args = {}) => {
      const id = args.where?.id;
      const existing = store.get(id) || { id };
      const updated = { ...existing, ...args.data };
      store.set(id, updated);
      return updated;
    },
    updateMany: async (args = {}) => {
      let count = 0;
      for (const [id, item] of store.entries()) {
        if (!args.where || (!args.where.userId || item.userId === args.where.userId)) {
          store.set(id, { ...item, ...args.data });
          count++;
        }
      }
      return { count };
    },
    delete: async (args = {}) => {
      const id = args.where?.id;
      store.delete(id);
      return { id };
    }
  };
}

const mockPrisma = {
  user: createInMemoryModel('users'),
  source: createInMemoryModel('sources'),
  document: createInMemoryModel('documents'),
  transaction: createInMemoryModel('transactions'),
  obligation: createInMemoryModel('obligations'),
  merchantAlias: createInMemoryModel('merchantAliases'),
  insight: createInMemoryModel('insights'),
  userFeedback: createInMemoryModel('feedback'),
};

let realPrisma = null;
try {
  realPrisma = globalForPrisma.prisma || new PrismaClient();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = realPrisma;
} catch (e) {
  console.warn('[AI Studio] PrismaClient initialization failed — using in-memory mock', e?.message);
}

// Proxied export that tries real Prisma first and falls back to in-memory store on error
export const prisma = new Proxy(realPrisma || mockPrisma, {
  get(target, modelProp) {
    const model = (target && target[modelProp]) || mockPrisma[modelProp] || createInMemoryModel(modelProp);
    return new Proxy(model, {
      get(targetModel, methodProp) {
        const origMethod = targetModel[methodProp];
        if (typeof origMethod !== 'function') {
          return mockPrisma[modelProp]?.[methodProp] || (async () => null);
        }
        return async (...args) => {
          try {
            return await origMethod.apply(targetModel, args);
          } catch (err) {
            console.warn(`[AI Studio] Prisma ${String(modelProp)}.${String(methodProp)} failed, using mock fallback:`, err?.message);
            const fallbackMethod = mockPrisma[modelProp]?.[methodProp];
            if (fallbackMethod) {
              return await fallbackMethod(...args);
            }
            return null;
          }
        };
      }
    });
  }
});

