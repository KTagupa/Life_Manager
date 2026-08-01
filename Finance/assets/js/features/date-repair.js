(function exposeFinanceDateRepair(root) {
    let initialized = false;
    let returnFocusElement = null;

    function getPartition() {
        return root.financeTransactionDateQuality || {
            repairableCount: 0,
            warningCount: 0,
            quarantinedCount: 0,
            repairableEntries: []
        };
    }

    function pluralize(count, singular, plural = `${singular}s`) {
        return `${count} ${count === 1 ? singular : plural}`;
    }

    function notify(message) {
        if (typeof root.showToast === 'function') root.showToast(message);
        else console.info(message);
    }

    function refreshActivityDateReviewControl(partition) {
        const button = document.getElementById('activity-date-review-button');
        const label = document.getElementById('activity-date-review-label');
        const count = document.getElementById('activity-date-review-count');
        if (!button || !label || !count) return;

        const repairableCount = Number(partition?.repairableCount || 0);
        const status = Number(partition?.quarantinedCount || 0) > 0
            ? 'quarantined'
            : (repairableCount > 0 ? 'warning' : 'healthy');
        button.dataset.dateQualityStatus = status;
        count.textContent = String(repairableCount);
        count.hidden = repairableCount === 0;
        label.textContent = repairableCount > 0 ? 'Review dates' : 'Dates checked';
        button.setAttribute('aria-label', repairableCount > 0
            ? `Review ${pluralize(repairableCount, 'transaction date')}`
            : 'Transaction dates are healthy');
    }

    function createTextElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = text;
        return element;
    }

    function formatAmount(value) {
        const amount = Number(value);
        return Number.isFinite(amount)
            ? `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : 'Amount unavailable';
    }

    function renderRepairEntry(entry) {
        const { transaction, quality } = entry;
        const row = document.createElement('article');
        row.className = 'finance-date-repair-row';
        row.dataset.dateRepairRow = String(transaction.id || '');

        const heading = document.createElement('div');
        heading.className = 'finance-date-repair-row__heading';
        const identity = document.createElement('div');
        identity.append(
            createTextElement('h3', 'finance-date-repair-row__title', transaction.desc || 'Untitled transaction'),
            createTextElement('p', 'finance-date-repair-row__meta', `${transaction.category || 'Uncategorized'} • ${formatAmount(transaction.amt)}`)
        );
        const badge = createTextElement(
            'span',
            `finance-date-repair-badge finance-date-repair-badge--${quality.status}`,
            quality.status === 'quarantined' ? 'Excluded' : 'Normalize'
        );
        heading.append(identity, badge);

        const issue = createTextElement(
            'p',
            'finance-date-repair-row__issue',
            quality.issue?.message || 'This date needs review.'
        );
        const raw = createTextElement(
            'p',
            'finance-date-repair-row__raw',
            `Stored date: ${quality.rawDate || 'Missing'}`
        );

        const controls = document.createElement('div');
        controls.className = 'finance-date-repair-row__controls';
        const input = document.createElement('input');
        input.type = 'date';
        input.value = quality.dateKey || '';
        input.dataset.dateRepairInput = '';
        input.setAttribute('aria-label', `Replacement date for ${transaction.desc || 'transaction'}`);
        const button = createTextElement('button', '', quality.status === 'warning' ? 'Normalize date' : 'Save repair');
        button.type = 'button';
        button.dataset.dateRepairId = String(transaction.id || '');
        controls.append(input, button);

        const status = createTextElement('p', 'finance-date-repair-row__status', '');
        status.dataset.dateRepairStatus = '';
        status.setAttribute('aria-live', 'polite');
        row.append(heading, issue, raw, controls, status);
        return row;
    }

    function renderFinanceDateRepairList(partition = getPartition()) {
        const list = document.getElementById('finance-date-repair-list');
        const summary = document.getElementById('finance-date-repair-summary');
        if (!list || !summary) return;

        summary.textContent = partition.quarantinedCount > 0
            ? `${pluralize(partition.quarantinedCount, 'transaction')} excluded from metrics and Activity until repaired${partition.warningCount ? `; ${pluralize(partition.warningCount, 'older date format')} can also be normalized` : ''}.`
            : `${pluralize(partition.warningCount, 'older date format')} can be normalized without changing the assigned day.`;

        list.replaceChildren();
        partition.repairableEntries.forEach(entry => list.appendChild(renderRepairEntry(entry)));

        if (!partition.repairableEntries.length) {
            list.appendChild(createTextElement('p', 'finance-date-repair-empty', 'All transaction dates are healthy.'));
        }
    }

    function closeFinanceDateRepairModal() {
        const modal = document.getElementById('finance-date-repair-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        if (returnFocusElement?.isConnected) returnFocusElement.focus();
        returnFocusElement = null;
    }

    function openFinanceDateRepairModal() {
        const partition = getPartition();
        if (!partition.repairableCount) {
            notify('All transaction dates are healthy.');
            return;
        }

        const modal = document.getElementById('finance-date-repair-modal');
        if (!modal) return;
        returnFocusElement = document.activeElement;
        renderFinanceDateRepairList(partition);
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('finance-date-repair-close')?.focus();
    }

    function clearDerivedTransactionFields(transaction) {
        [
            '_ts',
            '_year',
            '_month',
            '_dateKey',
            '_dateQualitySource',
            '_dateQualityStatus',
            '_activityTs',
            '_searchText'
        ].forEach(key => delete transaction[key]);
        return transaction;
    }

    async function repairFinanceTransactionDate(transactionId, value) {
        const normalized = root.normalizeFinanceRepairDateInput(value);
        if (!normalized.valid) throw new Error(normalized.error);

        const db = await root.getDB();
        const index = (db.transactions || []).findIndex(entry => (
            !entry?.deletedAt && String(entry.id || '') === String(transactionId || '')
        ));
        if (index < 0) throw new Error('Transaction could not be found. Reload the app and try again.');

        const storedEntry = db.transactions[index];
        const decrypted = await root.decryptData(storedEntry.data);
        if (!decrypted || typeof decrypted !== 'object') {
            throw new Error('Transaction could not be decrypted.');
        }

        const repairedTransaction = clearDerivedTransactionFields({
            ...decrypted,
            date: normalized.isoDate
        });
        db.transactions[index] = {
            ...storedEntry,
            data: await root.encryptData(repairedTransaction),
            lastModified: Date.now()
        };

        const persisted = await root.saveDB(db);
        rawTransactions = (persisted.transactions || []).filter(entry => !entry.deletedAt);
        await root.loadAndRender();
        return normalized;
    }

    async function handleRepairClick(event) {
        const button = event.target.closest('[data-date-repair-id]');
        if (!button) return;
        const row = button.closest('[data-date-repair-row]');
        const input = row?.querySelector('[data-date-repair-input]');
        const status = row?.querySelector('[data-date-repair-status]');
        if (!row || !input || !status) return;

        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        status.textContent = 'Saving encrypted repair…';
        try {
            await repairFinanceTransactionDate(button.dataset.dateRepairId, input.value);
            notify('Transaction date repaired.');
        } catch (error) {
            console.error('Transaction date repair failed.', error);
            status.textContent = error?.message || 'Could not save this repair.';
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    }

    function refreshFinanceDateQualityUI(partition = getPartition()) {
        refreshActivityDateReviewControl(partition);
        const banner = document.getElementById('finance-date-quality-banner');
        const title = document.getElementById('finance-date-quality-title');
        const summary = document.getElementById('finance-date-quality-summary');
        const review = document.getElementById('finance-date-quality-review');
        if (!banner || !title || !summary || !review) return;

        const hasIssues = partition.repairableCount > 0;
        banner.hidden = !hasIssues;
        banner.classList.toggle('finance-date-quality-banner--warning-only', partition.quarantinedCount === 0);
        if (!hasIssues) {
            if (!document.getElementById('finance-date-repair-modal')?.classList.contains('hidden')) {
                closeFinanceDateRepairModal();
            }
            return;
        }

        title.textContent = partition.quarantinedCount > 0
            ? `${pluralize(partition.quarantinedCount, 'transaction')} excluded until ${partition.quarantinedCount === 1 ? 'its date is' : 'their dates are'} repaired`
            : `${pluralize(partition.warningCount, 'transaction date')} ready to normalize`;
        summary.textContent = partition.quarantinedCount > 0
            ? `These records are still encrypted and saved, but they are not counted in metrics or shown in Activity.${partition.warningCount ? ` ${pluralize(partition.warningCount, 'additional date')} uses an older format.` : ''}`
            : 'These records remain usable; normalization makes their stored date format consistent.';
        review.textContent = `Review ${pluralize(partition.repairableCount, 'date')}`;

        const modal = document.getElementById('finance-date-repair-modal');
        if (modal && !modal.classList.contains('hidden')) renderFinanceDateRepairList(partition);
    }

    function initFinanceDateRepair() {
        if (initialized) return;
        initialized = true;
        document.getElementById('finance-date-repair-list')?.addEventListener('click', handleRepairClick);
        document.getElementById('finance-date-repair-close')?.addEventListener('click', closeFinanceDateRepairModal);
        document.getElementById('finance-date-repair-done')?.addEventListener('click', closeFinanceDateRepairModal);
        document.getElementById('finance-date-repair-modal')?.addEventListener('click', event => {
            if (event.target.id === 'finance-date-repair-modal') closeFinanceDateRepairModal();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !document.getElementById('finance-date-repair-modal')?.classList.contains('hidden')) {
                closeFinanceDateRepairModal();
            }
        });
        refreshFinanceDateQualityUI();
    }

    root.initFinanceDateRepair = initFinanceDateRepair;
    root.refreshFinanceDateQualityUI = refreshFinanceDateQualityUI;
    root.renderFinanceDateRepairList = renderFinanceDateRepairList;
    root.openFinanceDateRepairModal = openFinanceDateRepairModal;
    root.closeFinanceDateRepairModal = closeFinanceDateRepairModal;
    root.repairFinanceTransactionDate = repairFinanceTransactionDate;
    root.refreshActivityDateReviewControl = refreshActivityDateReviewControl;
})(typeof window !== 'undefined' ? window : globalThis);
