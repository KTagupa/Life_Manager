/**
 * agm.js - Annual General Meeting & Strategic Planning
 */

function generateAGMRecordId() {
    return 'agm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function initAGMYears() {
    const yearSelect = document.getElementById('agm-year');
    if (!yearSelect) return;

    // Determine bounds (e.g., 2020 to current + 5)
    yearSelect.innerHTML = '';
    const currentYear = new Date().getFullYear();
    const startYear = Math.min(2023, currentYear - 3);
    const endYear = currentYear + 5;

    for (let y = startYear; y <= endYear; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

async function loadAGMData() {
    const yearSelect = document.getElementById('agm-year');
    if (!yearSelect) return;

    const year = parseInt(yearSelect.value, 10);
    const db = await getDB();

    const record = (db.agm_records || []).find(r => r.year === year && !r.deletedAt);

    if (record) {
        document.getElementById('agm-phase').value = record.phase || 'Growth';
        document.getElementById('agm-goal-1').value = record.goals?.[0] || '';
        document.getElementById('agm-goal-2').value = record.goals?.[1] || '';
        document.getElementById('agm-goal-3').value = record.goals?.[2] || '';
        document.getElementById('agm-notes').value = record.notes || '';
    } else {
        // Reset to defaults
        document.getElementById('agm-phase').value = 'Growth';
        document.getElementById('agm-goal-1').value = '';
        document.getElementById('agm-goal-2').value = '';
        document.getElementById('agm-goal-3').value = '';
        document.getElementById('agm-notes').value = '';
    }
}

async function openAGMModal() {
    initAGMYears();
    await loadAGMData();
    toggleModal('agm-modal');
}

async function saveAGMData() {
    const year = parseInt(document.getElementById('agm-year').value, 10);
    const phase = document.getElementById('agm-phase').value;
    const goal1 = document.getElementById('agm-goal-1').value.trim();
    const goal2 = document.getElementById('agm-goal-2').value.trim();
    const goal3 = document.getElementById('agm-goal-3').value.trim();
    const notes = document.getElementById('agm-notes').value.trim();

    const db = await getDB();
    db.agm_records = db.agm_records || [];

    const existingIndex = db.agm_records.findIndex(r => r.year === year && !r.deletedAt);

    const newRecord = {
        id: generateAGMRecordId(),
        year: year,
        phase: phase,
        goals: [goal1, goal2, goal3],
        notes: notes,
        createdAt: new Date().toISOString(),
        lastModified: Date.now(),
        deletedAt: null
    };

    if (existingIndex !== -1) {
        newRecord.id = db.agm_records[existingIndex].id;
        newRecord.createdAt = db.agm_records[existingIndex].createdAt;
        db.agm_records[existingIndex] = newRecord;
    } else {
        db.agm_records.push(newRecord);
    }

    await saveDB(db);
    toggleModal('agm-modal');

    if (typeof refreshStorageDiagnosticsPanel === 'function') refreshStorageDiagnosticsPanel();
    if (typeof showToast === 'function') showToast('Strategy saved for ' + year);
}

// Make globally accessible
window.openAGMModal = openAGMModal;
window.loadAGMData = loadAGMData;
window.saveAGMData = saveAGMData;
