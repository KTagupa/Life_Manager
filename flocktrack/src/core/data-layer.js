(function(root) {
  const OVERVIEW_STORES = ["eggBatches", "birds", "measurements", "reminderInstances", "eggStates", "pens", "feedTypes", "penFeedLogs", "financeEntries"];
  const DEFERRED_STORES = ["healthEvents", "reminderRules"];
  const sortEggProgressPhotos = rows => [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (Number(a?.dayNumber) || 0) - (Number(b?.dayNumber) || 0) || new Date(a?.takenAt || 0) - new Date(b?.takenAt || 0));
  const toPhotoExportRows = rows => rows.map(photo => ({
    id: photo.id,
    birdId: photo.birdId,
    takenAt: photo.takenAt,
    sizeKb: photo.sizeKb,
    hasImage: photo.hasImage != null ? !!photo.hasImage : !!photo.dataUrl
  }));
  const readStores = async stores => Object.fromEntries(await Promise.all(stores.map(async store => [store, await dbAll(store)])));
  const normalizeOverviewData = stores => ({
    eggBatches: stores.eggBatches || [],
    birds: stores.birds || [],
    measurements: stores.measurements || [],
    reminderInstances: stores.reminderInstances || [],
    eggStates: stores.eggStates || [],
    pens: stores.pens || [],
    feedTypes: stores.feedTypes || [],
    penFeedLogs: stores.penFeedLogs || [],
    financeEntries: stores.financeEntries || []
  });
  const normalizeDeferredData = stores => ({
    healthEvents: stores.healthEvents || [],
    reminderRules: stores.reminderRules || []
  });
  root.FlockTrackData = {
    loadOverviewData: async () => normalizeOverviewData(await readStores(OVERVIEW_STORES)),
    loadDeferredData: async () => normalizeDeferredData(await readStores(DEFERRED_STORES)),
    loadCoreData: async () => {
      const [overviewStores, deferredStores] = await Promise.all([readStores(OVERVIEW_STORES), readStores(DEFERRED_STORES)]);
      return {
        ...normalizeOverviewData(overviewStores),
        ...normalizeDeferredData(deferredStores)
      };
    },
    loadPhotoExportRows: async () => toPhotoExportRows(await dbAll("birdPhotos")),
    loadBirdPhotos: async birdId => {
      const rows = await dbByIndex("birdPhotos", "birdId", birdId);
      rows.sort((a, b) => new Date(a.takenAt || 0) - new Date(b.takenAt || 0));
      return rows;
    },
    loadEggProgressPhotos: async eggId => sortEggProgressPhotos(await dbByIndex("eggProgressPhotos", "eggId", eggId)),
    exportAllStores: async () => {
      const stores = {};
      let total = 0;
      for (const store of STORES) {
        const rows = await dbAll(store);
        stores[store] = rows;
        total += rows.length;
      }
      return {
        stores,
        total
      };
    },
    replaceStores: async normalized => {
      for (const store of STORES) await dbReplace(store, normalized[store] || []);
    },
    clearAllStores: async () => {
      for (const store of STORES) await dbClear(store);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
