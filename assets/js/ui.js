// --- UTILITIES FOR LINKS ---
function linkify(text) {
    if (!text) return '';
    // Optimized regex for web and local app protocols
    const urlRegex = /(\b(https?|ftp|file|obsidian|notion|vscode):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function (url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline;" onclick="event.stopPropagation()">${url}</a>`;
    });
}

function extractLink(text) {
    if (!text) return null;
    // Updated regex to include obsidian protocol explicitly
    const match = text.match(/(\b(https?|ftp|file|obsidian):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/i);
    return match ? match[0] : null;
}


// --- TOOLBAR LOGIC ---
function toggleMenu() {
    const tb = document.getElementById('toolbar');
    const btn = document.getElementById('menu-btn');
    const content = document.getElementById('toolbar-content');

    tb.classList.toggle('collapsed');

    if (tb.classList.contains('collapsed')) {
        btn.innerHTML = '☰';
        content.style.display = 'none';
    } else {
        btn.innerHTML = '✕';
        content.style.display = 'flex';
    }
}

// --- QUICK LINKS ---
const MAX_QUICK_LINKS = 5;

function openQuickLinkModal() {
    if (Array.isArray(quickLinks) && quickLinks.length >= MAX_QUICK_LINKS) {
        showNotification('Quick link limit reached (5 max).');
        return;
    }
    const modal = document.getElementById('quick-link-modal');
    const labelInput = document.getElementById('quick-link-label');
    const urlInput = document.getElementById('quick-link-url');
    if (!modal || !labelInput || !urlInput) return;
    labelInput.value = '';
    urlInput.value = '';
    modal.style.display = 'flex';
    setTimeout(() => urlInput.focus(), 0);
}

function closeQuickLinkModal() {
    const modal = document.getElementById('quick-link-modal');
    if (modal) modal.style.display = 'none';
}

function normalizeQuickLinkUrl(input) {
    const trimmed = (input || '').trim();
    if (!trimmed) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return trimmed;
    if (/\.(html?|pdf|md)$/i.test(trimmed)) return trimmed;
    const firstSegment = trimmed.split('/')[0];
    if (firstSegment.includes('.') && !/\.(html?|pdf|md)$/i.test(firstSegment)) {
        return 'https://' + trimmed;
    }
    return trimmed;
}

function deriveQuickLinkLabel(url) {
    if (!url) return 'LINK';
    let cleaned = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    cleaned = cleaned.replace(/^www\./, '');
    cleaned = cleaned.split(/[?#]/)[0];
    const parts = cleaned.split('/');
    let base = parts[0] || cleaned;
    if (cleaned.startsWith('/') || cleaned.startsWith('./') || cleaned.startsWith('../')) {
        base = parts[parts.length - 1] || cleaned;
    }
    base = base.replace(/\\.[a-z0-9]+$/i, '');
    base = base.replace(/[^a-zA-Z0-9]/g, '');
    if (!base) return 'LINK';
    return base.toUpperCase();
}

function getQuickLinkDisplayLabel(link) {
    const label = (link && link.label && link.label.trim()) ? link.label.trim() : deriveQuickLinkLabel(link.url);
    const cleaned = label.replace(/[^a-zA-Z0-9]/g, '');
    const display = cleaned || label;
    return display.length > 4 ? display.slice(0, 4).toUpperCase() : display.toUpperCase();
}

function renderQuickLinks() {
    const container = document.getElementById('quick-links-container');
    const addBtn = document.getElementById('btn-add-quick-link');
    if (!container) return;
    container.innerHTML = '';

    const links = Array.isArray(quickLinks) ? quickLinks.slice(0, MAX_QUICK_LINKS) : [];
    links.forEach(link => {
        const wrapper = document.createElement('div');
        wrapper.className = 'quick-link-wrapper';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quick-link-btn';
        btn.title = `${link.label || deriveQuickLinkLabel(link.url)} • ${link.url}`;
        btn.innerText = getQuickLinkDisplayLabel(link);
        btn.addEventListener('click', () => {
            if (!link.url) return;
            const isExternal = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link.url);
            if (isExternal) {
                window.open(link.url, '_blank', 'noopener,noreferrer');
            } else {
                window.location.href = link.url;
            }
        });

        const removeBtn = document.createElement('div');
        removeBtn.className = 'quick-link-remove';
        removeBtn.title = 'Remove link';
        removeBtn.innerText = '✕';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteQuickLink(link.id);
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(removeBtn);
        container.appendChild(wrapper);
    });

    if (addBtn) {
        addBtn.style.display = links.length >= MAX_QUICK_LINKS ? 'none' : 'flex';
    }
}

function saveQuickLink() {
    const labelInput = document.getElementById('quick-link-label');
    const urlInput = document.getElementById('quick-link-url');
    if (!labelInput || !urlInput) return;

    if (Array.isArray(quickLinks) && quickLinks.length >= MAX_QUICK_LINKS) {
        showNotification('Quick link limit reached (5 max).');
        closeQuickLinkModal();
        return;
    }

    const label = labelInput.value.trim();
    const normalizedUrl = normalizeQuickLinkUrl(urlInput.value);
    if (!normalizedUrl) {
        showNotification('Please enter a valid link.');
        return;
    }

    const link = {
        id: 'ql_' + Date.now() + Math.random().toString(36).substr(2, 5),
        label: label,
        url: normalizedUrl
    };

    if (!Array.isArray(quickLinks)) quickLinks = [];
    quickLinks.push(link);
    if (quickLinks.length > MAX_QUICK_LINKS) quickLinks = quickLinks.slice(0, MAX_QUICK_LINKS);

    saveToStorage();
    renderQuickLinks();
    closeQuickLinkModal();
    showNotification('Quick link added.');
}

function deleteQuickLink(id) {
    if (!Array.isArray(quickLinks)) return;
    quickLinks = quickLinks.filter(link => link.id !== id);
    saveToStorage();
    renderQuickLinks();
    showNotification('Quick link removed.');
}

// --- REMINDERS ---
const REMINDER_ALL_DAY_TIME = '06:25';
let reminderFocusKey = null;

function getLocalDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getNextDefaultReminderTime() {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    d.setSeconds(0, 0);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function ensureRemindersArray() {
    if (!Array.isArray(reminders)) reminders = [];
}

function getReminderForItem(itemType, itemId) {
    ensureRemindersArray();
    return reminders.find(rem => rem.itemType === itemType && rem.itemId === itemId) || null;
}

function hasReminderForItem(itemType, itemId) {
    return !!getReminderForItem(itemType, itemId);
}

function getReminderItem(itemType, itemId) {
    if (itemType === 'task') return nodes.find(n => n.id === itemId) || archivedNodes.find(n => n.id === itemId) || null;
    if (itemType === 'note') return notes.find(n => n.id === itemId) || null;
    if (itemType === 'habit') return habits.find(h => h.id === itemId) || null;
    if (itemType === 'inbox') return inbox.find(i => i.id === itemId) || null;
    return null;
}

function getReminderItemTitle(reminder) {
    const item = getReminderItem(reminder.itemType, reminder.itemId);
    if (item) {
        if (reminder.itemType === 'note') return item.title || '(Untitled Note)';
        return item.title || '(Untitled)';
    }
    return reminder.itemTitleSnapshot || '(Missing Item)';
}

function getReminderTypeLabel(itemType) {
    if (itemType === 'task') return 'Task';
    if (itemType === 'note') return 'Note';
    if (itemType === 'habit') return 'Habit';
    if (itemType === 'inbox') return 'Inbox';
    return 'Item';
}

function createOrUpdateReminderForItem(itemType, itemId, payload = {}) {
    ensureRemindersArray();
    const item = getReminderItem(itemType, itemId);
    if (!item) return null;

    const now = Date.now();
    const existing = getReminderForItem(itemType, itemId);
    const nextAllDay = payload.allDay === undefined ? (existing ? existing.allDay : false) : !!payload.allDay;

    if (existing) {
        existing.date = payload.date || existing.date || getLocalDateString();
        existing.time = nextAllDay ? REMINDER_ALL_DAY_TIME : (payload.time || existing.time || getNextDefaultReminderTime());
        existing.allDay = nextAllDay;
        existing.updatedAt = now;
        existing.itemTitleSnapshot = item.title || existing.itemTitleSnapshot || '';
        if (typeof payload.firedAt !== 'undefined') existing.firedAt = payload.firedAt;
        if (typeof payload.firstFiredAt !== 'undefined') existing.firstFiredAt = payload.firstFiredAt;
        if (typeof payload.kept !== 'undefined') existing.kept = !!payload.kept;
        if (typeof payload.keepUntilTs !== 'undefined') existing.keepUntilTs = payload.keepUntilTs;
        if (typeof payload.discarded !== 'undefined') existing.discarded = !!payload.discarded;
        if (typeof payload.lastFiredOccurrenceTs !== 'undefined') existing.lastFiredOccurrenceTs = payload.lastFiredOccurrenceTs;
        return existing;
    }

    const reminder = {
        id: 'rem_' + Date.now() + Math.random().toString(36).substr(2, 5),
        itemType: itemType,
        itemId: itemId,
        itemTitleSnapshot: item.title || '',
        date: payload.date || getLocalDateString(),
        time: nextAllDay ? REMINDER_ALL_DAY_TIME : (payload.time || getNextDefaultReminderTime()),
        allDay: nextAllDay,
        createdAt: now,
        updatedAt: now,
        firedAt: null,
        firstFiredAt: null,
        kept: false,
        keepUntilTs: null,
        discarded: false,
        lastFiredOccurrenceTs: null
    };
    reminders.push(reminder);
    return reminder;
}

function quickCreateReminderForItem(itemType, itemId) {
    const reminder = createOrUpdateReminderForItem(itemType, itemId);
    if (!reminder) return;
    saveToStorage();
    renderReminderStrip();
    renderRemindersModal();
    if (typeof renderNotesList === 'function') renderNotesList();
    if (typeof renderHabits === 'function') renderHabits();
    if (typeof renderInbox === 'function') renderInbox();
    if (typeof renderInboxModal === 'function') renderInboxModal();
    if (selectedNodeId && typeof updateInspector === 'function') updateInspector();
}

function openRemindersModal(itemType = null, itemId = null) {
    const modal = document.getElementById('reminders-modal');
    if (!modal) return;

    if (itemType && itemId) {
        quickCreateReminderForItem(itemType, itemId);
        reminderFocusKey = `${itemType}::${itemId}`;
    } else {
        reminderFocusKey = null;
    }

    if (remindersModalPosition.x !== null && remindersModalPosition.y !== null) {
        modal.style.left = remindersModalPosition.x + 'px';
        modal.style.top = remindersModalPosition.y + 'px';
        modal.style.transform = 'none';
    }
    if (remindersModalPosition.width && remindersModalPosition.height) {
        modal.style.width = remindersModalPosition.width + 'px';
        modal.style.height = remindersModalPosition.height + 'px';
    }

    modal.classList.add('visible');
    renderRemindersModal();
}

function toggleRemindersModal(itemType = null, itemId = null) {
    const modal = document.getElementById('reminders-modal');
    if (!modal) return;
    if (modal.classList.contains('visible') && !itemType) closeRemindersModal();
    else openRemindersModal(itemType, itemId);
}

function closeRemindersModal() {
    const modal = document.getElementById('reminders-modal');
    if (!modal) return;

    const rect = modal.getBoundingClientRect();
    remindersModalPosition = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    };
    localStorage.setItem('remindersModalPosition', JSON.stringify(remindersModalPosition));
    modal.classList.remove('visible');
}

function getReminderEffectiveTime(reminder) {
    return reminder.allDay ? REMINDER_ALL_DAY_TIME : (reminder.time || REMINDER_ALL_DAY_TIME);
}

function parseReminderBaseTimestamp(reminder) {
    if (!reminder || !reminder.date) return null;
    const ts = new Date(`${reminder.date}T${getReminderEffectiveTime(reminder)}:00`).getTime();
    return Number.isFinite(ts) ? ts : null;
}

function getHabitReminderFrequency(reminder) {
    const habit = getReminderItem('habit', reminder.itemId);
    return (habit && habit.frequency) ? habit.frequency : 'daily';
}

function getMonthlyCandidate(year, month, day, hours, mins) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const useDay = Math.min(day, lastDay);
    return new Date(year, month, useDay, hours, mins, 0, 0).getTime();
}

function getHabitOccurrenceAtOrBefore(reminder, nowTs) {
    const baseTs = parseReminderBaseTimestamp(reminder);
    if (!baseTs) return null;
    if (nowTs < baseTs) return null;

    const base = new Date(baseTs);
    const hour = base.getHours();
    const min = base.getMinutes();
    const freq = getHabitReminderFrequency(reminder);

    if (freq === 'weekly') {
        const targetDow = base.getDay();
        const now = new Date(nowTs);
        const candidate = new Date(nowTs);
        candidate.setHours(hour, min, 0, 0);
        const diff = (candidate.getDay() - targetDow + 7) % 7;
        candidate.setDate(candidate.getDate() - diff);
        if (candidate.getTime() > now.getTime()) candidate.setDate(candidate.getDate() - 7);
        if (candidate.getTime() < baseTs) return null;
        return candidate.getTime();
    }

    if (freq === 'monthly') {
        const baseDay = base.getDate();
        const now = new Date(nowTs);
        let year = now.getFullYear();
        let month = now.getMonth();
        let candidateTs = getMonthlyCandidate(year, month, baseDay, hour, min);
        if (candidateTs > nowTs) {
            month -= 1;
            if (month < 0) {
                month = 11;
                year -= 1;
            }
            candidateTs = getMonthlyCandidate(year, month, baseDay, hour, min);
        }
        if (candidateTs < baseTs) return null;
        return candidateTs;
    }

    // daily (default)
    const candidate = new Date(nowTs);
    candidate.setHours(hour, min, 0, 0);
    if (candidate.getTime() > nowTs) candidate.setDate(candidate.getDate() - 1);
    if (candidate.getTime() < baseTs) return null;
    return candidate.getTime();
}

function getReminderNextOccurrence(reminder, nowTs = Date.now()) {
    const baseTs = parseReminderBaseTimestamp(reminder);
    if (!baseTs) return null;
    if (reminder.itemType !== 'habit') return baseTs;

    const base = new Date(baseTs);
    const hour = base.getHours();
    const min = base.getMinutes();
    const freq = getHabitReminderFrequency(reminder);

    if (freq === 'weekly') {
        const targetDow = base.getDay();
        const candidate = new Date(nowTs);
        candidate.setHours(hour, min, 0, 0);
        const diff = (targetDow - candidate.getDay() + 7) % 7;
        candidate.setDate(candidate.getDate() + diff);
        if (candidate.getTime() <= nowTs) candidate.setDate(candidate.getDate() + 7);
        if (candidate.getTime() < baseTs) return baseTs;
        return candidate.getTime();
    }

    if (freq === 'monthly') {
        const baseDay = base.getDate();
        const now = new Date(nowTs);
        let year = now.getFullYear();
        let month = now.getMonth();
        let candidateTs = getMonthlyCandidate(year, month, baseDay, hour, min);
        if (candidateTs <= nowTs) {
            month += 1;
            if (month > 11) {
                month = 0;
                year += 1;
            }
            candidateTs = getMonthlyCandidate(year, month, baseDay, hour, min);
        }
        return Math.max(candidateTs, baseTs);
    }

    // daily (default)
    const candidate = new Date(nowTs);
    candidate.setHours(hour, min, 0, 0);
    if (candidate.getTime() <= nowTs) candidate.setDate(candidate.getDate() + 1);
    return Math.max(candidate.getTime(), baseTs);
}

function formatReminderWhen(reminder) {
    const nextTs = getReminderNextOccurrence(reminder, Date.now());
    if (reminder.discarded && reminder.itemType !== 'habit') {
        return 'Discarded';
    }
    if (reminder.firedAt && reminder.itemType !== 'habit') {
        return `Fired: ${new Date(reminder.firedAt).toLocaleString()}`;
    }
    if (!nextTs) return 'Time unavailable';
    return `Next: ${new Date(nextTs).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}

function updateReminderButtonState() {
    const btn = document.getElementById('btn-reminders-modal');
    if (!btn) return;
    const firedCount = reminders.filter(rem => !!rem.firedAt).length;
    btn.innerText = firedCount > 0 ? `🔔 ${firedCount}` : '🔔';
}

function renderReminderStrip() {
    ensureRemindersArray();
    const strip = document.getElementById('reminder-alert-strip');
    if (!strip) return;
    strip.innerHTML = '';

    const nowTs = Date.now();
    const activeFired = reminders.filter(rem => {
        if (!rem.firedAt || rem.discarded) return false;
        if (rem.kept && rem.keepUntilTs && nowTs > rem.keepUntilTs) return false;
        return true;
    });
    activeFired.sort((a, b) => Number(b.firedAt || 0) - Number(a.firedAt || 0));

    if (activeFired.length === 0) {
        strip.classList.remove('has-items');
        updateReminderButtonState();
        return;
    }

    strip.classList.add('has-items');
    activeFired.forEach(reminder => {
        const card = document.createElement('div');
        card.className = `reminder-chip ${reminder.kept ? 'kept' : ''}`;
        card.innerHTML = `
            <div class="reminder-chip-title">${getReminderItemTitle(reminder)}</div>
            <div class="reminder-chip-meta">${getReminderTypeLabel(reminder.itemType)} • ${new Date(reminder.firedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div class="reminder-chip-actions">
                <button class="rem-chip-btn keep ${reminder.kept ? 'active' : ''}" onclick="keepReminder('${reminder.id}')">${reminder.kept ? 'Kept' : 'Keep'}</button>
                <button class="rem-chip-btn discard" onclick="discardReminder('${reminder.id}')">Discard</button>
            </div>
        `;
        strip.appendChild(card);
    });

    updateReminderButtonState();
}

function renderRemindersModal() {
    ensureRemindersArray();
    const list = document.getElementById('reminders-modal-list');
    if (!list) return;
    list.innerHTML = '';

    const sorted = [...reminders].sort((a, b) => {
        const aFired = !!a.firedAt;
        const bFired = !!b.firedAt;
        if (aFired !== bFired) return aFired ? -1 : 1;
        return Number(a.updatedAt || 0) > Number(b.updatedAt || 0) ? -1 : 1;
    });

    if (sorted.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:40px 20px; font-size: 13px;">No reminders yet.</div>';
        return;
    }

    sorted.forEach(reminder => {
        const card = document.createElement('div');
        const key = `${reminder.itemType}::${reminder.itemId}`;
        card.className = `reminder-item-card ${reminder.firedAt ? 'fired' : ''} ${reminder.kept ? 'kept' : ''} ${reminderFocusKey === key ? 'focused' : ''}`;

        card.innerHTML = `
            <div class="reminder-item-head">
                <div class="reminder-item-type">${getReminderTypeLabel(reminder.itemType)}</div>
                <div class="reminder-item-title">${getReminderItemTitle(reminder)}</div>
            </div>
            <div class="reminder-item-sub">${formatReminderWhen(reminder)}</div>
            <div class="reminder-edit-row">
                <input type="date" value="${reminder.date || ''}" onchange="updateReminderField('${reminder.id}', 'date', this.value)">
                <input type="time" value="${getReminderEffectiveTime(reminder)}" ${reminder.allDay ? 'disabled' : ''} onchange="updateReminderField('${reminder.id}', 'time', this.value)">
                <label class="all-day-toggle">
                    <input type="checkbox" ${reminder.allDay ? 'checked' : ''} onchange="toggleReminderAllDay('${reminder.id}', this.checked)">
                    All Day (6:25 AM)
                </label>
            </div>
            <div class="reminder-edit-actions">
                ${reminder.firedAt ? `<button class="btn rem-keep-btn ${reminder.kept ? 'active' : ''}" onclick="keepReminder('${reminder.id}')">${reminder.kept ? 'Kept' : 'Keep'}</button>` : ''}
                <button class="btn btn-danger" onclick="discardReminder('${reminder.id}')">Discard</button>
            </div>
        `;
        list.appendChild(card);
    });
}

function updateReminderField(reminderId, field, value) {
    ensureRemindersArray();
    const reminder = reminders.find(rem => rem.id === reminderId);
    if (!reminder) return;
    if (field === 'date') reminder.date = value;
    if (field === 'time') reminder.time = value || reminder.time;
    reminder.firedAt = null;
    reminder.kept = false;
    reminder.keepUntilTs = null;
    reminder.discarded = false;
    reminder.lastFiredOccurrenceTs = null;
    if (reminder.itemType !== 'habit') reminder.firstFiredAt = null;
    reminder.updatedAt = Date.now();
    reminder.itemTitleSnapshot = getReminderItemTitle(reminder);
    saveToStorage();
    renderReminderStrip();
    renderRemindersModal();
    if (selectedNodeId && reminder.itemType === 'task' && reminder.itemId === selectedNodeId) updateInspector();
}

function updateReminderFieldByItem(itemType, itemId, field, value) {
    const reminder = getReminderForItem(itemType, itemId);
    if (!reminder) return;
    updateReminderField(reminder.id, field, value);
}

function toggleReminderAllDay(reminderId, checked) {
    ensureRemindersArray();
    const reminder = reminders.find(rem => rem.id === reminderId);
    if (!reminder) return;
    reminder.allDay = !!checked;
    reminder.time = checked ? REMINDER_ALL_DAY_TIME : (reminder.time || getNextDefaultReminderTime());
    reminder.firedAt = null;
    reminder.kept = false;
    reminder.keepUntilTs = null;
    reminder.discarded = false;
    reminder.lastFiredOccurrenceTs = null;
    if (reminder.itemType !== 'habit') reminder.firstFiredAt = null;
    reminder.updatedAt = Date.now();
    saveToStorage();
    renderReminderStrip();
    renderRemindersModal();
    if (selectedNodeId && reminder.itemType === 'task' && reminder.itemId === selectedNodeId) updateInspector();
}

function toggleReminderAllDayByItem(itemType, itemId, checked) {
    const reminder = getReminderForItem(itemType, itemId);
    if (!reminder) return;
    toggleReminderAllDay(reminder.id, checked);
}

function keepReminder(reminderId) {
    const reminder = reminders.find(rem => rem.id === reminderId);
    if (!reminder) return;
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    reminder.kept = true;
    reminder.keepUntilTs = endOfDay.getTime();
    reminder.discarded = false;
    reminder.updatedAt = Date.now();
    saveToStorage();
    renderReminderStrip();
    renderRemindersModal();
}

function discardReminder(reminderId) {
    ensureRemindersArray();
    const reminder = reminders.find(rem => rem.id === reminderId);
    if (!reminder) return;
    if (reminder.itemType === 'habit') {
        reminder.firedAt = null;
        reminder.kept = false;
        reminder.keepUntilTs = null;
        reminder.discarded = false;
    } else {
        reminder.firedAt = null;
        reminder.kept = false;
        reminder.keepUntilTs = null;
        reminder.discarded = true;
    }
    const removed = reminder;
    reminder.updatedAt = Date.now();
    saveToStorage();
    renderReminderStrip();
    renderRemindersModal();
    if (selectedNodeId && removed.itemType === 'task' && removed.itemId === selectedNodeId) updateInspector();
    if (typeof renderNotesList === 'function') renderNotesList();
    if (typeof renderHabits === 'function') renderHabits();
    if (typeof renderInbox === 'function') renderInbox();
    if (typeof renderInboxModal === 'function') renderInboxModal();
}

function discardReminderByItem(itemType, itemId) {
    const reminder = getReminderForItem(itemType, itemId);
    if (!reminder) return;
    discardReminder(reminder.id);
}

function transferReminderAssignment(fromType, fromId, toType, toId, toTitle = '') {
    const reminder = getReminderForItem(fromType, fromId);
    if (!reminder) return;
    const existingTarget = getReminderForItem(toType, toId);
    if (existingTarget && existingTarget.id !== reminder.id) {
        discardReminder(existingTarget.id);
    }
    reminder.itemType = toType;
    reminder.itemId = toId;
    reminder.itemTitleSnapshot = toTitle || reminder.itemTitleSnapshot || '';
    reminder.updatedAt = Date.now();
    saveToStorage();
    renderReminderStrip();
    renderRemindersModal();
}

function cleanupOrphanReminders() {
    ensureRemindersArray();
    const before = reminders.length;
    reminders = reminders.filter(rem => !!getReminderItem(rem.itemType, rem.itemId));
    if (reminders.length !== before) {
        saveToStorage();
        renderReminderStrip();
        renderRemindersModal();
    }
}

function fireReminder(reminder, occurrenceTs, nowTs) {
    reminder.firedAt = nowTs;
    reminder.lastFiredOccurrenceTs = occurrenceTs;
    reminder.kept = false;
    reminder.keepUntilTs = null;
    reminder.discarded = false;
    if (reminder.itemType !== 'habit' && !reminder.firstFiredAt) {
        reminder.firstFiredAt = nowTs;
    }
    reminder.updatedAt = nowTs;

    const title = getReminderItemTitle(reminder);
    showNotification(`⏰ Reminder: ${title}`);
    if (typeof playAudioFeedback === 'function') playAudioFeedback('reminder');
}

function checkReminderTriggers() {
    ensureRemindersArray();
    cleanupOrphanReminders();

    const nowTs = Date.now();
    let changed = false;

    reminders.forEach(reminder => {
        if (reminder.kept && reminder.keepUntilTs && nowTs > reminder.keepUntilTs) {
            reminder.kept = false;
            reminder.keepUntilTs = null;
            reminder.firedAt = null;
            if (reminder.itemType !== 'habit') reminder.discarded = true;
            reminder.updatedAt = nowTs;
            changed = true;
            return;
        }

        if (reminder.itemType === 'habit') {
            const occurrenceTs = getHabitOccurrenceAtOrBefore(reminder, nowTs);
            if (occurrenceTs && occurrenceTs !== reminder.lastFiredOccurrenceTs) {
                fireReminder(reminder, occurrenceTs, nowTs);
                changed = true;
            }
            return;
        }

        if (reminder.discarded) return;

        const dueTs = parseReminderBaseTimestamp(reminder);
        if (dueTs && dueTs <= nowTs && !reminder.firedAt) {
            fireReminder(reminder, dueTs, nowTs);
            changed = true;
        }
    });

    if (changed) {
        saveToStorage();
        renderReminderStrip();
        renderRemindersModal();
        if (typeof renderNotesList === 'function') renderNotesList();
        if (typeof renderHabits === 'function') renderHabits();
        if (typeof renderInbox === 'function') renderInbox();
        if (typeof renderInboxModal === 'function') renderInboxModal();
        if (selectedNodeId && typeof updateInspector === 'function') updateInspector();
    } else {
        updateReminderButtonState();
    }
}

// --- CONTEXTUAL MENU LOGIC ---
function setupContextualMenu() {
    const menu = document.getElementById('selection-menu');

    document.addEventListener('mouseup', (e) => {
        // 1. Check if clicking inside the menu itself - do nothing
        if (menu.contains(e.target)) return;

        // 2. Check Note Editor Selection
        const noteInput = document.getElementById('note-body-input');
        if (!noteInput.classList.contains('hidden') && noteInput.contains(e.target)) {
            const text = noteInput.value.substring(noteInput.selectionStart, noteInput.selectionEnd).trim();
            if (text) {
                currentSelectionText = text;
                currentSelectionSource = 'note';
                noteSelectionRange = { start: noteInput.selectionStart, end: noteInput.selectionEnd };
                showContextMenu(e.clientX, e.clientY);
                return;
            }
        }

        // 3. Check AI Modal Selection
        const aiModal = document.getElementById('ai-modal');
        if (aiModal && aiModal.classList.contains('visible')) {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            if (text && aiModal.contains(selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentNode : selection.anchorNode)) {
                currentSelectionText = text;
                currentSelectionSource = 'ai';
                noteSelectionRange = null;
                showContextMenu(e.clientX, e.clientY);
                return;
            }
        }

        // 4. Default: Hide menu if no valid selection or click outside
        menu.style.display = 'none';
    });

    // Hide on scroll or resize to prevent floating menu in wrong place
    window.addEventListener('scroll', () => { menu.style.display = 'none'; }, true);
    window.addEventListener('resize', () => { menu.style.display = 'none'; });
}

function showContextMenu(x, y) {
    const menu = document.getElementById('selection-menu');
    menu.style.display = 'flex';

    // Bounds checking
    let left = x;
    let top = y - 40;

    if (left + 150 > window.innerWidth) left = window.innerWidth - 160;
    if (top < 10) top = y + 20; // Show below if too close to top

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
}

function toggleGlobalSearch() {
    let modal = document.getElementById('global-search-modal');
    if (modal) {
        modal.remove();
        return;
    }

    modal = document.createElement('div');
    modal.id = 'global-search-modal';
    modal.style.cssText = `
                position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
                width: 600px; max-width: 90vw; max-height: 60vh;
                background: var(--panel-bg-elevated); border: 1px solid var(--accent);
                border-radius: 12px; z-index: 3000; box-shadow: 0 20px 60px rgba(0,0,0,0.8);
                display: flex; flex-direction: column; overflow: hidden;
            `;

    modal.innerHTML = `
                <div style=\"padding: 16px; border-bottom: 1px solid var(--border);\">
                    <input type=\"text\" id=\"global-search-input\" placeholder=\"Search tasks, notes, goals...\" 
                        style=\"width: 100%; background: var(--node-bg); border: 1px solid var(--border); 
                        color: white; padding: 12px; border-radius: 8px; font-size: 16px; outline: none;\">
                </div>
                <div id=\"global-search-results\" style=\"flex: 1; overflow-y: auto; padding: 8px;\"></div>
                <div style=\"padding: 8px 16px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted);\">
                    ↑↓ navigate • Enter open • Esc close
                </div>
            `;

    document.body.appendChild(modal);

    const input = document.getElementById('global-search-input');
    input.focus();

    let selectedIndex = 0;
    let results = [];

    const performSearch = (query) => {
        const q = query.toLowerCase();
        if (!q) {
            document.getElementById('global-search-results').innerHTML = '';
            return;
        }

        results = [];

        // Search tasks
        [...nodes, ...archivedNodes].forEach(n => {
            if (n.title.toLowerCase().includes(q) || (n.description || '').toLowerCase().includes(q)) {
                results.push({ type: 'task', title: n.title, obj: n, icon: n.completed ? '✅' : (n._isUrgent ? '⚡' : '📋') });
            }
        });

        // Search inbox
        inbox.forEach(item => {
            if ((item.title || '').toLowerCase().includes(q)) {
                results.push({ type: 'inbox', title: item.title, obj: item, icon: '📥' });
            }
        });

        // Search notes
        notes.forEach(n => {
            let bodyText = '';
            try {
                const blocks = JSON.parse(n.body);
                bodyText = blocks.map(b => b.text).join(' ');
            } catch (e) { bodyText = n.body || ''; }

            if ((n.title || '').toLowerCase().includes(q) || bodyText.toLowerCase().includes(q)) {
                results.push({ type: 'note', title: n.title, obj: n, icon: '📝' });
            }
        });

        // Search goals
        const searchGoals = (goals) => {
            goals.forEach(g => {
                if (g.text.toLowerCase().includes(q)) {
                    results.push({ type: 'goal', title: g.text, obj: g, icon: '🎯' });
                }
                if (g.children) searchGoals(g.children);
            });
        };
        if (lifeGoals[currentGoalYear]) searchGoals(lifeGoals[currentGoalYear]);

        renderResults();
    };

    const renderResults = () => {
        const container = document.getElementById('global-search-results');
        container.innerHTML = results.map((r, idx) => `
                    <div class=\"search-result-item ${idx === selectedIndex ? 'selected' : ''}\" 
                         style=\"padding: 10px; cursor: pointer; border-radius: 6px; ${idx === selectedIndex ? 'background: var(--accent-light); border-left: 3px solid var(--accent);' : 'hover:background: rgba(255,255,255,0.05);'}\"
                         onclick=\"openSearchResult('${r.type}', '${r.obj.id}'); toggleGlobalSearch();\">
                        <span style=\"margin-right: 8px;\">${r.icon}</span>
                        <span style=\"${r.type === 'task' && r.obj.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}\">${r.title}</span>
                        <span style=\"float: right; font-size: 11px; color: var(--text-muted); text-transform: uppercase;\">${r.type}</span>
                    </div>
                `).join('');

        // Scroll selected into view
        const selected = container.children[selectedIndex];
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    };

    input.addEventListener('input', (e) => {
        selectedIndex = 0;
        performSearch(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
            renderResults();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderResults();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) {
                openSearchResult(results[selectedIndex].type, results[selectedIndex].obj.id);
                toggleGlobalSearch();
            }
        } else if (e.key === 'Escape') {
            toggleGlobalSearch();
        }
    });

    // Close on backdrop
    modal.addEventListener('click', (e) => {
        if (e.target === modal) toggleGlobalSearch();
    });
}

function openSearchResult(type, id) {
    if (type === 'task') {
        jumpToTask(id);
    } else if (type === 'note') {
        openNoteEditor(id);
    } else if (type === 'inbox') {
        const modal = document.getElementById('inbox-modal');
        if (modal && !modal.classList.contains('visible')) toggleInboxModal();
    } else if (type === 'goal') {
        if (!isGoalsOpen) toggleGoals();
        // Flash the goal in the list (you'd need to add IDs to goal elements)
        setTimeout(() => {
            const goalEl = document.querySelector(`[data-goal-id=\"${id}\"]`);
            if (goalEl) {
                goalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                goalEl.style.background = 'var(--accent-light)';
                setTimeout(() => goalEl.style.background = '', 1000);
            }
        }, 100);
    }
}


function toggleInboxModal() {
    const modal = document.getElementById('inbox-modal');

    if (modal.classList.contains('visible')) {
        closeInboxModal();
    } else {
        // Restore saved position
        if (inboxModalPosition.x !== null && inboxModalPosition.y !== null) {
            modal.style.left = inboxModalPosition.x + 'px';
            modal.style.top = inboxModalPosition.y + 'px';
            modal.style.transform = 'none';
        }
        if (inboxModalPosition.width && inboxModalPosition.height) {
            modal.style.width = inboxModalPosition.width + 'px';
            modal.style.height = inboxModalPosition.height + 'px';
        }

        modal.classList.add('visible');
        renderInboxModal();
        setTimeout(() => document.getElementById('inbox-modal-input').focus(), 100);
    }
}

function closeInboxModal() {
    const modal = document.getElementById('inbox-modal');

    // Save position before closing
    const rect = modal.getBoundingClientRect();
    inboxModalPosition = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    };
    localStorage.setItem('inboxModalPosition', JSON.stringify(inboxModalPosition));

    modal.classList.remove('visible');
}

