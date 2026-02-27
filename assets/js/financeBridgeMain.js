(function (global) {
    'use strict';

    let pendingRowsCache = [];

    function getEl(id) {
        return document.getElementById(id);
    }

    function normalizeType(type) {
        return type === 'income' ? 'income' : 'expense';
    }

    function getDefaultCategory(type) {
        return type === 'income' ? 'Salary' : 'Others';
    }

    function getTodayDateInputValue() {
        return new Date().toISOString().slice(0, 10);
    }

    function formatDateForInput(value) {
        if (!value) return getTodayDateInputValue();
        const ts = typeof value === 'number' ? value : new Date(value).getTime();
        if (!Number.isFinite(ts) || ts <= 0) return getTodayDateInputValue();
        return new Date(ts).toISOString().slice(0, 10);
    }

    function formatQueueDate(value) {
        const ts = typeof value === 'number' ? value : new Date(value).getTime();
        if (!Number.isFinite(ts) || ts <= 0) return 'Unknown date';
        return new Date(ts).toLocaleDateString();
    }

    function formatQueueAmount(amount, currency) {
        const parsed = Number(amount);
        const safeCurrency = String(currency || 'PHP').toUpperCase();
        const decimals = safeCurrency === 'JPY' ? 0 : 2;
        if (!Number.isFinite(parsed)) return `${safeCurrency} 0`;
        return `${safeCurrency} ${parsed.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        })}`;
    }

    function getBridge() {
        return global.FinanceBridgeQueue || null;
    }

    function setFinanceQueueType(type) {
        const normalized = normalizeType(type);
        const typeEl = getEl('finance-queue-type');
        if (typeEl) typeEl.value = normalized;

        const expenseBtn = getEl('finance-type-expense-btn');
        const incomeBtn = getEl('finance-type-income-btn');

        if (expenseBtn) {
            expenseBtn.classList.toggle('is-active-expense', normalized === 'expense');
            expenseBtn.classList.toggle('is-active-income', false);
        }
        if (incomeBtn) {
            incomeBtn.classList.toggle('is-active-income', normalized === 'income');
            incomeBtn.classList.toggle('is-active-expense', false);
        }

        const categoryEl = getEl('finance-queue-category');
        if (categoryEl) {
            const current = String(categoryEl.value || '').trim();
            if (!current || current === 'Salary' || current === 'Others') {
                categoryEl.value = getDefaultCategory(normalized);
            }
        }
    }

    function updateFinanceQueueFormMode(isEditing) {
        const titleEl = getEl('finance-capture-title');
        const saveBtn = getEl('finance-queue-save-btn');
        const cancelEditBtn = getEl('finance-queue-cancel-edit-btn');

        if (titleEl) titleEl.innerText = isEditing ? 'Edit Queued Transaction' : 'New Transaction';
        if (saveBtn) saveBtn.innerText = isEditing ? 'Update Transaction' : 'Queue Transaction';
        if (cancelEditBtn) cancelEditBtn.style.display = isEditing ? '' : 'none';
    }

    function clearMainFinanceCaptureFields() {
        const idEl = getEl('finance-queue-id');
        const descEl = getEl('finance-queue-desc');
        const amountEl = getEl('finance-queue-amount');
        const quantityEl = getEl('finance-queue-quantity');
        const currencyEl = getEl('finance-queue-currency');
        const dateEl = getEl('finance-queue-date');
        const categoryEl = getEl('finance-queue-category');
        const notesEl = getEl('finance-queue-notes');

        if (idEl) idEl.value = '';
        if (descEl) descEl.value = '';
        if (amountEl) amountEl.value = '';
        if (quantityEl) quantityEl.value = '1';
        if (currencyEl) currencyEl.value = 'PHP';
        if (dateEl) dateEl.value = getTodayDateInputValue();
        if (notesEl) notesEl.value = '';

        setFinanceQueueType('expense');
        if (categoryEl && !categoryEl.value) {
            categoryEl.value = 'Others';
        }

        updateFinanceQueueFormMode(false);
    }

    function applyQueueItemToForm(item) {
        if (!item || !item.id) return;

        const idEl = getEl('finance-queue-id');
        const descEl = getEl('finance-queue-desc');
        const amountEl = getEl('finance-queue-amount');
        const quantityEl = getEl('finance-queue-quantity');
        const currencyEl = getEl('finance-queue-currency');
        const dateEl = getEl('finance-queue-date');
        const categoryEl = getEl('finance-queue-category');
        const notesEl = getEl('finance-queue-notes');

        if (idEl) idEl.value = String(item.id);
        if (descEl) descEl.value = String(item.desc || '');
        if (amountEl) amountEl.value = String(Number(item.amt || 0));
        if (quantityEl) quantityEl.value = String(Number(item.quantity || 1));
        if (currencyEl) currencyEl.value = String(item.currency || 'PHP').toUpperCase();
        if (dateEl) dateEl.value = formatDateForInput(item.date || item.createdAt);
        if (categoryEl) categoryEl.value = String(item.category || getDefaultCategory(item.type));
        if (notesEl) notesEl.value = String(item.notes || '');

        setFinanceQueueType(normalizeType(item.type));
        updateFinanceQueueFormMode(true);

        if (descEl) descEl.focus();
    }

    function isFinanceCaptureModalOpen() {
        const modal = getEl('finance-capture-modal');
        return !!(modal && modal.style.display === 'flex');
    }

    async function listPendingRowsFromBridge() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.listFinancePendingTransactions !== 'function') {
            throw new Error('Finance bridge queue is not available.');
        }
        const rows = await bridge.listFinancePendingTransactions();
        return Array.isArray(rows) ? rows : [];
    }

    function renderFinancePendingQueueListMain(rows) {
        const listEl = getEl('finance-queue-list');
        if (!listEl) return;

        const sorted = [...(rows || [])].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        listEl.innerHTML = '';

        if (sorted.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'finance-queue-empty';
            empty.innerText = 'No queued transactions yet.';
            listEl.appendChild(empty);
            return;
        }

        sorted.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'finance-queue-item';

            const top = document.createElement('div');
            top.className = 'finance-queue-item-top';

            const textWrap = document.createElement('div');
            const title = document.createElement('p');
            title.className = 'finance-queue-item-title';
            title.innerText = String(item.desc || 'Untitled');

            const typeLabel = item.type === 'income' ? 'Income' : 'Expense';
            const amountLabel = formatQueueAmount(item.amt, item.currency);
            const categoryLabel = String(item.category || getDefaultCategory(item.type));
            const dateLabel = formatQueueDate(item.date || item.createdAt);
            const qty = Number(item.quantity || 1);
            const meta = document.createElement('p');
            meta.className = 'finance-queue-item-meta';
            meta.innerText = `${typeLabel} • ${amountLabel} • Qty ${qty} • ${categoryLabel} • ${dateLabel}`;

            textWrap.appendChild(title);
            textWrap.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'finance-queue-item-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'finance-queue-action-btn';
            editBtn.innerText = 'Edit';
            editBtn.addEventListener('click', () => {
                openFinanceCaptureModal();
                applyQueueItemToForm(item);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'finance-queue-action-btn danger';
            deleteBtn.innerText = 'Delete';
            deleteBtn.addEventListener('click', async () => {
                await deleteFinanceQueuedTransactionFromMain(item.id);
            });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            top.appendChild(textWrap);
            top.appendChild(actions);
            row.appendChild(top);
            listEl.appendChild(row);
        });
    }

    async function refreshFinancePendingStateMain() {
        const countEl = getEl('finance-queue-count');
        try {
            pendingRowsCache = await listPendingRowsFromBridge();
            if (countEl) countEl.innerText = String(pendingRowsCache.length);
            renderFinancePendingQueueListMain(pendingRowsCache);
            return pendingRowsCache;
        } catch (error) {
            console.error('[financeBridgeMain] Failed to refresh pending queue:', error);
            pendingRowsCache = [];
            if (countEl) countEl.innerText = 'Unavailable';
            renderFinancePendingQueueListMain([]);
            return [];
        }
    }

    async function refreshFinancePendingCountMain() {
        const rows = await refreshFinancePendingStateMain();
        return rows.length;
    }

    function openFinanceCaptureModal() {
        const modal = getEl('finance-capture-modal');
        if (!modal) return;
        modal.style.display = 'flex';

        const typeValue = normalizeType(getEl('finance-queue-type')?.value);
        setFinanceQueueType(typeValue);
        const dateEl = getEl('finance-queue-date');
        if (dateEl && !dateEl.value) {
            dateEl.value = getTodayDateInputValue();
        }

        refreshFinancePendingStateMain();

        const descEl = getEl('finance-queue-desc');
        if (descEl) setTimeout(() => descEl.focus(), 0);
    }

    function closeFinanceCaptureModal() {
        const modal = getEl('finance-capture-modal');
        if (!modal) return;
        modal.style.display = 'none';
    }

    function cancelFinanceQueueEdit() {
        clearMainFinanceCaptureFields();
    }

    async function queueFinanceTransactionFromMain() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.queueFinancePendingTransaction !== 'function') {
            alert('Finance bridge queue is not available.');
            return;
        }

        const id = String(getEl('finance-queue-id')?.value || '').trim();
        const existing = id ? pendingRowsCache.find(item => String(item.id || '') === id) : null;

        const desc = String(getEl('finance-queue-desc')?.value || '').trim();
        const amount = Number(getEl('finance-queue-amount')?.value || 0);
        const type = normalizeType(getEl('finance-queue-type')?.value);
        const currency = String(getEl('finance-queue-currency')?.value || 'PHP').toUpperCase();
        const dateInput = String(getEl('finance-queue-date')?.value || '').trim();
        const categoryInput = String(getEl('finance-queue-category')?.value || '').trim();
        const category = categoryInput || getDefaultCategory(type);
        const notes = String(getEl('finance-queue-notes')?.value || '').trim();
        const quantityRaw = Number(getEl('finance-queue-quantity')?.value || 1);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

        if (!desc) {
            alert('Please enter a description.');
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            alert('Please enter a valid amount greater than 0.');
            return;
        }

        try {
            await bridge.queueFinancePendingTransaction({
                id: id || undefined,
                createdAt: existing?.createdAt || Date.now(),
                desc,
                amt: amount,
                type,
                currency,
                category,
                date: dateInput || getTodayDateInputValue(),
                notes,
                quantity,
                source: 'main-page-modal'
            });

            clearMainFinanceCaptureFields();
            await refreshFinancePendingStateMain();

            if (typeof showNotification === 'function') {
                showNotification(id ? 'Queued transaction updated' : 'Finance transaction queued');
            }

            const descEl = getEl('finance-queue-desc');
            if (descEl) descEl.focus();
        } catch (error) {
            console.error('[financeBridgeMain] Queue add/update failed:', error);
            alert(error?.message || 'Failed to save queued finance transaction.');
        }
    }

    async function deleteFinanceQueuedTransactionFromMain(id) {
        const queueId = String(id || '').trim();
        if (!queueId) return;

        const bridge = getBridge();
        if (!bridge || typeof bridge.clearFinancePendingTransactions !== 'function') {
            alert('Finance bridge queue is not available.');
            return;
        }

        const ok = confirm('Delete this queued transaction?');
        if (!ok) return;

        try {
            await bridge.clearFinancePendingTransactions([queueId]);

            const currentEditId = String(getEl('finance-queue-id')?.value || '').trim();
            if (currentEditId && currentEditId === queueId) {
                clearMainFinanceCaptureFields();
            }

            await refreshFinancePendingStateMain();

            if (typeof showNotification === 'function') {
                showNotification('Queued transaction deleted');
            }
        } catch (error) {
            console.error('[financeBridgeMain] Queue delete failed:', error);
            alert('Failed to delete queued transaction.');
        }
    }

    async function clearFinancePendingQueueFromMain() {
        const bridge = getBridge();
        if (!bridge || typeof bridge.listFinancePendingTransactions !== 'function' || typeof bridge.clearFinancePendingTransactions !== 'function') {
            alert('Finance bridge queue is not available.');
            return;
        }

        try {
            const items = await listPendingRowsFromBridge();
            if (items.length === 0) {
                if (typeof showNotification === 'function') {
                    showNotification('No pending finance transactions');
                }
                await refreshFinancePendingStateMain();
                return;
            }

            const ok = confirm(`Clear ${items.length} pending finance transaction(s)?`);
            if (!ok) return;

            await bridge.clearFinancePendingTransactions(items.map(item => item.id));
            clearMainFinanceCaptureFields();
            await refreshFinancePendingStateMain();

            if (typeof showNotification === 'function') {
                showNotification(`Cleared ${items.length} pending finance transaction(s)`);
            }
        } catch (error) {
            console.error('[financeBridgeMain] Queue clear failed:', error);
            alert('Failed to clear pending finance transactions.');
        }
    }

    function bindFinanceCaptureModalBehaviors() {
        const modal = getEl('finance-capture-modal');
        if (!modal || modal.dataset.boundByFinanceBridgeMain === 'true') return;
        modal.dataset.boundByFinanceBridgeMain = 'true';

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeFinanceCaptureModal();
            }
        });

        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeFinanceCaptureModal();
                return;
            }

            if (event.key === 'Enter') {
                const tag = String(event.target?.tagName || '').toUpperCase();
                if (tag === 'INPUT' || tag === 'SELECT') {
                    event.preventDefault();
                    queueFinanceTransactionFromMain();
                }
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        clearMainFinanceCaptureFields();
        bindFinanceCaptureModalBehaviors();
        refreshFinancePendingStateMain();
    });

    global.refreshFinancePendingCountMain = refreshFinancePendingCountMain;
    global.queueFinanceTransactionFromMain = queueFinanceTransactionFromMain;
    global.clearFinancePendingQueueFromMain = clearFinancePendingQueueFromMain;
    global.openFinanceCaptureModal = openFinanceCaptureModal;
    global.closeFinanceCaptureModal = closeFinanceCaptureModal;
    global.isFinanceCaptureModalOpen = isFinanceCaptureModalOpen;
    global.setFinanceQueueType = setFinanceQueueType;
    global.cancelFinanceQueueEdit = cancelFinanceQueueEdit;
})(window);
