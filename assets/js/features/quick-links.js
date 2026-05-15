const FINANCE_QUICK_LINK_MAX = 25;
const FINANCE_QUICK_LINK_ICONS = ['wallet', 'coins', 'credit-card', 'landmark', 'receipt'];
const FINANCE_QUICK_LINK_COLORS = [
    {
        key: 'emerald',
        label: 'Emerald',
        bg: 'linear-gradient(135deg, #059669, #34d399)',
        soft: 'rgba(16, 185, 129, 0.16)',
        shadow: 'rgba(16, 185, 129, 0.28)'
    },
    {
        key: 'blue',
        label: 'Blue',
        bg: 'linear-gradient(135deg, #2563eb, #60a5fa)',
        soft: 'rgba(59, 130, 246, 0.16)',
        shadow: 'rgba(59, 130, 246, 0.26)'
    },
    {
        key: 'amber',
        label: 'Amber',
        bg: 'linear-gradient(135deg, #d97706, #fbbf24)',
        soft: 'rgba(245, 158, 11, 0.16)',
        shadow: 'rgba(245, 158, 11, 0.26)'
    },
    {
        key: 'rose',
        label: 'Rose',
        bg: 'linear-gradient(135deg, #e11d48, #fb7185)',
        soft: 'rgba(244, 63, 94, 0.16)',
        shadow: 'rgba(244, 63, 94, 0.24)'
    },
    {
        key: 'violet',
        label: 'Violet',
        bg: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
        soft: 'rgba(139, 92, 246, 0.16)',
        shadow: 'rgba(139, 92, 246, 0.24)'
    }
];

const FINANCE_QUICK_LINK_COMBINATIONS = (() => {
    const combos = [];
    for (let group = 0; group < FINANCE_QUICK_LINK_COLORS.length; group += 1) {
        for (let iconIndex = 0; iconIndex < FINANCE_QUICK_LINK_ICONS.length; iconIndex += 1) {
            const colorIndex = (iconIndex + group) % FINANCE_QUICK_LINK_COLORS.length;
            const icon = FINANCE_QUICK_LINK_ICONS[iconIndex];
            const color = FINANCE_QUICK_LINK_COLORS[colorIndex].key;
            combos.push({
                key: `${icon}::${color}`,
                icon,
                color
            });
        }
    }
    return combos;
})();

const FINANCE_QUICK_LINK_COLOR_MAP = FINANCE_QUICK_LINK_COLORS.reduce((acc, color) => {
    acc[color.key] = color;
    return acc;
}, {});

let financeQuickLinks = [];
let financeQuickLinksOpen = false;
let financeQuickLinksUiBound = false;
let financeQuickLinkScrollFrame = 0;
let financeQuickLinkSaveInFlight = false;

