// --- REMINDERS ---
const REMINDER_ALL_DAY_TIME = '06:25';
let reminderFocusKey = null;

// getLocalDateString() is now in utils.js

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
    if (itemType === 'habit') return habits.find(h => {
        const archived = typeof isHabitArchived === 'function'
            ? isHabitArchived(h)
            : (Number(h && h.archivedAt) > 0);
        return h.id === itemId && !archived;
    }) || null;
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

function reminderColorToRgbString(colorValue) {
    if (typeof colorValue !== 'string') return null;
    const trimmed = colorValue.trim();
    if (!trimmed) return null;

    const normalizeHex = (value) => {
        if (typeof normalizeGoalHexColor === 'function') return normalizeGoalHexColor(value);
        if (!/^#?[0-9a-fA-F]{6}$/.test(value)) return null;
        return value.startsWith('#') ? value.toLowerCase() : `#${value.toLowerCase()}`;
    };

    const hex = normalizeHex(trimmed);
    if (hex) {
        if (typeof goalHexToRgbString === 'function') return goalHexToRgbString(hex);
        const clean = hex.slice(1);
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    }

    const rgbMatch = trimmed.match(/^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})/i);
    if (!rgbMatch) return null;
    const r = Math.max(0, Math.min(255, Number(rgbMatch[1]) || 0));
    const g = Math.max(0, Math.min(255, Number(rgbMatch[2]) || 0));
    const b = Math.max(0, Math.min(255, Number(rgbMatch[3]) || 0));
    return `${r}, ${g}, ${b}`;
}

function reminderWithAlpha(colorValue, alpha, fallback = null) {
    const rgb = reminderColorToRgbString(colorValue);
    if (!rgb) return fallback || colorValue;
    return `rgba(${rgb}, ${alpha})`;
}

function mixReminderRgb(rgbA, rgbB, weightA = 0.5) {
    const parseRgb = (rgb) => {
        if (typeof rgb !== 'string') return null;
        const parts = rgb.split(',').map(v => Number(v.trim()));
        if (parts.length !== 3 || parts.some(v => !Number.isFinite(v))) return null;
        return parts.map(v => Math.max(0, Math.min(255, Math.round(v))));
    };

    const a = parseRgb(rgbA);
    const b = parseRgb(rgbB);
    if (!a && !b) return null;
    if (!a) return b.join(', ');
    if (!b) return a.join(', ');

    const wA = Number.isFinite(weightA) ? Math.max(0, Math.min(1, weightA)) : 0.5;
    const wB = 1 - wA;
    return [
        Math.round((a[0] * wA) + (b[0] * wB)),
        Math.round((a[1] * wA) + (b[1] * wB)),
        Math.round((a[2] * wA) + (b[2] * wB))
    ].join(', ');
}

function getReminderItemTheme(reminder) {
    const item = getReminderItem(reminder.itemType, reminder.itemId);
    const theme = {
        background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(2, 6, 23, 0.92))',
        border: 'rgba(148, 163, 184, 0.45)',
        borderHover: 'rgba(148, 163, 184, 0.72)',
        text: '#e2e8f0',
        subtleText: '#94a3b8'
    };
    if (!item) return theme;

    if (reminder.itemType === 'task') {
        const taskTheme = typeof getTaskTheme === 'function' ? getTaskTheme(item) : null;
        if (!taskTheme) return theme;

        theme.background = taskTheme.background || theme.background;
        theme.border = taskTheme.border || theme.border;
        theme.borderHover = reminderWithAlpha(taskTheme.border, 0.86, taskTheme.border || theme.borderHover);
        theme.text = taskTheme.text || theme.text;
        theme.subtleText = taskTheme.subtleText || theme.subtleText;
        return theme;
    }

    if (reminder.itemType === 'habit') {
        const habitHex = (typeof getEffectiveHabitColorHex === 'function')
            ? getEffectiveHabitColorHex(item)
            : (typeof getHabitColorHex === 'function' ? getHabitColorHex(item) : null);
        const rgb = habitHex ? reminderColorToRgbString(habitHex) : null;
        if (rgb) {
            theme.background = `linear-gradient(145deg, rgba(${rgb}, 0.24), rgba(15, 23, 42, 0.9))`;
            theme.border = `rgba(${rgb}, 0.68)`;
            theme.borderHover = `rgba(${rgb}, 0.9)`;
            theme.text = '#f8fafc';
            theme.subtleText = 'rgba(226, 232, 240, 0.84)';
        }
        return theme;
    }

    if (reminder.itemType === 'note') {
        const rgb = item.isPinned ? '245, 158, 11' : '79, 156, 249';
        theme.background = `linear-gradient(145deg, rgba(${rgb}, 0.22), rgba(15, 23, 42, 0.9))`;
        theme.border = `rgba(${rgb}, 0.62)`;
        theme.borderHover = `rgba(${rgb}, 0.86)`;
        theme.text = '#eff6ff';
        theme.subtleText = 'rgba(191, 219, 254, 0.84)';
        return theme;
    }

    if (reminder.itemType === 'inbox') {
        const rgb = '34, 197, 94';
        theme.background = `linear-gradient(145deg, rgba(${rgb}, 0.2), rgba(15, 23, 42, 0.9))`;
        theme.border = `rgba(${rgb}, 0.56)`;
        theme.borderHover = `rgba(${rgb}, 0.8)`;
        theme.text = '#f0fdf4';
        theme.subtleText = 'rgba(187, 247, 208, 0.84)';
        return theme;
    }

    return theme;
}

