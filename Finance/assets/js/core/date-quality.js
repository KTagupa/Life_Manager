// =============================================
// PHASE 2B: TRANSACTION DATE QUALITY
// =============================================
// Pure inspection and partitioning utilities. Persistence and UI live in the
// date-repair feature so this module remains safe to test in isolation.

(function exposeFinanceDateQuality(root, factory) {
    const classifier = typeof module === 'object' && module.exports
        ? require('./transaction-classifier.js')
        : root;
    const api = factory(classifier);

    if (root) {
        root.FINANCE_DATE_QUALITY_VERSION = api.VERSION;
        root.getFinanceTransactionDateQuality = api.getFinanceTransactionDateQuality;
        root.isFinanceTransactionDateUsable = api.isFinanceTransactionDateUsable;
        root.partitionFinanceTransactionsByDate = api.partitionFinanceTransactionsByDate;
        root.normalizeFinanceRepairDateInput = api.normalizeFinanceRepairDateInput;
        root.validateFinanceDateQuality = api.validate;
    }

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function buildFinanceDateQuality(classifier) {
    const VERSION = '1.0.0';
    const inspectDate = classifier?.inspectFinanceTransactionDate;

    if (typeof inspectDate !== 'function') {
        throw new Error('Finance transaction date inspector is unavailable.');
    }

    function freezeResult(value) {
        return Object.freeze(value);
    }

    function getRawDate(value) {
        if (value instanceof Date) {
            return Number.isFinite(value.getTime()) ? value.toISOString() : '';
        }
        return String(value ?? '').trim();
    }

    function getUsableTimestamp(value, dateKey) {
        if (value instanceof Date) return value.getTime();
        const raw = getRawDate(value);
        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) return parsed;
        return Date.parse(`${dateKey}T00:00:00.000Z`);
    }

    function getFinanceTransactionDateQuality(transaction) {
        const rawDate = getRawDate(transaction?.date);
        const inspection = inspectDate(transaction?.date);
        const warning = inspection.valid && inspection.issue?.severity === 'warning';
        const usable = inspection.valid === true && !!inspection.dateKey;
        const timestamp = usable
            ? getUsableTimestamp(transaction?.date, inspection.dateKey)
            : null;

        return freezeResult({
            status: usable ? (warning ? 'warning' : 'valid') : 'quarantined',
            valid: usable,
            usable,
            canonical: usable && !warning,
            rawDate,
            dateKey: usable ? inspection.dateKey : null,
            timestamp: Number.isFinite(timestamp) ? timestamp : null,
            issue: inspection.issue || null
        });
    }

    function isFinanceTransactionDateUsable(transaction) {
        return getFinanceTransactionDateQuality(transaction).usable;
    }

    function partitionFinanceTransactionsByDate(transactions) {
        const usableTransactions = [];
        const canonicalTransactions = [];
        const warningEntries = [];
        const quarantinedEntries = [];

        (Array.isArray(transactions) ? transactions : []).forEach(transaction => {
            const quality = getFinanceTransactionDateQuality(transaction);
            const entry = freezeResult({ transaction, quality });

            if (!quality.usable) {
                quarantinedEntries.push(entry);
                return;
            }

            usableTransactions.push(transaction);
            if (quality.status === 'warning') warningEntries.push(entry);
            else canonicalTransactions.push(transaction);
        });

        const repairableEntries = [...quarantinedEntries, ...warningEntries];
        return freezeResult({
            transactionCount: Array.isArray(transactions) ? transactions.length : 0,
            usableCount: usableTransactions.length,
            canonicalCount: canonicalTransactions.length,
            warningCount: warningEntries.length,
            quarantinedCount: quarantinedEntries.length,
            repairableCount: repairableEntries.length,
            usableTransactions: Object.freeze(usableTransactions),
            canonicalTransactions: Object.freeze(canonicalTransactions),
            warningEntries: Object.freeze(warningEntries),
            quarantinedEntries: Object.freeze(quarantinedEntries),
            repairableEntries: Object.freeze(repairableEntries)
        });
    }

    function normalizeFinanceRepairDateInput(value) {
        const raw = String(value ?? '').trim();
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return freezeResult({
                valid: false,
                dateKey: null,
                isoDate: null,
                error: 'Choose a date in YYYY-MM-DD format.'
            });
        }

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const candidate = new Date(Date.UTC(year, month - 1, day));
        const calendarMatches = candidate.getUTCFullYear() === year
            && candidate.getUTCMonth() + 1 === month
            && candidate.getUTCDate() === day;

        if (!calendarMatches) {
            return freezeResult({
                valid: false,
                dateKey: null,
                isoDate: null,
                error: 'Choose a valid calendar date.'
            });
        }

        const dateKey = `${match[1]}-${match[2]}-${match[3]}`;
        return freezeResult({
            valid: true,
            dateKey,
            isoDate: `${dateKey}T00:00:00.000Z`,
            error: null
        });
    }

    function validate() {
        const errors = [];
        const missing = getFinanceTransactionDateQuality({ date: '' });
        const canonical = getFinanceTransactionDateQuality({ date: '2026-07-31' });
        const repaired = normalizeFinanceRepairDateInput('2024-02-29');

        if (missing.status !== 'quarantined' || missing.usable) {
            errors.push('Missing dates must be quarantined.');
        }
        if (canonical.status !== 'valid' || canonical.dateKey !== '2026-07-31') {
            errors.push('Canonical ISO dates must remain usable.');
        }
        if (!repaired.valid || repaired.isoDate !== '2024-02-29T00:00:00.000Z') {
            errors.push('Repair normalization invariant failed.');
        }

        return freezeResult({ valid: errors.length === 0, errors: Object.freeze(errors), version: VERSION });
    }

    return freezeResult({
        VERSION,
        getFinanceTransactionDateQuality,
        isFinanceTransactionDateUsable,
        partitionFinanceTransactionsByDate,
        normalizeFinanceRepairDateInput,
        validate
    });
});