// --- NODE GROUPS LOGIC ---
function toggleNodeGroupsModal() {
    const modal = document.getElementById('node-groups-modal');

    if (modal.classList.contains('visible')) {
        closeNodeGroupsModal();
    } else {
        // Restore saved position
        if (nodeGroupsModalPosition.x !== null && nodeGroupsModalPosition.y !== null) {
            modal.style.left = nodeGroupsModalPosition.x + 'px';
            modal.style.top = nodeGroupsModalPosition.y + 'px';
            modal.style.transform = 'none';
        }
        if (nodeGroupsModalPosition.width && nodeGroupsModalPosition.height) {
            modal.style.width = nodeGroupsModalPosition.width + 'px';
            modal.style.height = nodeGroupsModalPosition.height + 'px';
        }

        modal.classList.add('visible');
        detectAndRenderNodeGroups();
    }
}

function closeNodeGroupsModal() {
    const modal = document.getElementById('node-groups-modal');

    // Save position before closing
    const rect = modal.getBoundingClientRect();
    nodeGroupsModalPosition = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    };
    localStorage.setItem('nodeGroupsModalPosition', JSON.stringify(nodeGroupsModalPosition));

    modal.classList.remove('visible');
}

function detectAndRenderNodeGroups() {
    const groups = detectConnectedGroups();
    const container = document.getElementById('node-groups-list');
    if (!container) return;

    container.innerHTML = '';

    if (groups.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:40px 20px; font-size:13px;">No connected node groups found.<br><br>Create tasks with dependencies to see groups.</div>';
        return;
    }

    groups.forEach((group, index) => {
        const groupId = `group_${index}`;
        const isHidden = hiddenNodeGroups.has(groupId);

        // Find first active (non-completed) node for title
        const firstActive = group.nodes.find(n => !n.completed);
        const titleNode = firstActive || group.nodes[0];
        const groupTitle = titleNode ? titleNode.title : 'Unnamed Group';

        const completedCount = group.nodes.filter(n => n.completed).length;
        const totalCount = group.nodes.length;
        const urgentCount = group.nodes.filter(n => n._isUrgent && !n.completed).length;
        const criticalCount = group.nodes.filter(n => n._isCritical && !n.completed).length;

        const el = document.createElement('div');
        el.className = `node-group-item ${isHidden ? 'hidden-group' : ''}`;

        el.innerHTML = `
                    <div class="node-group-header">
                        <div class="node-group-title">${groupTitle}</div>
                        <div class="node-group-count">${totalCount} tasks</div>
                        <div class="node-group-toggle ${!isHidden ? 'active' : ''}" 
                             onclick="event.stopPropagation(); toggleNodeGroupVisibility('${groupId}', ${index})"></div>
                    </div>
                    <div class="node-group-stats">
                        <span>✓ ${completedCount}/${totalCount}</span>
                        ${urgentCount > 0 ? `<span style="color:var(--blocked-color)">⚡ ${urgentCount} urgent</span>` : ''}
                        ${criticalCount > 0 ? `<span style="color:var(--critical-path)">⭐ ${criticalCount} critical</span>` : ''}
                    </div>
                `;

        el.onclick = () => {
            if (!isHidden && titleNode) {
                closeNodeGroupsModal();
                jumpToTask(titleNode.id);
            }
        };

        container.appendChild(el);
    });
}