function applyReminderItemTheme(card, reminder) {
    if (!card || !reminder) return;
    const theme = getReminderItemTheme(reminder);
    const accentRgb = reminderColorToRgbString(theme.borderHover)
        || reminderColorToRgbString(theme.border)
        || '148, 163, 184';
    const keepRgb = mixReminderRgb(accentRgb, '34, 197, 94', 0.32) || '34, 197, 94';
    const discardRgb = mixReminderRgb(accentRgb, '239, 68, 68', 0.3) || '239, 68, 68';

    card.style.setProperty('--rem-card-bg', theme.background);
    card.style.setProperty('--rem-card-border', theme.border);
    card.style.setProperty('--rem-card-border-hover', theme.borderHover);
    card.style.setProperty('--rem-card-text', theme.text);
    card.style.setProperty('--rem-card-subtle', theme.subtleText);
    card.style.setProperty('--rem-btn-bg', `rgba(${accentRgb}, 0.14)`);
    card.style.setProperty('--rem-btn-bg-hover', `rgba(${accentRgb}, 0.22)`);
    card.style.setProperty('--rem-btn-border', `rgba(${accentRgb}, 0.56)`);
    card.style.setProperty('--rem-btn-text', theme.text);
    card.style.setProperty('--rem-btn-keep-bg', `rgba(${keepRgb}, 0.22)`);
    card.style.setProperty('--rem-btn-keep-border', `rgba(${keepRgb}, 0.74)`);
    card.style.setProperty('--rem-btn-keep-text', `rgb(${keepRgb})`);
    card.style.setProperty('--rem-btn-discard-bg', `rgba(${discardRgb}, 0.2)`);
    card.style.setProperty('--rem-btn-discard-border', `rgba(${discardRgb}, 0.68)`);
    card.style.setProperty('--rem-btn-discard-text', `rgb(${discardRgb})`);
}

function isReminderCardInteractiveTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('button, input, select, label, textarea, a');
}

function openReminderItem(itemType, itemId) {
    resetViewportOrigin();
    const item = getReminderItem(itemType, itemId);
    if (!item) {
        showNotification('Item is missing');
        return false;
    }

    const reminderModal = document.getElementById('reminders-modal');
    if (reminderModal && reminderModal.classList.contains('visible')) {
        closeRemindersModal();
    }

    if (itemType === 'task') {
        if (typeof jumpToTask === 'function') jumpToTask(itemId);
        return true;
    }
    if (itemType === 'note') {
        if (typeof openNoteEditor === 'function') openNoteEditor(itemId);
        return true;
    }
    if (itemType === 'habit') {
        if (typeof focusHabitInPanel === 'function') {
            focusHabitInPanel(itemId);
        } else if (typeof toggleHabits === 'function') {
            toggleHabits(true);
        }
        return true;
    }
    if (itemType === 'inbox') {
        if (typeof focusInboxItem === 'function') focusInboxItem(itemId);
        return true;
    }
    return false;
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
        applyReminderItemTheme(card, reminder);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Open ${getReminderTypeLabel(reminder.itemType)}: ${getReminderItemTitle(reminder)}`);
        card.innerHTML = `
            <div class="reminder-chip-title">${getReminderItemTitle(reminder)}</div>
            <div class="reminder-chip-meta">${getReminderTypeLabel(reminder.itemType)} • ${new Date(reminder.firedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div class="reminder-chip-actions">
                <button class="rem-chip-btn keep ${reminder.kept ? 'active' : ''}" onclick="event.stopPropagation(); keepReminder('${reminder.id}')">${reminder.kept ? 'Kept' : 'Keep'}</button>
                <button class="rem-chip-btn discard" onclick="event.stopPropagation(); discardReminder('${reminder.id}')">Discard</button>
            </div>
        `;
        card.addEventListener('click', (event) => {
            if (isReminderCardInteractiveTarget(event.target)) return;
            openReminderItem(reminder.itemType, reminder.itemId);
        });
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (isReminderCardInteractiveTarget(event.target)) return;
            event.preventDefault();
            openReminderItem(reminder.itemType, reminder.itemId);
        });
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
        applyReminderItemTheme(card, reminder);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Open ${getReminderTypeLabel(reminder.itemType)}: ${getReminderItemTitle(reminder)}`);

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
                ${reminder.firedAt ? `<button class="btn rem-keep-btn ${reminder.kept ? 'active' : ''}" onclick="event.stopPropagation(); keepReminder('${reminder.id}')">${reminder.kept ? 'Kept' : 'Keep'}</button>` : ''}
                <button class="btn btn-danger" onclick="event.stopPropagation(); discardReminder('${reminder.id}')">Discard</button>
            </div>
        `;
        card.addEventListener('click', (event) => {
            if (isReminderCardInteractiveTarget(event.target)) return;
            openReminderItem(reminder.itemType, reminder.itemId);
        });
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (isReminderCardInteractiveTarget(event.target)) return;
            event.preventDefault();
            openReminderItem(reminder.itemType, reminder.itemId);
        });
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
