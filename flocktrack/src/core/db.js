const DB_NAME = "FlockTrackDB";
const DB_VER = 7;
const STORES = ["eggBatches", "birds", "measurements", "healthEvents", "reminderRules", "reminderInstances", "eggStates", "birdPhotos", "eggProgressPhotos", "pens", "feedTypes", "penFeedLogs", "financeEntries"];
const CORE_STORES = STORES.filter(s => s !== "birdPhotos" && s !== "eggProgressPhotos");
const STATUS_COLORS = {
  active: "#15803d",
  sold: "#a16207",
  deceased: "#b91c1c",
  culled: "#c2410c"
};
let dbConnPromise = null;
const openDB = () => {
  if (dbConnPromise) return dbConnPromise;
  dbConnPromise = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      STORES.forEach(s => {
        let st;
        if (!db.objectStoreNames.contains(s)) st = db.createObjectStore(s, {
          keyPath: "id"
        });else st = e.target.transaction.objectStore(s);
        if (s === "birdPhotos") {
          if (!st.indexNames.contains("birdId")) st.createIndex("birdId", "birdId", {
            unique: false
          });
          if (!st.indexNames.contains("takenAt")) st.createIndex("takenAt", "takenAt", {
            unique: false
          });
        }
        if (s === "eggProgressPhotos") {
          if (!st.indexNames.contains("eggId")) st.createIndex("eggId", "eggId", {
            unique: false
          });
          if (!st.indexNames.contains("batchId")) st.createIndex("batchId", "batchId", {
            unique: false
          });
          if (!st.indexNames.contains("takenAt")) st.createIndex("takenAt", "takenAt", {
            unique: false
          });
        }
        if (s === "penFeedLogs") {
          if (!st.indexNames.contains("penId")) st.createIndex("penId", "penId", {
            unique: false
          });
          if (!st.indexNames.contains("loggedAt")) st.createIndex("loggedAt", "loggedAt", {
            unique: false
          });
        }
      });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => {
      dbConnPromise = null;
      rej(r.error);
    };
  });
  return dbConnPromise;
};
const reqResult = req => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});
const txDone = tx => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error || new Error("Transaction aborted"));
});
const withStore = async (s, mode, run) => {
  const db = await openDB();
  const tx = db.transaction(s, mode);
  return run(tx.objectStore(s), tx);
};
const dbAll = s => withStore(s, "readonly", st => reqResult(st.getAll()).then(r => r || []));
const dbPut = (s, item) => withStore(s, "readwrite", st => reqResult(st.put(item)).then(() => undefined));
const dbDel = (s, id) => withStore(s, "readwrite", st => reqResult(st.delete(id)).then(() => undefined));
const dbClear = s => withStore(s, "readwrite", st => reqResult(st.clear()).then(() => undefined));
const dbReplace = (s, items) => withStore(s, "readwrite", (st, tx) => {
  st.clear();
  items.forEach(it => st.put(it));
  return txDone(tx);
});
const dbByIndex = (s, idx, key) => withStore(s, "readonly", st => {
  if (!st.indexNames.contains(idx)) return [];
  return reqResult(st.index(idx).getAll(key)).then(r => r || []);
});
const dbDelByIndex = (s, idx, key) => withStore(s, "readwrite", (st, tx) => {
  if (!st.indexNames.contains(idx)) return undefined;
  const rq = st.index(idx).openCursor(IDBKeyRange.only(key));
  rq.onsuccess = e => {
    const c = e.target.result;
    if (c) {
      c.delete();
      c.continue();
    }
  };
  rq.onerror = () => {
    tx.abort();
  };
  return txDone(tx);
});