function detectConnectedGroups() {
    const visited = new Set();
    const groups = [];

    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            const group = collectConnectedNodes(node.id, visited);
            if (group.length > 1) { // Only groups with 2+ nodes
                groups.push({ nodes: group });
            }
        }
    });

    return groups;
}

function collectConnectedNodes(startId, visited) {
    const group = [];
    const queue = [startId];
    const localVisited = new Set();

    while (queue.length > 0) {
        const id = queue.shift();
        if (localVisited.has(id)) continue;

        const node = nodes.find(n => n.id === id);
        if (!node) continue;

        localVisited.add(id);
        visited.add(id);
        group.push(node);

        // Add parents
        node.dependencies.forEach(dep => {
            if (!localVisited.has(dep.id)) {
                queue.push(dep.id);
            }
        });

        // Add children
        nodes.forEach(other => {
            if (other.dependencies.some(d => d.id === id) && !localVisited.has(other.id)) {
                queue.push(other.id);
            }
        });
    }

    return group;
}

function toggleNodeGroupVisibility(groupId, groupIndex) {
    if (hiddenNodeGroups.has(groupId)) {
        hiddenNodeGroups.delete(groupId);
    } else {
        hiddenNodeGroups.add(groupId);
    }

    saveToStorage();
    render();
    detectAndRenderNodeGroups();
}

