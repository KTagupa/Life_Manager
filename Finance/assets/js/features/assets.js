/**
 * assets.js
 * Handles Fixed Assets & Capital Expenditures (CapEx) logic
 */

function generateAssetId() {
    return 'asset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function openAssetModal(assetId = null) {
    document.getElementById('a-id').value = '';
    document.getElementById('a-name').value = '';
    document.getElementById('a-value').value = '';
    document.getElementById('a-lifespan').value = '36';
    document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('a-modal-title').innerText = 'Add Fixed Asset';

    if (assetId) {
        const db = await getDB();
        const asset = (db.fixed_assets || []).find(a => a.id === assetId && !a.deletedAt);
        if (asset) {
            document.getElementById('a-id').value = asset.id;
            document.getElementById('a-name').value = asset.name;
            document.getElementById('a-value').value = asset.value;
            document.getElementById('a-lifespan').value = asset.lifespan;
            document.getElementById('a-date').value = asset.purchaseDate;
            document.getElementById('a-modal-title').innerText = 'Edit Fixed Asset';
        }
    }

    toggleModal('asset-modal');
}

async function saveAsset() {
    const id = document.getElementById('a-id').value;
    const name = document.getElementById('a-name').value.trim();
    const value = parseFloat(document.getElementById('a-value').value);
    const lifespan = parseInt(document.getElementById('a-lifespan').value, 10);
    const date = document.getElementById('a-date').value;

    if (!name || isNaN(value) || value <= 0 || isNaN(lifespan) || lifespan <= 0 || !date) {
        if (typeof showToast === 'function') showToast('Please enter valid asset details (value and lifespan must be positive).');
        return;
    }

    const db = await getDB();
    const isEditing = !!id;
    const assetId = isEditing ? id : generateAssetId();

    const assetObj = {
        id: assetId,
        name: name,
        value: value,
        lifespan: lifespan,
        purchaseDate: date,
        createdAt: isEditing ? undefined : new Date().toISOString(),
        lastModified: Date.now(),
        deletedAt: null
    };

    db.fixed_assets = db.fixed_assets || [];

    if (isEditing) {
        const idx = db.fixed_assets.findIndex(a => a.id === id);
        if (idx !== -1) {
            assetObj.createdAt = db.fixed_assets[idx].createdAt; // Keep original created at
            db.fixed_assets[idx] = assetObj;
        } else {
            assetObj.createdAt = new Date().toISOString();
            db.fixed_assets.push(assetObj);
        }
    } else {
        db.fixed_assets.push(assetObj);
    }

    await saveDB(db);
    toggleModal('asset-modal');
    renderAssets();

    if (typeof refreshStorageDiagnosticsPanel === 'function') refreshStorageDiagnosticsPanel();
    if (typeof showToast === 'function') showToast(isEditing ? 'Asset updated' : 'Asset added');
}

async function deleteAsset(id) {
    if (!confirm('Are you sure you want to remove this asset?')) return;

    const db = await getDB();
    const idx = (db.fixed_assets || []).findIndex(a => a.id === id);
    if (idx !== -1) {
        db.fixed_assets[idx].deletedAt = new Date().toISOString();
        db.fixed_assets[idx].lastModified = Date.now();
        await saveDB(db);
        renderAssets();
        if (typeof showToast === 'function') showToast('Asset removed');
    }
}

function calculateMonthlyDepreciation(asset) {
    if (!asset || asset.lifespan <= 0) return 0;
    return asset.value / asset.lifespan;
}

function calculateAccumulatedDepreciation(asset) {
    if (!asset || !asset.purchaseDate || asset.lifespan <= 0) return 0;
    const purchaseDate = new Date(asset.purchaseDate);
    const currentDate = new Date();

    let monthsDiff = (currentDate.getFullYear() - purchaseDate.getFullYear()) * 12 + (currentDate.getMonth() - purchaseDate.getMonth());
    monthsDiff = Math.max(0, monthsDiff); // Prevent negative if future date
    if (monthsDiff > asset.lifespan) {
        monthsDiff = asset.lifespan;
    }

    const monthlyDepreciation = asset.value / asset.lifespan;
    return monthsDiff * monthlyDepreciation;
}

