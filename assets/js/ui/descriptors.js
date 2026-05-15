(function () {
    const DESCRIPTOR_GLOSSARY = Object.freeze({
        'total balance': 'This is your net cash position: income minus expenses over the selected scope.\nUse it as your primary signal of whether your finances are compounding or shrinking.',
        'income': 'Income is money entering your system, such as salary, sales, or repayments.\nConsistent income growth improves runway and savings capacity.',
        'expenses': 'Expenses are outflows like bills, purchases, debt repayments, and fees.\nTracking by category helps you spot leaks and reduce low-value spending.',
        'savings rate': 'Savings Rate shows what percent of income you keep after expenses.\nHigher and stable savings rates usually mean stronger long-term resilience.',
        'budgets': 'Budgets set planned limits per category for a chosen month.\nCompare plan vs actual to decide where to cut, hold, or reallocate.',
        'recurring reminders': 'Recurring reminders automate repeating cash events like salary or subscriptions.\nThey reduce missed entries and keep month-end numbers accurate.',
        'reminders': 'Reminders automate repeating cash events like salary or subscriptions.\nThey reduce missed entries and keep month-end numbers accurate.',
        'item tracker': 'Item Tracker logs repeat purchases and their price history.\nUse it to detect inflation, negotiate better prices, and time purchases.',
        'backups': 'Backups save an encrypted snapshot of your vault data.\nUse them before major cleanup, imports, or when switching devices.',
        'backup settings': 'Backup settings control if and when auto-backups run.\nSet a routine so recovery points exist even if you forget manual exports.',
        'restore from file': 'Restore loads a previous backup snapshot into the app.\nUse this to recover after accidental deletes or data corruption.',
        'business kpi scorecard': 'This panel summarizes performance and risk using core finance ratios.\nTreat it like a dashboard for fast health checks before deep analysis.',
        'insights hub': 'Insights Hub surfaces high-signal patterns from recent transactions.\nUse it for quick weekly coaching: where risk is rising and where behavior is improving.',
        'spend velocity': 'Spend Velocity estimates where category spending is likely to end this month.\nIt helps you act early before overspending becomes final.',
        'budget health': 'Budget Health compares projected category spend against your budget limits.\nWhen risk appears, adjust spending or rebalance budgets before month end.',
        'mom trend': 'MoM Trend compares this month against the previous month.\nUse it to see whether income momentum and expense control are improving.',
        'debt service ratio': 'Debt Service Ratio = debt payments / income.\nLower is healthier because less income is locked into obligations.',
        'investment rate': 'Investment Rate measures what share of income goes to savings and investments.\nHigher rates accelerate future net worth growth.',
        'estimated net worth': 'Estimated Net Worth is assets minus liabilities.\nIt is your long-term scoreboard, not just month-to-month cash.',
        'close readiness': 'Close Readiness indicates how prepared your selected month is for final review.\nAim for complete categories, reconciled entries, and no unresolved reminders.',
        'runway': 'Runway estimates how long liquid funds can cover current spending.\nMore runway gives flexibility during income shocks.',
        'burn rate': 'Burn Rate is the pace at which cash is being spent.\nLower burn relative to income and reserves extends runway.',
        'unusual spend': 'Unusual Spend flags transactions that are far outside typical behavior.\nReview these entries to catch errors, one-offs, or hidden spending drift.',
        'expense-to-income': 'Expense-to-Income compares total expenses against total income.\nBelow 100% means you are living within your means.',
        'emergency fund': 'Emergency Fund shows how many months of essential expenses you can cover.\nA common target is 3-6 months, higher if income is volatile.',
        'current ratio': 'Current Ratio = liquid assets / short-term liabilities.\nAbove 1.0 generally means near-term obligations are covered.',
        'monthly close': 'Monthly Close is the end-of-month process to finalize records and performance.\nIt creates consistent snapshots for trend and quarter comparisons.',
        'time roi calculator': 'Time ROI estimates whether effort and cost produce worthwhile return.\nUse it before projects so you prioritize high-leverage work.',
        'quarterly business review': 'QBR analyzes quarter-over-quarter performance and strategic execution.\nIt helps convert monthly noise into decision-ready trends.',
        'annual goal map': 'AGM maps yearly goals into focused phases and action checkpoints.\nUse it to align daily finance behavior with annual outcomes.',
        'storage diagnostics': 'Storage Diagnostics reports local/IndexedDB sync state and payload health.\nUse it to debug sync issues before they become data-loss risks.',
        'budget variance': 'Budget Variance is the gap between planned and actual spend by category.\nPositive or negative variance shows where assumptions were off.',
        'revenue diversification': 'Revenue Diversification shows how dependent income is on top sources.\nLower concentration risk means more stability if one source drops.',
        'financial statements': 'Financial Statements combine P&L, Cash Flow, and Balance Sheet views.\nUse them together to understand performance, liquidity, and solvency.',
        'income statement': 'The Income Statement (P&L) summarizes revenue, costs, and profit for a period.\nIt explains whether operations produced profit or loss.',
        'cash flow statement': 'Cash Flow Statement tracks cash movement from operations, investing, and financing.\nIt shows liquidity even when profit is positive.',
        'balance sheet': 'Balance Sheet is a snapshot of assets, liabilities, and net worth at a point in time.\nIt helps assess stability and leverage.',
        'revenue': 'Revenue is gross inflow from business activity before costs.\nIt is the top-line driver for margins and cash generation.',
        'cost of earning': 'Cost of Earning represents direct costs needed to generate income.\nReducing this ratio improves gross profit.',
        'gross profit': 'Gross Profit = Revenue - Cost of Earning.\nIt measures how much income remains before operating overhead.',
        'operating expenses': 'Operating Expenses are ongoing costs to run the business excluding direct earning costs.\nControl here protects EBITDA and net income.',
        'ebitda': 'EBITDA is earnings before interest, taxes, depreciation, and amortization.\nIt is a proxy for operating profitability before financing/accounting effects.',
        'debt service': 'Debt Service is the cash used to pay loan principal and interest.\nHigher debt service reduces flexibility for growth and reserves.',
        'growth investment': 'Growth/Investment spending includes reinvestment for expansion and long-term capability.\nTrack this to balance near-term cash with future returns.',
        'net income': 'Net Income is the bottom-line result after all expenses.\nConsistent positive net income strengthens resilience and net worth.',
        'operating cash flow': 'Operating Cash Flow is cash generated by core operations.\nIt indicates whether day-to-day activity is self-funding.',
        'investing cash flow': 'Investing Cash Flow captures cash used for or returned from investments/assets.\nNegative values often reflect growth investments.',
        'financing cash flow': 'Financing Cash Flow reflects debt and capital inflows/outflows.\nIt shows how operations and investments are funded.',
        'free cash flow': 'Free Cash Flow is cash remaining after operating needs and reinvestment.\nIt can be used to repay debt, build reserves, or invest.',
        'net cash flow': 'Net Cash Flow is total cash in minus cash out for the period.\nPositive values grow liquidity; negative values consume it.',
        'receivables': 'Receivables are amounts owed to you not yet collected in cash.\nRising receivables can pressure near-term cash flow.',
        'total assets': 'Total Assets are all resources with economic value owned by you/business.\nThey form one side of the balance sheet.',
        'total liabilities': 'Total Liabilities are all obligations owed to others.\nGrowth in liabilities raises leverage and repayment risk.',
        'forecast scenario': 'Forecast Scenario selects which assumption set drives projected results.\nCompare base, best, and worst cases before committing decisions.',
        '12-month rolling forecast': 'A 12-month rolling forecast projects income, outflow, and cash monthly.\nUpdate it regularly to spot future risks early.',
        'operating review': 'Operating Review compares forecast vs actual performance and flags guardrail breaches.\nUse it to diagnose execution gaps month by month.',
        'cash floor': 'Cash Floor is the minimum acceptable cash balance threshold.\nFalling below it signals liquidity risk and need for corrective action.',
        'income variance alert': 'Income Variance Alert sets the % drop threshold that triggers warnings.\nUse it to catch revenue underperformance quickly.',
        'outflow variance alert': 'Outflow Variance Alert sets the % overspend threshold that triggers warnings.\nIt helps surface cost drift before it compounds.',
        'trend period': 'Trend Period chooses how many months are shown in charts.\nUse longer periods for direction, shorter periods for recent behavior.',
        'metric scope': 'Metric Scope controls which transactions feed KPIs and dashboards.\nSwitch scope when you want current-month focus vs full-history context.',
        'currency toggle': 'Currency Toggle changes display currency using fetched exchange rates.\nIt helps compare values consistently when transactions use mixed currencies.',
        'dark mode': 'Dark Mode changes visual theme for comfort in low-light environments.\nUse whichever mode improves readability for long review sessions.',
        'master key': 'Master Key decrypts your vault and protects private financial data.\nKeep it secure because losing it can block access to encrypted records.'
    });

    const DESCRIPTOR_ALIASES = Object.freeze({
        'roi': 'time roi calculator',
        'roi calc': 'time roi calculator',
        'qbr': 'quarterly business review',
        'agm': 'annual goal map',
        'mom': 'mom trend',
        'velocity': 'spend velocity',
        'health': 'budget health',
        'unlock': 'master key',
        'unlock vault': 'master key',
        'scope': 'metric scope',
        'backup': 'backups',
        'pl': 'income statement',
        'p&l': 'income statement',
        'profit and loss': 'income statement',
        'cash flow': 'cash flow statement',
        'growth/investment': 'growth investment',
        'operating cf': 'operating cash flow',
        'investing cf': 'investing cash flow',
        'financing cf': 'financing cash flow',
        'net cf': 'net cash flow'
    });

    const ID_DESCRIPTOR_KEYS = Object.freeze({
        'dark-mode-toggle': 'dark mode',
        'currency-toggle': 'currency toggle',
        'backup-menu-btn': 'backups',
        'unlock-btn': 'master key',
        'monthly-close-btn': 'monthly close',
        'business-kpi-panel': 'business kpi scorecard',
        'storage-diagnostics-panel': 'storage diagnostics',
        'variance-panel': 'budget variance',
        'revenue-diversification-panel': 'revenue diversification',
        'trend-period': 'trend period',
        'metric-scope': 'metric scope'
    });

    const CANDIDATE_SELECTOR = [
        'button',
        'select',
        '.card-hover',
        '#business-kpi-panel .rounded-2xl',
        '#business-kpi-panel',
        '#storage-diagnostics-panel',
        '#variance-panel',
        '#revenue-diversification-panel',
        '[data-descriptor-key]'
    ].join(', ');

    let descriptorTooltipEl = null;
    let activeDescriptorAnchor = null;
    let initialized = false;
    let descriptorScanTimer = null;
    let descriptorObserver = null;

    function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function formatDescriptorTitle(value) {
        const source = cleanText(value).replace(/\?+$/, '').trim();
        if (!source) return 'Definition';
        return source.split(' ').map(word => {
            const upper = word.toUpperCase();
            if (['ROI', 'KPI', 'QBR', 'AGM', 'EBITDA'].includes(upper)) return upper;
            if (word.length <= 2) return upper;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    }

    function normalizeKey(value) {
        return cleanText(value)
            .toLowerCase()
            .replace(/[|•]/g, ' ')
            .replace(/[^\w\s%+\-/]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function resolveDescriptor(normalizedKey) {
        if (!normalizedKey) return null;

        const canonicalKey = DESCRIPTOR_ALIASES[normalizedKey] || normalizedKey;
        if (DESCRIPTOR_GLOSSARY[canonicalKey]) {
            return { key: canonicalKey, body: DESCRIPTOR_GLOSSARY[canonicalKey] };
        }

        for (const [aliasKey, resolvedKey] of Object.entries(DESCRIPTOR_ALIASES)) {
            if (normalizedKey.includes(aliasKey) && DESCRIPTOR_GLOSSARY[resolvedKey]) {
                return { key: resolvedKey, body: DESCRIPTOR_GLOSSARY[resolvedKey] };
            }
        }

        for (const [term, body] of Object.entries(DESCRIPTOR_GLOSSARY)) {
            if (normalizedKey.includes(term)) {
                return { key: term, body };
            }
        }

        return null;
    }

    function getElementLabel(element) {
        if (!(element instanceof Element)) return '';
        if (element.dataset.descriptorKey) return cleanText(element.dataset.descriptorKey);
        if (element.id && ID_DESCRIPTOR_KEYS[element.id]) return ID_DESCRIPTOR_KEYS[element.id];

        const ariaLabel = cleanText(element.getAttribute('aria-label'));
        if (ariaLabel) return ariaLabel;

        if (element.matches('button, select')) {
            const buttonText = cleanText(element.textContent);
            if (buttonText) return buttonText;
        }

        const labelNode = element.querySelector('h1, h2, h3, h4, h5, h6, p, span');
        if (labelNode) {
            const labelText = cleanText(labelNode.textContent);
            if (labelText) return labelText;
        }

        return cleanText(element.textContent);
    }

    function resolveElementDescriptor(element) {
        const rawLabel = getElementLabel(element);
        const normalizedKey = normalizeKey(rawLabel);
        const resolved = resolveDescriptor(normalizedKey);
        if (!resolved) return null;

        return {
            key: resolved.key,
            label: rawLabel || resolved.key,
            body: resolved.body
        };
    }

    function getDescriptorIconHost(anchor) {
        if (!(anchor instanceof Element)) return null;

        if (anchor.matches('button, h1, h2, h3, h4, h5, h6, p, span')) return anchor;
        if (anchor.dataset.descriptorIconHost === 'true') return anchor;

        const explicitHost = anchor.querySelector('[data-descriptor-icon-host="true"]');
        if (explicitHost) return explicitHost;

        const textHost = anchor.querySelector('h1, h2, h3, h4, h5, h6, p, span');
        return textHost || null;
    }

    function ensureDescriptorIcon(anchor, descriptor) {
        if (!descriptor?.body) return;
        const host = getDescriptorIconHost(anchor);
        if (!host) return;
        if (host.classList.contains('descriptor-icon-disabled')) return;
        const existingIcon = host.querySelector('.descriptor-hint-icon');
        if (existingIcon) {
            configureDescriptorIcon(existingIcon, descriptor, host);
            return;
        }

        const icon = document.createElement('span');
        configureDescriptorIcon(icon, descriptor, host);

        host.appendChild(document.createTextNode(' '));
        host.appendChild(icon);
    }

    function configureDescriptorIcon(icon, descriptor, host) {
        if (!(icon instanceof Element)) return;
        const label = formatDescriptorTitle(descriptor?.key || descriptor?.label || 'Definition');
        icon.className = 'descriptor-hint-icon';
        icon.textContent = '?';
        icon.dataset.descriptorTrigger = 'true';
        icon.setAttribute('role', 'button');
        icon.setAttribute('aria-label', `Show description for ${label}`);
        icon.setAttribute('tabindex', host?.matches('button') ? '-1' : '0');
    }

    function isDescriptorCandidate(element) {
        if (!(element instanceof Element)) return false;
        if (element.matches(CANDIDATE_SELECTOR)) return true;
        return !!(element.id && ID_DESCRIPTOR_KEYS[element.id]);
    }

    function findDescriptorTarget(startElement) {
        let node = startElement instanceof Element ? startElement : null;
        while (node && node !== document.body) {
            if (isDescriptorCandidate(node)) {
                const descriptor = resolveElementDescriptor(node);
                if (descriptor) {
                    return { anchor: node, descriptor };
                }
            }
            node = node.parentElement;
        }
        return null;
    }

    function ensureDescriptorTooltip() {
        if (descriptorTooltipEl) return descriptorTooltipEl;

        descriptorTooltipEl = document.createElement('div');
        descriptorTooltipEl.className = 'finance-descriptor-tooltip';
        descriptorTooltipEl.setAttribute('role', 'tooltip');
        descriptorTooltipEl.setAttribute('aria-hidden', 'true');
        descriptorTooltipEl.innerHTML = `
            <p class="finance-descriptor-title"></p>
            <p class="finance-descriptor-body"></p>
        `;

        document.body.appendChild(descriptorTooltipEl);
        return descriptorTooltipEl;
    }

    function positionDescriptorTooltip(anchorElement) {
        if (!descriptorTooltipEl || !(anchorElement instanceof Element)) return;

        const rect = anchorElement.getBoundingClientRect();
        const gap = 10;
        const edgePadding = 12;
        const tooltipWidth = descriptorTooltipEl.offsetWidth || 280;
        const tooltipHeight = descriptorTooltipEl.offsetHeight || 70;

        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        left = Math.max(edgePadding, Math.min(left, window.innerWidth - tooltipWidth - edgePadding));

        let top = rect.top - tooltipHeight - gap;
        if (top < edgePadding) {
            top = rect.bottom + gap;
        }

        descriptorTooltipEl.style.left = `${Math.round(left)}px`;
        descriptorTooltipEl.style.top = `${Math.round(top)}px`;
    }

    function showDescriptorTooltip(anchorElement, descriptor) {
        if (!descriptor || !descriptor.body) return;

        const tooltip = ensureDescriptorTooltip();
        const titleEl = tooltip.querySelector('.finance-descriptor-title');
        const bodyEl = tooltip.querySelector('.finance-descriptor-body');

        titleEl.textContent = formatDescriptorTitle(descriptor.key || descriptor.label || 'Definition');
        bodyEl.textContent = descriptor.body;

        tooltip.style.visibility = 'hidden';
        tooltip.classList.add('is-visible');
        tooltip.setAttribute('aria-hidden', 'false');
        positionDescriptorTooltip(anchorElement);
        tooltip.style.visibility = 'visible';

        activeDescriptorAnchor = anchorElement;
    }

    function hideDescriptorTooltip() {
        if (!descriptorTooltipEl) return;
        descriptorTooltipEl.classList.remove('is-visible');
        descriptorTooltipEl.setAttribute('aria-hidden', 'true');
        activeDescriptorAnchor = null;
    }

    function getDescriptorTriggerNode(target) {
        const element = target instanceof Element
            ? target
            : (target instanceof Node ? target.parentElement : null);
        if (!(element instanceof Element)) return null;
        return element.closest('.descriptor-hint-icon[data-descriptor-trigger="true"]');
    }

    function onDescriptorClick(event) {
        const trigger = getDescriptorTriggerNode(event.target);
        if (trigger) {
            const match = findDescriptorTarget(trigger);
            if (!match) return;

            event.preventDefault();
            event.stopPropagation();

            if (activeDescriptorAnchor === match.anchor && descriptorTooltipEl?.classList.contains('is-visible')) {
                hideDescriptorTooltip();
                return;
            }

            showDescriptorTooltip(match.anchor, match.descriptor);
            return;
        }

        if (!activeDescriptorAnchor) return;

        const element = event.target instanceof Element
            ? event.target
            : (event.target instanceof Node ? event.target.parentElement : null);
        if (element instanceof Element && descriptorTooltipEl?.contains(element)) return;

        hideDescriptorTooltip();
    }

    function onDescriptorKeyDown(event) {
        const trigger = getDescriptorTriggerNode(event.target);
        if (trigger && (event.key === 'Enter' || event.key === ' ')) {
            const match = findDescriptorTarget(trigger);
            if (!match) return;

            event.preventDefault();
            event.stopPropagation();

            if (activeDescriptorAnchor === match.anchor && descriptorTooltipEl?.classList.contains('is-visible')) {
                hideDescriptorTooltip();
                return;
            }

            showDescriptorTooltip(match.anchor, match.descriptor);
            return;
        }

        if (event.key === 'Escape') {
            hideDescriptorTooltip();
        }
    }

    function refreshDescriptorMarkers(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') return;

        const nodes = root.querySelectorAll(CANDIDATE_SELECTOR);
        nodes.forEach(node => {
            const descriptor = resolveElementDescriptor(node);
            if (descriptor) {
                node.classList.add('descriptor-enabled');
                ensureDescriptorIcon(node, descriptor);
            }
        });
    }

    function scheduleDescriptorMarkerRefresh() {
        if (descriptorScanTimer) return;
        descriptorScanTimer = setTimeout(() => {
            descriptorScanTimer = null;
            refreshDescriptorMarkers(document);
        }, 120);
    }

    function initDescriptorTooltips() {
        if (initialized) {
            scheduleDescriptorMarkerRefresh();
            return;
        }
        initialized = true;

        ensureDescriptorTooltip();
        refreshDescriptorMarkers(document);

        document.addEventListener('click', onDescriptorClick, true);
        document.addEventListener('keydown', onDescriptorKeyDown, true);

        window.addEventListener('resize', () => {
            if (activeDescriptorAnchor) positionDescriptorTooltip(activeDescriptorAnchor);
        });
        window.addEventListener('scroll', () => {
            if (activeDescriptorAnchor) positionDescriptorTooltip(activeDescriptorAnchor);
        }, true);

        if (typeof MutationObserver !== 'undefined') {
            descriptorObserver = new MutationObserver(() => {
                scheduleDescriptorMarkerRefresh();
            });
            descriptorObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    window.initDescriptorTooltips = initDescriptorTooltips;
    window.refreshDescriptorTargets = () => refreshDescriptorMarkers(document);
})();