function renderInboxModal() {
    const list = document.getElementById('inbox-modal-list');
    list.innerHTML = '';

    if (inbox.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:40px 20px; font-size: 13px;">📭<br><br>Your inbox is empty.<br>Capture ideas as they come!</div>';
        return;
    }

    inbox.forEach((item, index) => {
        const hasReminder = hasReminderForItem('inbox', item.id);
        const el = document.createElement('div');
        el.className = 'inbox-item';
        el.innerHTML = `<span>${linkify(item.title)}</span><div class="inbox-actions"><span class="inbox-btn promote-btn" onclick="promoteInboxTask(${index}); renderInboxModal();" title="Move to Board">⬆</span><span class="inbox-btn promote-goal-btn" onclick="promoteInboxToGoal(${index}); renderInboxModal();" title="Move to Goals">🎯</span><span class="inbox-btn reminder-btn ${hasReminder ? 'active' : ''}" onclick="openRemindersModal('inbox', '${item.id}'); renderInboxModal();" title="Set Reminder">⏰</span><span class="inbox-btn" style="color: var(--accent);" onclick="scheduleInboxItem(${index}); renderInboxModal();" title="Add to Agenda">📅</span><span class="inbox-btn delete-btn" onclick="deleteInboxTask(${index}); renderInboxModal();" title="Delete">✕</span></div>`;
        list.appendChild(el);
    });
}

