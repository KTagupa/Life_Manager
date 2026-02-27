(function (global) {
    'use strict';

    const CHANNEL_NAME = 'app-notes';
    let channel = null;

    function supportsBroadcastChannel() {
        return typeof global.BroadcastChannel !== 'undefined';
    }

    function getChannel() {
        if (!supportsBroadcastChannel()) return null;
        if (!channel) channel = new global.BroadcastChannel(CHANNEL_NAME);
        return channel;
    }

    function initNotesChannel(onMessage) {
        const ch = getChannel();
        if (!ch) return null;

        if (typeof onMessage === 'function') {
            ch.onmessage = (event) => {
                onMessage(event && event.data ? event.data : {});
            };
        }

        return ch;
    }

    function broadcastNotesEvent(payload) {
        const ch = getChannel();
        if (!ch) return;

        ch.postMessage({
            type: payload && payload.type ? payload.type : 'updated',
            id: payload && payload.id ? payload.id : null,
            timestamp: Date.now()
        });
    }

    const api = {
        CHANNEL_NAME,
        initNotesChannel,
        broadcastNotesEvent
    };

    global.NotesSync = api;
})(window);
