(function (global) {
    'use strict';

    const DB_NAME = 'urgencyFlowDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'appState';

    function openAppDB() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB is not supported in this browser.'));
                return;
            }

            let request;
            try {
                request = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (error) {
                reject(error);
                return;
            }

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error || new Error('Failed to open IndexedDB.'));
            };
        });
    }

    const api = {
        DB_NAME,
        DB_VERSION,
        STORE_NAME,
        openAppDB
    };

    global.AppDB = api;
    global.openAppDB = openAppDB;
})(window);