function addToInboxModal() {
    const input = document.getElementById('inbox-modal-input');
    const val = input.value.trim();
    if (val) {
        inbox.push({ id: 'inbox_' + Date.now(), title: val });
        input.value = '';
        renderInboxModal();
        saveToStorage();
    }
}
function renderInbox() {
    const list = document.getElementById('inbox-list'); list.innerHTML = '';
    if (inbox.length === 0) { list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:20px;">No pending tasks</div>'; return; }
    inbox.forEach((item, index) => {
        const hasReminder = hasReminderForItem('inbox', item.id);
        const el = document.createElement('div'); el.className = 'inbox-item';
        el.innerHTML = `<span>${linkify(item.title)}</span><div class="inbox-actions"><span class="inbox-btn promote-btn" onclick="promoteInboxTask(${index})" title="Move to Board">⬆</span><span class="inbox-btn promote-goal-btn" onclick="promoteInboxToGoal(${index})" title="Move to Goals">🎯</span><span class="inbox-btn reminder-btn ${hasReminder ? 'active' : ''}" onclick="openRemindersModal('inbox', '${item.id}')" title="Set Reminder">⏰</span><span class="inbox-btn" style="color: var(--accent);" onclick="scheduleInboxItem(${index})" title="Add to Agenda">📅</span><span class="inbox-btn delete-btn" onclick="deleteInboxTask(${index})" title="Delete">✕</span></div>`;
        list.appendChild(el);
    });
}
function addToInbox() { const input = document.getElementById('inbox-input'); const val = input.value.trim(); if (val) { inbox.push({ id: 'inbox_' + Date.now(), title: val }); input.value = ''; renderInbox(); saveToStorage(); } }
function deleteInboxTask(index) {
    const item = inbox[index];
    if (!item) return;
    if (item) discardReminderByItem('inbox', item.id);

    // NEW: Remove any agenda slots for this inbox item
    agenda = agenda.filter(slot => !slot.taskId.includes(item.id.split('_')[1]));

    // Remove temp node if exists
    nodes = nodes.filter(n => !n.id.includes(item.id.split('_')[1]) || !n.isInboxItem);

    inbox.splice(index, 1);
    renderInbox();
    saveToStorage();
}
function promoteInboxTask(index) {
    const item = inbox[index];
    const worldX = (window.innerWidth / 2 - panX) / scale - 90;
    const worldY = (window.innerHeight / 2 - panY) / scale - 50;
    const newNode = createNode(worldX, worldY, item.title);
    inbox.splice(index, 1); nodes.push(newNode);
    transferReminderAssignment('inbox', item.id, 'task', newNode.id, newNode.title);
    renderInbox(); updateCalculations(); render(); selectNode(newNode.id); saveToStorage();
    const inboxPanel = document.getElementById('inbox-panel');
    if (!inboxPanel.classList.contains('hidden')) inboxPanel.classList.add('hidden');
}
function promoteInboxToGoal(index) { const item = inbox[index]; if (!lifeGoals[currentGoalYear]) lifeGoals[currentGoalYear] = []; lifeGoals[currentGoalYear].push(createGoal(item.title)); discardReminderByItem('inbox', item.id); inbox.splice(index, 1); renderInbox(); renderGoals(); const panel = document.getElementById('goals-panel'); if (panel.classList.contains('hidden')) panel.classList.remove('hidden'); saveToStorage(); }
function scheduleInboxItem(index) {
    const item = inbox[index];
    if (!item) return;

    // Create a temporary task node for the agenda (it stays in inbox)
    const tempTaskId = 'inbox_temp_' + Date.now();

    // Create a minimal task object that agenda can reference
    const tempTask = {
        id: tempTaskId,
        title: item.title,
        completed: false,
        isInboxItem: true, // Flag to identify it's from inbox
        inboxIndex: index  // Store original index
    };

    // Add to nodes temporarily (it won't be saved to storage)
    nodes.push(tempTask);

    // Calculate default time slot (now + 30 minutes)
    const now = new Date();
    const start = new Date(now.getTime() + 5 * 60000); // 5 mins from now for testing
    const end = new Date(start.getTime() + 30 * 60000); // 30 min duration

    // Add to agenda
    agenda.push({
        taskId: tempTaskId,
        start: start.toISOString(),
        end: end.toISOString()
    });

    saveToStorage();

    // Open agenda panel to show the new item
    const agendaPanel = document.getElementById('agenda-panel');
    if (agendaPanel.classList.contains('hidden')) {
        toggleAgenda();
    } else {
        renderAgenda();
    }

    showNotification(`"${item.title}" scheduled for ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
}
function demoteToInbox() { if (!selectedNodeId) return; const node = nodes.find(n => n.id === selectedNodeId); if (!node) return; const newInboxId = 'inbox_' + Date.now(); inbox.push({ id: newInboxId, title: node.title }); transferReminderAssignment('task', node.id, 'inbox', newInboxId, node.title); nodes = nodes.filter(n => n.id !== selectedNodeId); nodes.forEach(n => { n.dependencies = n.dependencies.filter(d => d.id !== selectedNodeId); }); deselectNode(); updateCalculations(); render(); renderInbox(); const panel = document.getElementById('inbox-panel'); if (panel.classList.contains('hidden')) toggleInboxModal(); saveToStorage(); }

function showNotification(msg) {
    const n = document.getElementById('notification');
    if (n) {
        n.innerText = msg || "State Saved";
        n.style.opacity = '1';
        setTimeout(() => n.style.opacity = '0', 1500);
    } else {
        console.log("Notification:", msg); // Fallback to console if UI missing
    }

    // Also safeguard the status indicator if it exists
    const statusInd = document.getElementById('status-indicator');
    if (!msg && statusInd) {
        statusInd.innerText = "Saved " + new Date().toLocaleTimeString();
    }
}


// --- PINNED WINDOW LOGIC ---
function togglePinnedWindow() {
    const window = document.getElementById('pinned-window');
    window.classList.toggle('hidden');
    if (!window.classList.contains('hidden')) {
        renderPinnedWindow();
    }
}

let currentTaskFilter = 'all';

function toggleTaskListWindow() {
    const window = document.getElementById('task-list-window');
    window.classList.toggle('hidden');
    if (!window.classList.contains('hidden')) {
        renderTaskList();
    }
}

function toggleAgenda() {
    const panel = document.getElementById('agenda-panel');
    const others = ['notes-panel', 'archive-panel', 'goals-panel', 'habits-panel'];
    if (panel.classList.contains('hidden')) {
        others.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        panel.classList.remove('hidden');
        renderAgenda();
        renderAgendaPanelUI(); // <--- Initialize UI
    } else {
        panel.classList.add('hidden');
    }
}
function setTaskFilter(filter) {
    currentTaskFilter = filter;

    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderTaskList();
}

function renderTaskList() {
    const container = document.getElementById('task-list-content');
    if (!container) return;

    container.innerHTML = '';

    // Filter tasks based on current filter
    let filteredTasks = [...nodes];

    switch (currentTaskFilter) {
        case 'urgent':
            filteredTasks = filteredTasks.filter(n => n._isUrgent && !n.completed);
            break;
        case 'critical':
            filteredTasks = filteredTasks.filter(n => n._isCritical && !n.completed);
            break;
        case 'ready':
            filteredTasks = filteredTasks.filter(n => n._isReady && !n.completed);
            break;
        case 'blocked':
            filteredTasks = filteredTasks.filter(n => n._isBlocked && !n.completed);
            break;
        case 'completed':
            filteredTasks = [...archivedNodes];
            break;
        case 'all':
        default:
            // Show all active tasks
            filteredTasks = filteredTasks.filter(n => !n.completed);
            break;
    }

    // Sort alphabetically
    filteredTasks.sort((a, b) => a.title.localeCompare(b.title));

    if (filteredTasks.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:20px; font-size:11px;">No tasks found</div>';
        return;
    }

    filteredTasks.forEach(task => {
        const el = document.createElement('div');
        el.className = 'task-list-item';

        if (task.completed) el.classList.add('completed');
        else if (task._isUrgent) el.classList.add('urgent');
        else if (task._isCritical) el.classList.add('critical');

        let badges = '';
        if (!task.completed) {
            if (task._isUrgent) badges += '<span class="badge urgent-badge">URGENT</span>';
            else if (task._isCritical) badges += '<span class="badge critical-badge">CP</span>';
            if (task._isBlocked) badges += '<span class="badge">🔒</span>';
            if (task._downstreamWeight > 0) badges += `<span class="badge weight">⚡${task._downstreamWeight}</span>`;
        }

        if (task.dueDate && !task.completed) {
            const due = new Date(task.dueDate);
            const dateStr = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            badges += `<span class="badge date-badge">📅 ${dateStr}</span>`;
        }

        el.innerHTML = `
                    <div style="font-weight:600; margin-bottom:4px;">${task.completed ? '✅' : ''} ${task.title}</div>
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">${badges}</div>
                `;

        el.onclick = () => {
            toggleTaskListWindow();
            jumpToTask(task.id);
        };

        container.appendChild(el);
    });
}

function togglePinItem(type, id) {
    let item;
    if (type === 'task') item = nodes.find(n => n.id === id) || archivedNodes.find(n => n.id === id);
    else if (type === 'note') item = notes.find(n => n.id === id);
    else if (type === 'habit') item = habits.find(h => h.id === id);

    if (item) {
        item.isPinned = !item.isPinned;
        showNotification(item.isPinned ? `${type.charAt(0).toUpperCase() + type.slice(1)} Pinned` : "Unpinned");
    }

    saveToStorage();
    renderPinnedWindow();

    // Update source panels if open
    if (type === 'habit' && !document.getElementById('habits-panel').classList.contains('hidden')) {
        renderHabits();
    }
}

function isPinned(type, id) {
    let item;
    if (type === 'task') item = nodes.find(n => n.id === id) || archivedNodes.find(n => n.id === id);
    else if (type === 'note') item = notes.find(n => n.id === id);
    else if (type === 'habit') item = habits.find(h => h.id === id);
    return item ? !!item.isPinned : false;
}

function renderPinnedWindow() {
    const container = document.getElementById('pinned-content');
    if (!container) return;

    container.innerHTML = '';

    const pinnedItemsList = [];
    // Collect all items with isPinned = true
    nodes.concat(archivedNodes).forEach(n => { if (n.isPinned) pinnedItemsList.push({ type: 'task', id: n.id }); });
    notes.forEach(n => { if (n.isPinned) pinnedItemsList.push({ type: 'note', id: n.id }); });
    habits.forEach(h => { if (h.isPinned) pinnedItemsList.push({ type: 'habit', id: h.id }); });

    if (pinnedItemsList.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#666; padding:20px; font-size:11px;">No pinned items.<br><br>Pin tasks, notes, or habits from their panels.</div>';
        return;
    }

    pinnedItemsList.forEach(item => {
        if (item.type === 'task') {
            renderPinnedTask(container, item.id);
        } else if (item.type === 'note') {
            renderPinnedNote(container, item.id);
        } else if (item.type === 'habit') {
            renderPinnedHabit(container, item.id);
        }
    });
}

function renderPinnedTask(container, taskId) {
    const node = nodes.find(n => n.id === taskId) || archivedNodes.find(n => n.id === taskId);
    if (!node) {
        // Task was deleted, remove from pinned
        pinnedItems = pinnedItems.filter(p => !(p.type === 'task' && p.id === taskId));
        saveToStorage();
        return;
    }

    const el = document.createElement('div');
    el.className = 'pinned-node';

    if (!node.completed) {
        if (node._isUrgent) el.classList.add('critical-urgent');
        else if (node._isCritical) el.classList.add('critical');
    }
    if (node.completed) el.classList.add('completed');

    let badgesHtml = '';
    if (!node.completed) {
        if (node._isUrgent) badgesHtml += `<span class="badge urgent-badge">URGENT</span>`;
        else if (node._isCritical) badgesHtml += `<span class="badge critical-badge">CP</span>`;
    }

    const totalTime = getTotalTime(node);
    if (totalTime > 0) {
        badgesHtml += `<span class="badge time-badge">${formatTime(totalTime)}</span>`;
    }

    if (node.dueDate && !node.completed) {
        const due = new Date(node.dueDate);
        const dateStr = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        badgesHtml += `<span class="badge date-badge">📅 ${dateStr}</span>`;
    }

    const totalSubs = node.subtasks.length;
    const doneSubs = node.subtasks.filter(s => s.done).length;
    const progress = totalSubs === 0 ? 0 : (doneSubs / totalSubs) * 100;

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('task', '${taskId}')">✕</button>
                <div style="font-weight:600; font-size:12px; margin-bottom:4px; color:#eee;">${node.completed ? '✅' : ''} ${node.title}</div>
                <div style="display:flex; gap:4px; flex-wrap:wrap; font-size:10px; margin-bottom:4px;">${badgesHtml}</div>
                ${totalSubs > 0 ? `<div class="progress-container" style="height:3px;"><div class="progress-bar" style="width:${progress}%"></div></div>` : ''}
            `;

    el.onclick = () => {
        selectNode(taskId);
    };

    container.appendChild(el);
}

function renderPinnedNote(container, noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) {
        pinnedItems = pinnedItems.filter(p => !(p.type === 'note' && p.id === noteId));
        saveToStorage();
        return;
    }

    const el = document.createElement('div');
    el.className = 'pinned-note';

    const preview = note.body.replace(/[#*\[\]]/g, '').substring(0, 50);

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('note', '${noteId}')">✕</button>
                <div style="font-weight:600; font-size:11px; margin-bottom:3px; color:#eee;">📝 ${note.title || '(Untitled)'}</div>
                <div style="font-size:10px; color:#888;">${preview}...</div>
            `;

    el.onclick = () => {
        openNoteEditor(noteId);
    };

    container.appendChild(el);
}

function renderPinnedHabit(container, habitId) {
    const h = habits.find(habit => habit.id === habitId);
    if (!h) {
        pinnedItems = pinnedItems.filter(p => !(p.type === 'habit' && p.id === habitId));
        saveToStorage();
        return;
    }

    const freq = h.frequency || 'daily';
    const bounds = getPeriodBounds(freq);
    const val = getSumInPeriod(h, bounds);
    const target = h.target || 1;
    const isDone = val >= target;
    const percent = Math.min(100, (val / target) * 100);

    if (!h.type) h.type = 'checkbox';

    let controlsHtml = '';
    if (h.type === 'checkbox') {
        controlsHtml = `
                    <div class="habit-checkbox ${isDone ? 'checked' : ''}" onclick="event.stopPropagation(); toggleHabitDay('${h.id}'); renderPinnedWindow();" style="flex-shrink:0;">
                        ${isDone ? '✓' : ''}
                    </div>`;
    } else if (h.type === 'counter') {
        controlsHtml = `
                    <div style="display:flex; gap:3px; align-items:center; flex-shrink:0;">
                        <button class="habit-btn-small" onclick="event.stopPropagation(); updateHabitCounter('${h.id}', -1); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px;">-</button>
                        <span style="font-family:monospace; font-size:10px; min-width:30px; text-align:center; color:${isDone ? 'var(--ready-color)' : '#aaa'};">${val}/${Math.floor(target)}</span>
                        <button class="habit-btn-small" onclick="event.stopPropagation(); updateHabitCounter('${h.id}', 1); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px;">+</button>
                    </div>`;
    } else if (h.type === 'timer') {
        const isRunning = !!h.activeTimerStart;
        const minsVal = Math.floor(val / 60000);
        const minsTarget = Math.floor(target / 60000);
        controlsHtml = `
                    <div style="display:flex; gap:3px; align-items:center; flex-shrink:0;">
                        <button class="habit-btn-small" onclick="event.stopPropagation(); toggleHabitTimer('${h.id}'); renderPinnedWindow();" style="width:20px; height:20px; font-size:10px; ${isRunning ? 'border-color:var(--ready-color); color:var(--ready-color);' : ''}">
                            ${isRunning ? '⏸' : '▶'}
                        </button>
                        <span style="font-family:monospace; font-size:10px; color:${isDone ? 'var(--ready-color)' : '#aaa'};">${minsVal}m/${minsTarget}m</span>
                    </div>`;
    }

    const el = document.createElement('div');
    el.className = `pinned-habit ${isDone ? 'done-today' : ''}`;

    el.innerHTML = `
                <button class="pinned-unpin" onclick="event.stopPropagation(); togglePinItem('habit', '${habitId}')">✕</button>
                ${h.type === 'checkbox' ? controlsHtml : ''}
                <div style="flex-grow:1; min-width:0;">
                    <div style="font-weight:600; font-size:11px; color:#eee; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${h.title}
                        ${h.noteIds && h.noteIds.length > 0 ? `<span style="color:#3b82f6; font-size:9px; margin-left:4px; cursor:pointer;" onclick="event.stopPropagation(); showHabitNotes('${habitId}')" title="View linked notes">📝${h.noteIds.length}</span>` : ''}
                    </div>
                    ${h.type !== 'checkbox' ? `
                        <div style="height:3px; background:#333; border-radius:2px; margin-top:3px; overflow:hidden;">
                            <div style="height:100%; background:${isDone ? 'var(--ready-color)' : 'var(--accent)'}; width:${percent}%; transition:width 0.3s;"></div>
                        </div>
                    ` : ''}
                </div>
                ${h.type !== 'checkbox' ? controlsHtml : ''}
            `;

    container.appendChild(el);
}

function centerHealthDashboard() {
    const healthDash = document.getElementById('health-dashboard');
    if (!healthDash) return;

    // Calculate center position
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const dashWidth = healthDash.offsetWidth;
    const dashHeight = healthDash.offsetHeight;

    const centerX = (windowWidth - dashWidth) / 2;
    const centerY = (windowHeight - dashHeight) / 2;

    // Apply centered position
    healthDash.style.setProperty('left', centerX + 'px', 'important');
    healthDash.style.setProperty('top', centerY + 'px', 'important');
    healthDash.style.setProperty('bottom', 'auto', 'important');
    healthDash.style.setProperty('right', 'auto', 'important');

    // Save the new position
    healthDashboardPosition = {
        x: centerX,
        y: centerY
    };
    localStorage.setItem('healthDashboardPosition', JSON.stringify(healthDashboardPosition));

    showNotification("Health Dashboard Centered (Opt+J)");
}

document.addEventListener('mousedown', (e) => {
    const inspector = document.getElementById('inspector');
    if (inspector && !inspector.classList.contains('hidden')) {
        if (inspector.contains(e.target) ||
            e.target.closest('.node') ||
            e.target.closest('.node-timer-control') ||
            e.target.closest('#selection-menu')) {
            return;
        }
        deselectNode();
    }
});