function checkForFullDepreciation(asset) {
    if (!asset || !asset.purchaseDate) return false;
    const purchaseDate = new Date(asset.purchaseDate);
    const currentDate = new Date();

    const monthsDiff = (currentDate.getFullYear() - purchaseDate.getFullYear()) * 12 + (currentDate.getMonth() - purchaseDate.getMonth());

    return monthsDiff > asset.lifespan;
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function renderAssets() {
    const listEL = document.getElementById('assets-list');
    if (!listEL) return;

    const db = await getDB();
    const assetsList = db.fixed_assets || [];
    window.allFinanceFixedAssets = assetsList.map(asset => ({ ...asset }));
    if (typeof scheduleFinanceSnapshotShadowRefresh === 'function') {
        scheduleFinanceSnapshotShadowRefresh();
    }
    const activeAssets = assetsList.filter(a => !a.deletedAt).sort((a, b) => b.value - a.value);

    if (activeAssets.length === 0) {
        listEL.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">No fixed assets tracked.</div>';
        return;
    }

    let html = '';
    const currency = 'PHP';
    const formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency });
    const canonicalBook = typeof computeFinanceFixedAssetBookValue === 'function'
        ? computeFinanceFixedAssetBookValue(activeAssets, Date.now())
        : null;
    const canonicalById = new Map((canonicalBook?.assets || []).map(position => [String(position.id), position]));
    const totalValue = canonicalBook?.acquisitionCost ?? activeAssets.reduce((sum, asset) => sum + Math.max(0, Number(asset.value || 0)), 0);
    const totalAccumulatedDepreciation = canonicalBook?.accumulatedDepreciation
        ?? activeAssets.reduce((sum, asset) => sum + calculateAccumulatedDepreciation(asset), 0);
    const totalCurrentValue = canonicalBook?.netBookValue ?? Math.max(0, totalValue - totalAccumulatedDepreciation);

    activeAssets.forEach(asset => {
        const position = canonicalById.get(String(asset.id));
        const currentValue = position?.netBookValue;
        const monthlyDepreciation = position?.netBookValue > 0 ? position.monthlyDepreciation : 0;
        const isFullyDepreciated = !!position && position.elapsedMonths >= position.lifespanMonths;
        const needsReview = !position;
        const statusClass = currentValue === 0 ? 'text-slate-400 line-through' : 'text-slate-700';
        const safeAssetName = escapeHtml(asset.name || 'Fixed asset');
        const safeAssetNameAttr = String(asset.name || 'Fixed asset')
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const encodedAssetId = typeof encodeInlineArg === 'function'
            ? encodeInlineArg(asset.id)
            : encodeURIComponent(String(asset.id || '')).replace(/'/g, '%27');

        html += `
            <article class="finance-wealth-list-row flex flex-col gap-1 p-3 bg-slate-50 border border-slate-100 rounded-xl transition-colors group">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex flex-col min-w-0">
                        <span class="font-bold text-sm ${statusClass}">${safeAssetName}</span>
                        <span class="text-[10px] text-slate-500">Cost: ${formatter.format(Number(asset.value || 0))} • ${Number(asset.lifespan || 0)} months</span>
                        <span class="text-[10px] ${needsReview ? 'text-amber-600' : 'text-slate-400'}">${needsReview ? 'Needs purchase date or value review' : (isFullyDepreciated ? 'Fully depreciated' : `${formatter.format(monthlyDepreciation)} monthly depreciation`)}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button type="button" onclick="openAssetModal(decodeURIComponent('${encodedAssetId}'))"
                            aria-label="Edit ${safeAssetNameAttr}"
                            class="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200">Edit</button>
                        <button type="button" onclick="deleteAsset(decodeURIComponent('${encodedAssetId}'))"
                            aria-label="Delete ${safeAssetNameAttr}"
                            class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-1 pt-2 border-t border-slate-200">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Net Book Value</span>
                    <span class="font-black text-sm ${needsReview ? 'text-amber-600' : 'text-indigo-600'}">${needsReview ? 'n/a' : formatter.format(currentValue)}</span>
                </div>
            </article>
        `;
    });

    html = `
        <div class="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <div class="flex justify-between items-center mb-2 pb-2 border-b border-blue-200/50">
                <div>
                    <p class="text-[10px] font-bold text-blue-600 uppercase">Total CapEx</p>
                    <p class="font-black text-blue-800 text-sm">${formatter.format(totalValue)}</p>
                </div>
                <div class="text-right">
                    <p class="text-[10px] font-bold text-rose-600 uppercase">Accumulated Depr.</p>
                    <p class="font-black text-rose-800 text-sm">-${formatter.format(totalAccumulatedDepreciation)}</p>
                </div>
            </div>
            <div class="flex justify-between items-center">
                <p class="text-[10px] font-bold text-indigo-600 uppercase">Total Net Book Value</p>
                <p class="font-black text-indigo-800 text-sm">${formatter.format(totalCurrentValue)}</p>
            </div>
        </div>
        <div class="space-y-2">
            ${html}
        </div>
    `;

    listEL.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Attach to global window scope so that HTML buttons can trigger them
window.openAssetModal = openAssetModal;
window.saveAsset = saveAsset;
window.deleteAsset = deleteAsset;
window.renderAssets = renderAssets;