function getFinanceQuickLinkLabel(link) {
    const explicitLabel = typeof link?.label === 'string' ? link.label.trim() : '';
    if (explicitLabel) return explicitLabel;

    const rawUrl = typeof link?.url === 'string' ? link.url.trim() : '';
    if (!rawUrl) return 'Quick Link';

    const withoutProtocol = rawUrl.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    const withoutQuery = withoutProtocol.split(/[?#]/)[0];
    const parts = withoutQuery.split('/').filter(Boolean);
    const fallback = parts.length ? parts[parts.length - 1] : withoutQuery;
    return fallback || rawUrl;
}

function normalizeFinanceQuickLinkUrl(input) {
    const trimmed = String(input || '').trim();
    if (!trimmed) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return trimmed;
    if (/\.(html?|pdf|md)$/i.test(trimmed)) return trimmed;

    const firstSegment = trimmed.split('/')[0];
    if (firstSegment.includes('.') && !/\.(html?|pdf|md)$/i.test(firstSegment)) {
        return `https://${trimmed}`;
    }

    return trimmed;
}

function getFinanceQuickLinkComboKey(icon, color) {
    if (!icon || !color) return '';
    return `${String(icon).trim()}::${String(color).trim()}`;
}

function getFinanceQuickLinkCombo(link) {
    const comboKey = getFinanceQuickLinkComboKey(link?.icon, link?.color);
    const found = FINANCE_QUICK_LINK_COMBINATIONS.find(combo => combo.key === comboKey);
    return found || FINANCE_QUICK_LINK_COMBINATIONS[0];
}

function getUsedFinanceQuickLinkCombos(links) {
    const used = new Set();
    (Array.isArray(links) ? links : []).forEach(link => {
        const key = getFinanceQuickLinkComboKey(link?.icon, link?.color);
        if (key) used.add(key);
    });
    return used;
}

function getNextAvailableFinanceQuickLinkCombo(usedCombos) {
    for (let index = 0; index < FINANCE_QUICK_LINK_COMBINATIONS.length; index += 1) {
        const combo = FINANCE_QUICK_LINK_COMBINATIONS[index];
        if (!usedCombos.has(combo.key)) {
            return combo;
        }
    }
    return null;
}

function serializeFinanceQuickLinksForCompare(links) {
    return JSON.stringify((Array.isArray(links) ? links : []).map(link => ({
        id: String(link?.id || ''),
        label: typeof link?.label === 'string' ? link.label.trim() : '',
        url: typeof link?.url === 'string' ? link.url.trim() : '',
        icon: typeof link?.icon === 'string' ? link.icon.trim() : '',
        color: typeof link?.color === 'string' ? link.color.trim() : '',
        createdAt: Number(link?.createdAt || 0),
        lastModified: Number(link?.lastModified || 0)
    })));
}

function normalizeFinanceQuickLinks(rawLinks) {
    const source = Array.isArray(rawLinks) ? rawLinks.slice(0, FINANCE_QUICK_LINK_MAX) : [];
    const normalized = [];
    const usedCombos = new Set();

    source.forEach((entry) => {
        const normalizedUrl = normalizeFinanceQuickLinkUrl(entry?.url);
        if (!normalizedUrl) return;

        const id = String(entry?.id || `finance_quick_link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
        const createdAt = Number.isFinite(Number(entry?.createdAt)) ? Math.max(0, Number(entry.createdAt)) : 0;
        const lastModified = Number.isFinite(Number(entry?.lastModified))
            ? Math.max(0, Number(entry.lastModified))
            : createdAt;

        let icon = typeof entry?.icon === 'string' ? entry.icon.trim() : '';
        let color = typeof entry?.color === 'string' ? entry.color.trim() : '';
        let comboKey = getFinanceQuickLinkComboKey(icon, color);

        if (!comboKey || usedCombos.has(comboKey) || !FINANCE_QUICK_LINK_COMBINATIONS.some(combo => combo.key === comboKey)) {
            const nextCombo = getNextAvailableFinanceQuickLinkCombo(usedCombos);
            if (nextCombo) {
                icon = nextCombo.icon;
                color = nextCombo.color;
                comboKey = nextCombo.key;
            } else {
                icon = FINANCE_QUICK_LINK_COMBINATIONS[0].icon;
                color = FINANCE_QUICK_LINK_COMBINATIONS[0].color;
                comboKey = FINANCE_QUICK_LINK_COMBINATIONS[0].key;
            }
        }

        usedCombos.add(comboKey);
        normalized.push({
            id,
            label,
            url: normalizedUrl,
            icon,
            color,
            createdAt,
            lastModified: Math.max(lastModified, createdAt)
        });
    });

    return {
        links: normalized,
        changed:
            serializeFinanceQuickLinksForCompare(source) !== serializeFinanceQuickLinksForCompare(normalized)
            || (Array.isArray(rawLinks) ? rawLinks.length : 0) > FINANCE_QUICK_LINK_MAX,
        lastModified: normalized.reduce((max, link) => Math.max(max, Number(link.lastModified || 0)), 0)
    };
}

function financeQuickLinksPanelElements() {
    return {
        launcher: document.getElementById('finance-quick-links-launcher'),
        panel: document.getElementById('finance-quick-links-panel'),
        list: document.getElementById('finance-quick-links-list'),
        count: document.getElementById('finance-quick-links-count'),
        addBtn: document.getElementById('finance-quick-links-add-btn'),
        scrollUpBtn: document.getElementById('finance-quick-links-scroll-up'),
        scrollDownBtn: document.getElementById('finance-quick-links-scroll-down')
    };
}

function financeQuickLinkModalElements() {
    return {
        modal: document.getElementById('finance-quick-link-modal'),
        labelInput: document.getElementById('finance-quick-link-label'),
        urlInput: document.getElementById('finance-quick-link-url'),
        preview: document.getElementById('finance-quick-link-preview')
    };
}

function applyFinanceQuickLinkStyles(target, combo) {
    const colorMeta = FINANCE_QUICK_LINK_COLOR_MAP[combo.color] || FINANCE_QUICK_LINK_COLORS[0];
    target.style.setProperty('--finance-quick-link-bg', colorMeta.bg);
    target.style.setProperty('--finance-quick-link-soft', colorMeta.soft);
    target.style.setProperty('--finance-quick-link-shadow', colorMeta.shadow);
}

function formatFinanceQuickLinkTooltip(link) {
    const label = getFinanceQuickLinkLabel(link);
    return `${label} • ${link.url}`;
}

function openFinanceQuickLink(link) {
    if (!link?.url) return;
    closeFinanceQuickLinks();
    const isExternal = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link.url);
    if (isExternal) {
        window.open(link.url, '_blank', 'noopener,noreferrer');
        return;
    }
    window.location.href = link.url;
}

function renderFinanceQuickLinkPreview() {
    const { preview } = financeQuickLinkModalElements();
    if (!preview) return;

    preview.innerHTML = '';
    const nextCombo = getNextAvailableFinanceQuickLinkCombo(getUsedFinanceQuickLinkCombos(financeQuickLinks));

    const copy = document.createElement('div');
    copy.className = 'finance-quick-link-preview-copy';

    if (!nextCombo) {
        const title = document.createElement('p');
        title.className = 'finance-quick-link-preview-title';
        title.textContent = 'All 25 icon/color combinations are already used.';
        copy.appendChild(title);
        preview.appendChild(copy);
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const comboSwatch = document.createElement('div');
    comboSwatch.className = 'finance-quick-link-preview-swatch';
    applyFinanceQuickLinkStyles(comboSwatch, nextCombo);

    const comboIcon = document.createElement('i');
    comboIcon.setAttribute('data-lucide', nextCombo.icon);
    comboIcon.className = 'w-5 h-5';
    comboSwatch.appendChild(comboIcon);

    const title = document.createElement('p');
    title.className = 'finance-quick-link-preview-title';
    title.textContent = 'Next quick link style';

    const meta = document.createElement('p');
    meta.className = 'finance-quick-link-preview-meta';
    meta.textContent = `${nextCombo.icon.replace(/-/g, ' ')} + ${(FINANCE_QUICK_LINK_COLOR_MAP[nextCombo.color] || {}).label || nextCombo.color}`;

    copy.appendChild(title);
    copy.appendChild(meta);

    preview.appendChild(comboSwatch);
    preview.appendChild(copy);

    if (window.lucide) window.lucide.createIcons();
}

function scheduleFinanceQuickLinkScrollStateUpdate() {
    if (financeQuickLinkScrollFrame) cancelAnimationFrame(financeQuickLinkScrollFrame);
    financeQuickLinkScrollFrame = requestAnimationFrame(() => {
        financeQuickLinkScrollFrame = 0;
        updateFinanceQuickLinkScrollState();
    });
}

function updateFinanceQuickLinkScrollState() {
    const { list, scrollUpBtn, scrollDownBtn } = financeQuickLinksPanelElements();
    if (!list || !scrollUpBtn || !scrollDownBtn) return;

    const hasOverflow = list.scrollHeight - list.clientHeight > 6;
    scrollUpBtn.classList.toggle('hidden', !hasOverflow);
    scrollDownBtn.classList.toggle('hidden', !hasOverflow);

    if (!hasOverflow) return;

    const atTop = list.scrollTop <= 4;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;

    scrollUpBtn.disabled = atTop;
    scrollDownBtn.disabled = atBottom;
}

function renderFinanceQuickLinks() {
    const { list, count, addBtn } = financeQuickLinksPanelElements();
    if (!list) return;

    list.innerHTML = '';

    if (!financeQuickLinks.length) {
        const empty = document.createElement('div');
        empty.className = 'finance-quick-links-empty';

        const emptyTitle = document.createElement('p');
        emptyTitle.className = 'finance-quick-links-empty-title';
        emptyTitle.textContent = 'No quick links yet';

        const emptyBody = document.createElement('p');
        emptyBody.className = 'finance-quick-links-empty-body';
        emptyBody.textContent = 'Add finance shortcuts, dashboards, docs, or links back to other Life Manager pages.';

        empty.appendChild(emptyTitle);
        empty.appendChild(emptyBody);
        list.appendChild(empty);
    } else {
        financeQuickLinks.forEach((link) => {
            const combo = getFinanceQuickLinkCombo(link);
            const row = document.createElement('div');
            row.className = 'finance-quick-link-row';

            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'finance-quick-link-action';
            action.title = formatFinanceQuickLinkTooltip(link);
            applyFinanceQuickLinkStyles(action, combo);
            action.addEventListener('click', () => openFinanceQuickLink(link));

            const labelWrap = document.createElement('span');
            labelWrap.className = 'finance-quick-link-text';

            const label = document.createElement('span');
            label.className = 'finance-quick-link-label';
            label.textContent = getFinanceQuickLinkLabel(link);

            const iconWrap = document.createElement('span');
            iconWrap.className = 'finance-quick-link-icon';

            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', combo.icon);
            icon.className = 'w-4 h-4';

            labelWrap.appendChild(label);
            iconWrap.appendChild(icon);
            action.appendChild(labelWrap);
            action.appendChild(iconWrap);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'finance-quick-link-remove';
            removeBtn.title = 'Remove quick link';
            removeBtn.setAttribute('aria-label', `Remove ${getFinanceQuickLinkLabel(link)}`);
            applyFinanceQuickLinkStyles(removeBtn, combo);
            removeBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteFinanceQuickLink(link.id);
            });

            const removeIcon = document.createElement('i');
            removeIcon.setAttribute('data-lucide', 'x');
            removeIcon.className = 'w-3.5 h-3.5';
            removeBtn.appendChild(removeIcon);

            row.appendChild(removeBtn);
            row.appendChild(action);
            list.appendChild(row);
        });
    }

    if (count) {
        count.textContent = `${financeQuickLinks.length} / ${FINANCE_QUICK_LINK_MAX}`;
    }

    if (addBtn) {
        const atLimit = financeQuickLinks.length >= FINANCE_QUICK_LINK_MAX;
        addBtn.disabled = atLimit;
        addBtn.classList.toggle('is-disabled', atLimit);
        addBtn.title = atLimit ? 'Maximum of 25 quick links reached' : 'Add quick link';
    }

    renderFinanceQuickLinkPreview();
    scheduleFinanceQuickLinkScrollStateUpdate();

    if (window.lucide) window.lucide.createIcons();
}

async function syncFinanceQuickLinksFromDB(dbOverride = null) {
    const db = dbOverride || await getDB();
    const normalized = normalizeFinanceQuickLinks(db.quick_links);

    financeQuickLinks = normalized.links;
    renderFinanceQuickLinks();

    const needsSave = normalized.changed || Number(db.quick_links_last_modified || 0) !== normalized.lastModified;
    if (!needsSave) return financeQuickLinks;

    db.quick_links = normalized.links;
    db.quick_links_last_modified = normalized.lastModified;

    const savedDB = await saveDB(db);
    financeQuickLinks = normalizeFinanceQuickLinks(savedDB.quick_links).links;
    renderFinanceQuickLinks();
    return financeQuickLinks;
}

function openFinanceQuickLinks() {
    const { launcher, panel } = financeQuickLinksPanelElements();
    if (!launcher || !panel) return;
    financeQuickLinksOpen = true;
    launcher.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    scheduleFinanceQuickLinkScrollStateUpdate();
}

function closeFinanceQuickLinks() {
    const { launcher, panel } = financeQuickLinksPanelElements();
    if (!launcher || !panel) return;
    financeQuickLinksOpen = false;
    launcher.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
}

function toggleFinanceQuickLinks() {
    if (financeQuickLinksOpen) {
        closeFinanceQuickLinks();
        return;
    }
    openFinanceQuickLinks();
}

function scrollFinanceQuickLinks(direction) {
    const { list } = financeQuickLinksPanelElements();
    if (!list) return;
    const offset = direction >= 0 ? 104 : -104;
    list.scrollBy({
        top: offset,
        behavior: 'smooth'
    });
    setTimeout(updateFinanceQuickLinkScrollState, 180);
}

function openFinanceQuickLinkModal() {
    if (financeQuickLinks.length >= FINANCE_QUICK_LINK_MAX) {
        if (typeof showToast === 'function') showToast('Quick link limit reached (25 max)');
        return;
    }

    const { modal, labelInput, urlInput } = financeQuickLinkModalElements();
    if (!modal || !labelInput || !urlInput) return;

    labelInput.value = '';
    urlInput.value = '';
    renderFinanceQuickLinkPreview();
    modal.classList.remove('hidden');
    setTimeout(() => labelInput.focus(), 0);
}

function closeFinanceQuickLinkModal() {
    const { modal } = financeQuickLinkModalElements();
    if (!modal) return;
    modal.classList.add('hidden');
}

async function saveFinanceQuickLink() {
    if (financeQuickLinkSaveInFlight) return;

    const { labelInput, urlInput } = financeQuickLinkModalElements();
    if (!labelInput || !urlInput) return;

    const normalizedUrl = normalizeFinanceQuickLinkUrl(urlInput.value);
    if (!normalizedUrl) {
        if (typeof showToast === 'function') showToast('Please enter a valid link');
        return;
    }

    financeQuickLinkSaveInFlight = true;
    try {
        const db = await getDB();
        const normalized = normalizeFinanceQuickLinks(db.quick_links);
        const nextLinks = normalized.links.slice();

        if (nextLinks.length >= FINANCE_QUICK_LINK_MAX) {
            if (typeof showToast === 'function') showToast('Quick link limit reached (25 max)');
            closeFinanceQuickLinkModal();
            return;
        }

        const nextCombo = getNextAvailableFinanceQuickLinkCombo(getUsedFinanceQuickLinkCombos(nextLinks));
        if (!nextCombo) {
            if (typeof showToast === 'function') showToast('All 25 icon/color combinations are already in use');
            return;
        }

        const now = Date.now();
        nextLinks.push({
            id: `finance_quick_link_${now}_${Math.random().toString(36).slice(2, 7)}`,
            label: labelInput.value.trim(),
            url: normalizedUrl,
            icon: nextCombo.icon,
            color: nextCombo.color,
            createdAt: now,
            lastModified: now
        });

        db.quick_links = nextLinks;
        db.quick_links_last_modified = now;

        const savedDB = await saveDB(db);
        await syncFinanceQuickLinksFromDB(savedDB);
        closeFinanceQuickLinkModal();
        if (typeof showToast === 'function') showToast('Quick link added');
    } catch (error) {
        console.error('Failed to save finance quick link.', error);
        if (typeof showToast === 'function') showToast('Could not save quick link');
    } finally {
        financeQuickLinkSaveInFlight = false;
    }
}

async function deleteFinanceQuickLink(id) {
    const linkId = String(id || '').trim();
    if (!linkId) return;

    try {
        const db = await getDB();
        const normalized = normalizeFinanceQuickLinks(db.quick_links);
        const nextLinks = normalized.links.filter(link => link.id !== linkId);
        if (nextLinks.length === normalized.links.length) return;

        db.quick_links = nextLinks;
        db.quick_links_last_modified = Date.now();

        const savedDB = await saveDB(db);
        await syncFinanceQuickLinksFromDB(savedDB);
        if (typeof showToast === 'function') showToast('Quick link removed');
    } catch (error) {
        console.error('Failed to delete finance quick link.', error);
        if (typeof showToast === 'function') showToast('Could not remove quick link');
    }
}

function bindFinanceQuickLinksUI() {
    if (financeQuickLinksUiBound) return;
    financeQuickLinksUiBound = true;

    const { list } = financeQuickLinksPanelElements();
    const { modal, labelInput, urlInput } = financeQuickLinkModalElements();

    if (list) {
        list.addEventListener('scroll', updateFinanceQuickLinkScrollState);
    }

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeFinanceQuickLinkModal();
        });
    }

    [labelInput, urlInput].filter(Boolean).forEach((input) => {
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            saveFinanceQuickLink();
        });
    });

    document.addEventListener('click', (event) => {
        if (!financeQuickLinksOpen) return;

        const { launcher, panel } = financeQuickLinksPanelElements();
        const { modal: quickLinkModal } = financeQuickLinkModalElements();
        if (quickLinkModal && !quickLinkModal.classList.contains('hidden')) return;

        const clickedLauncher = launcher && launcher.contains(event.target);
        const clickedPanel = panel && panel.contains(event.target);
        if (!clickedLauncher && !clickedPanel) {
            closeFinanceQuickLinks();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        const { modal: quickLinkModal } = financeQuickLinkModalElements();
        if (quickLinkModal && !quickLinkModal.classList.contains('hidden')) {
            closeFinanceQuickLinkModal();
            return;
        }

        if (financeQuickLinksOpen) {
            closeFinanceQuickLinks();
        }
    });

    window.addEventListener('resize', scheduleFinanceQuickLinkScrollStateUpdate);
}

function initFinanceQuickLinks() {
    bindFinanceQuickLinksUI();
    renderFinanceQuickLinks();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFinanceQuickLinks, { once: true });
} else {
    initFinanceQuickLinks();
}

window.toggleFinanceQuickLinks = toggleFinanceQuickLinks;
window.openFinanceQuickLinkModal = openFinanceQuickLinkModal;
window.closeFinanceQuickLinkModal = closeFinanceQuickLinkModal;
window.saveFinanceQuickLink = saveFinanceQuickLink;
window.deleteFinanceQuickLink = deleteFinanceQuickLink;
window.scrollFinanceQuickLinks = scrollFinanceQuickLinks;
window.syncFinanceQuickLinksFromDB = syncFinanceQuickLinksFromDB;
