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
    const activeAssets = assetsList.filter(a => !a.deletedAt).sort((a, b) => b.value - a.value);

    if (activeAssets.length === 0) {
        listEL.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">No fixed assets tracked.</div>';
        return;
    }

    let html = '';
    const currency = 'PHP'; // Use standard format or extract if it exists
    const formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency });

    let totalDepreciation = 0;
    let totalValue = 0;
    let totalCurrentValue = 0;

    activeAssets.forEach(asset => {
        const isFullyDepreciated = checkForFullDepreciation(asset);
        const monthlyDepreciation = isFullyDepreciated ? 0 : calculateMonthlyDepreciation(asset);

        totalDepreciation += monthlyDepreciation;
        totalValue += asset.value;

        const accumulatedDepreciation = calculateAccumulatedDepreciation(asset);
        const currentValue = Math.max(0, asset.value - accumulatedDepreciation);
        totalCurrentValue += currentValue;

        const statusClass = currentValue <= 0 ? 'text-slate-400 line-through' : 'text-slate-700';

        html += `
            <div class="flex flex-col gap-1 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-colors group cursor-pointer" onclick="openAssetModal('${asset.id}')">
                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="font-bold text-sm ${statusClass}">${escapeHtml(asset.name)}</span>
                        <span class="text-[10px] text-slate-500">Orig: ${formatter.format(asset.value)} • ${asset.lifespan} mos</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="text-right">
                            <span class="font-bold text-sm text-rose-600 block">-${formatter.format(monthlyDepreciation)}/mo</span>
                            <span class="text-[10px] text-slate-400 block">${isFullyDepreciated ? 'Fully Depr.' : 'Depreciating'}</span>
                        </div>
                        <button onclick="event.stopPropagation(); deleteAsset('${asset.id}')" class="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-2">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-1 pt-2 border-t border-slate-200">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Net Book Value</span>
                    <span class="font-black text-sm text-indigo-600">${formatter.format(currentValue)}</span>
                </div>
            </div>
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
                    <p class="text-[10px] font-bold text-rose-600 uppercase">Monthly Depr.</p>
                    <p class="font-black text-rose-800 text-sm">-${formatter.format(totalDepreciation)}/mo</p>
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
