'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const backupContract = require('../assets/js/core/backup-contract.js');
const toolsPresentation = require('../assets/js/ui/tools-presentation.js');

const financeRoot = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(financeRoot, relativePath), 'utf8');

let ivCounter = 0;

async function encryptJson(key, value) {
    ivCounter += 1;
    const iv = new Uint8Array(12);
    iv[11] = ivCounter % 255;
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const content = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return { iv: Array.from(iv), content: Array.from(new Uint8Array(content)) };
}

async function encryptImageRecord(key, imageRef, dataUrl) {
    ivCounter += 1;
    const iv = new Uint8Array(12);
    iv[10] = Math.floor(ivCounter / 255);
    iv[11] = ivCounter % 255;
    const content = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(dataUrl)
    );
    return {
        key: imageRef,
        version: 1,
        mimeType: 'image/png',
        originalSize: dataUrl.length,
        ivB64: Buffer.from(iv).toString('base64'),
        contentB64: Buffer.from(new Uint8Array(content)).toString('base64'),
        deletedAt: null,
        updatedAt: '2026-08-01T08:00:00.000Z'
    };
}

async function decryptJson(key, envelope) {
    const plaintext = await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(envelope.iv) },
        key,
        new Uint8Array(envelope.content)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
}

async function decryptImageRecord(key, record) {
    const plaintext = await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Buffer.from(record.ivB64, 'base64') },
        key,
        Buffer.from(record.contentB64, 'base64')
    );
    return new TextDecoder().decode(plaintext);
}

async function makeSyntheticVault() {
    const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const emptyEncryptedCollections = Object.fromEntries(
        backupContract.ENCRYPTED_COLLECTIONS.map(name => [name, []])
    );
    const transactionEnvelope = await encryptJson(key, {
        desc: 'Synthetic salary',
        type: 'income',
        category: 'Salary',
        amt: 5000,
        date: '2026-08-01'
    });
    const cardEnvelope = await encryptJson(key, {
        name: 'Fixture card',
        balance: 1200,
        limit: 10000
    });
    const planEnvelope = await encryptJson(key, {
        name: 'Fixture installment',
        imageRef: 'ipimg_fixture_plan',
        remainingBalance: 900
    });
    const db = {
        schema_version: 6,
        ...emptyEncryptedCollections,
        transactions: [{ id: 'tx-fixture', data: transactionEnvelope, deletedAt: null }],
        credit_cards: [{ id: 'card-fixture', data: cardEnvelope, deletedAt: null }],
        installment_plans: [{ id: 'plan-fixture', data: planEnvelope, deletedAt: null }],
        budgets: { data: await encryptJson(key, { Food: 1000 }) },
        vault_probe: await encryptJson(key, { marker: 'finance-flow-vault-probe-v1' }),
        custom_categories: ['Food'],
        sync: {
            revision: 'rev-fixture',
            lastKnownRemoteRevision: 'rev-fixture',
            conflictStrategy: 'merge_safe_lists',
            updatedAt: '2026-08-01T08:00:00.000Z'
        }
    };
    const installmentImages = [await encryptImageRecord(
        key,
        'ipimg_fixture_plan',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
    )];
    return { key, db, installmentImages };
}

async function makePackage() {
    const fixture = await makeSyntheticVault();
    const backup = await backupContract.createFinanceBackupPackage({
        db: fixture.db,
        installmentImages: fixture.installmentImages,
        metadata: { budgetCategoryCount: 1 }
    }, {
        appVersion: '4.1',
        backupDate: '2026-08-01T08:00:00.000Z',
        cryptoProvider: webcrypto
    });
    return { ...fixture, backup };
}

test('canonical backup hashing is deterministic across object key order', async () => {
    const left = { z: 1, nested: { b: 2, a: 3 }, rows: [{ y: 4, x: 5 }] };
    const right = { rows: [{ x: 5, y: 4 }], nested: { a: 3, b: 2 }, z: 1 };

    assert.equal(backupContract.stableStringify(left), backupContract.stableStringify(right));
    assert.equal(
        await backupContract.computeFinanceBackupHash(left, { cryptoProvider: webcrypto }),
        await backupContract.computeFinanceBackupHash(right, { cryptoProvider: webcrypto })
    );
});

test('synthetic encrypted vault and attachment round-trip without plaintext conversion', async () => {
    const { backup, db, installmentImages, key } = await makePackage();
    const before = structuredClone({ db, installmentImages });
    const validation = await backupContract.validateFinanceBackupPackage(backup, {
        maxSchemaVersion: 6,
        cryptoProvider: webcrypto
    });
    const plan = backupContract.createFinanceRestorePlan(backup, validation);

    assert.equal(validation.ok, true, validation.issues.join('\n'));
    assert.equal(validation.stats.creditCards, 1);
    assert.equal(validation.stats.installmentImages, 1);
    assert.deepEqual(plan.data.transactions[0].data, db.transactions[0].data);
    assert.equal(plan.installmentImages[0].contentB64, installmentImages[0].contentB64);
    assert.equal((await decryptJson(key, plan.data.transactions[0].data)).desc, 'Synthetic salary');
    assert.match(await decryptImageRecord(key, plan.installmentImages[0]), /^data:image\/png;base64,/);
    assert.equal(Object.isFrozen(plan), true);
    assert.deepEqual({ db, installmentImages }, before);
    assert.equal(JSON.stringify(backup).includes('Synthetic salary'), false);
});

test('restore authenticates every encrypted record and attachment with the active vault key', async () => {
    const { backup, key } = await makePackage();
    const correct = await backupContract.verifyFinanceBackupDecryptability(backup, {
        decryptPayload: envelope => decryptJson(key, envelope),
        decryptAttachment: record => decryptImageRecord(key, record)
    });
    const wrongKey = await webcrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
    const wrong = await backupContract.verifyFinanceBackupDecryptability(backup, {
        decryptPayload: envelope => decryptJson(wrongKey, envelope),
        decryptAttachment: record => decryptImageRecord(wrongKey, record)
    });

    assert.equal(correct.ok, true, correct.issues.join('\n'));
    assert.equal(correct.encryptedRecordCount, 5);
    assert.equal(correct.attachmentCount, 1);
    assert.equal(wrong.ok, false);
    assert.equal(wrong.issues.length, 6);
    assert.match(wrong.issues[0], /with this vault key/);
});

test('legacy Finance backup hashes remain verifiable while upgrading is recommended', async () => {
    const { backup } = await makePackage();
    const legacy = structuredClone(backup);
    delete legacy.backupFormatVersion;
    delete legacy.backupContractVersion;
    delete legacy.integrity.serialization;
    legacy.integrity.hash = await backupContract.computeFinanceBackupHash(legacy.data, {
        serialization: backupContract.LEGACY_SERIALIZATION,
        cryptoProvider: webcrypto
    });
    legacy.integrity.attachmentsHash = await backupContract.computeFinanceBackupHash(legacy.attachments, {
        serialization: backupContract.LEGACY_SERIALIZATION,
        cryptoProvider: webcrypto
    });

    const validation = await backupContract.validateFinanceBackupPackage(legacy, {
        maxSchemaVersion: 6,
        cryptoProvider: webcrypto
    });

    assert.equal(validation.ok, true, validation.issues.join('\n'));
    assert.match(validation.warnings.join(' '), /Legacy JSON hash format verified/);
});

test('corrupted encrypted vault data and attachments fail closed', async () => {
    const { backup } = await makePackage();
    const corruptData = structuredClone(backup);
    corruptData.data.transactions[0].data.content[0] ^= 1;
    const corruptAttachment = structuredClone(backup);
    corruptAttachment.attachments.installmentImages[0].contentB64 =
        `A${corruptAttachment.attachments.installmentImages[0].contentB64.slice(1)}`;

    const [dataValidation, attachmentValidation] = await Promise.all([
        backupContract.validateFinanceBackupPackage(corruptData, { maxSchemaVersion: 6, cryptoProvider: webcrypto }),
        backupContract.validateFinanceBackupPackage(corruptAttachment, { maxSchemaVersion: 6, cryptoProvider: webcrypto })
    ]);

    assert.equal(dataValidation.ok, false);
    assert.match(dataValidation.issues.join(' '), /Data integrity hash mismatch/);
    assert.equal(attachmentValidation.ok, false);
    assert.match(attachmentValidation.issues.join(' '), /Attachment integrity hash mismatch/);
});

test('missing integrity, future schemas, Preview payloads, bad card envelopes, and duplicate images are rejected', async () => {
    const { backup } = await makePackage();
    const missingIntegrity = structuredClone(backup);
    delete missingIntegrity.integrity;
    const futureSchema = structuredClone(backup);
    futureSchema.schemaVersion = 7;
    futureSchema.data.schema_version = 7;
    const previewPayload = structuredClone(backup);
    previewPayload.data.transactions[0].data = { __previewPlain: true, value: { desc: 'plaintext' } };
    const badCard = structuredClone(backup);
    badCard.data.credit_cards[0].data.iv = [1, 2, 3];
    const duplicateImage = structuredClone(backup);
    duplicateImage.attachments.installmentImages.push(structuredClone(duplicateImage.attachments.installmentImages[0]));

    const validations = await Promise.all([
        missingIntegrity,
        futureSchema,
        previewPayload,
        badCard,
        duplicateImage
    ].map(value => backupContract.validateFinanceBackupPackage(value, {
        maxSchemaVersion: 6,
        cryptoProvider: webcrypto
    })));

    assert.match(validations[0].issues.join(' '), /Missing integrity block/);
    assert.match(validations[1].issues.join(' '), /newer than supported/);
    assert.match(validations[2].issues.join(' '), /Preview Mode plaintext/);
    assert.match(validations[3].issues.join(' '), /credit_cards\[0\]/);
    assert.match(validations[4].issues.join(' '), /duplicates attachment key/);
    validations.forEach(validation => assert.equal(validation.ok, false));
});

test('Preview Mode data cannot be packaged as an encrypted recovery backup', async () => {
    const fixture = await makeSyntheticVault();
    fixture.db.transactions[0].data = { __previewPlain: true, value: { desc: 'demo' } };

    await assert.rejects(
        backupContract.createFinanceBackupPackage({ db: fixture.db }, { cryptoProvider: webcrypto }),
        /Preview Mode data cannot be packaged/
    );
});

test('restore transaction commits database and attachments before remote sync', async () => {
    const { backup } = await makePackage();
    const validation = await backupContract.validateFinanceBackupPackage(backup, {
        maxSchemaVersion: 6,
        cryptoProvider: webcrypto
    });
    const plan = backupContract.createFinanceRestorePlan(backup, validation);
    const original = { db: { marker: 'old-db' }, attachments: [{ key: 'old-image' }] };
    const state = structuredClone(original);
    const sequence = [];

    const result = await backupContract.executeFinanceRestoreTransaction(plan, {
        readDB: async () => state.db,
        readAttachments: async () => state.attachments,
        writeDB: async data => { sequence.push('write-db'); state.db = data; },
        replaceAttachments: async records => { sequence.push('write-images'); state.attachments = records; },
        reload: async () => { sequence.push('reload'); },
        rollbackDB: async data => { state.db = data; },
        rollbackAttachments: async records => { state.attachments = records; },
        queueRemote: async () => { sequence.push('queue-remote'); }
    });

    assert.equal(result.restored, true);
    assert.equal(result.remoteQueued, true);
    assert.deepEqual(sequence, ['write-db', 'write-images', 'reload', 'queue-remote']);
    assert.deepEqual(state.db, plan.data);
    assert.deepEqual(state.attachments, plan.installmentImages);
    assert.notDeepEqual(state, original);
});

test('attachment-stage failure restores the prior local database and attachment snapshot', async () => {
    const { backup } = await makePackage();
    const validation = await backupContract.validateFinanceBackupPackage(backup, {
        maxSchemaVersion: 6,
        cryptoProvider: webcrypto
    });
    const plan = backupContract.createFinanceRestorePlan(backup, validation);
    const original = { db: { marker: 'old-db' }, attachments: [{ key: 'old-image' }] };
    const state = structuredClone(original);
    let reloadCount = 0;

    await assert.rejects(
        backupContract.executeFinanceRestoreTransaction(plan, {
            readDB: async () => state.db,
            readAttachments: async () => state.attachments,
            writeDB: async data => { state.db = data; },
            replaceAttachments: async () => { throw new Error('simulated attachment write failure'); },
            reload: async () => { reloadCount += 1; },
            rollbackDB: async data => { state.db = data; },
            rollbackAttachments: async records => { state.attachments = records; },
            queueRemote: async () => { throw new Error('must not run'); }
        }),
        error => {
            assert.equal(error.name, 'FinanceRestoreError');
            assert.match(error.message, /simulated attachment write failure/);
            assert.deepEqual(error.rollbackIssues, []);
            return true;
        }
    );

    assert.deepEqual(state, original);
    assert.equal(reloadCount, 1);
});

test('cloud queue failure leaves the completed local restore intact and visible as pending', async () => {
    const { backup } = await makePackage();
    const validation = await backupContract.validateFinanceBackupPackage(backup, {
        maxSchemaVersion: 6,
        cryptoProvider: webcrypto
    });
    const plan = backupContract.createFinanceRestorePlan(backup, validation);
    const state = { db: { marker: 'old' }, attachments: [] };

    const result = await backupContract.executeFinanceRestoreTransaction(plan, {
        readDB: async () => state.db,
        readAttachments: async () => state.attachments,
        writeDB: async data => { state.db = data; },
        replaceAttachments: async records => { state.attachments = records; },
        reload: async () => {},
        rollbackDB: async () => { throw new Error('must not roll back'); },
        rollbackAttachments: async () => { throw new Error('must not roll back'); },
        queueRemote: async () => { throw new Error('offline'); }
    });

    assert.equal(result.restored, true);
    assert.equal(result.remoteQueued, false);
    assert.equal(result.remoteQueueError, 'offline');
    assert.deepEqual(state.db, plan.data);
    assert.deepEqual(state.attachments, plan.installmentImages);
});

test('cloud retry delay is bounded exponential backoff', () => {
    assert.deepEqual(
        [1, 2, 3, 4, 5, 6, 7, 8].map(attempt => backupContract.getFinanceSyncRetryDelay(attempt)),
        [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]
    );
    assert.equal(
        backupContract.getFinanceSyncRetryDelay(3, { jitterRatio: 0.15, random: () => 0.5 }),
        4000
    );
});

test('Tools distinguishes an automatic cloud retry from an unscheduled pending upload', () => {
    const result = toolsPresentation.buildFinanceToolsPresentation({
        previewMode: false,
        unlocked: true,
        backupSettings: {},
        storageDiagnostics: {},
        cloud: {
            sessionEnabled: true,
            pendingChanges: true,
            retryScheduled: true,
            nextRetryAt: '2026-08-01T08:00:10.000Z'
        }
    }, { now: '2026-08-01T08:00:00.000Z' });
    const cloud = result.statuses.find(item => item.id === 'cloud');

    assert.equal(cloud.value, 'Retry scheduled');
    assert.match(cloud.detail, /encrypted local copy is safe/i);
    assert.equal(cloud.tone, 'attention');
});

test('browser runtime wires the contract before storage and uses staged local-only restore', () => {
    const html = read('index.html');
    const backup = read('assets/js/features/backup.js');
    const storage = read('assets/js/core/storage.js');
    const auth = read('assets/js/core/auth.js');
    const contractIndex = html.indexOf('assets/js/core/backup-contract.js');
    const storageIndex = html.indexOf('assets/js/core/storage.js');
    const backupIndex = html.indexOf('assets/js/features/backup.js');

    assert.ok(contractIndex > 0 && storageIndex > contractIndex && backupIndex > storageIndex);
    assert.match(backup, /createFinanceBackupPackage/);
    assert.match(backup, /validateFinanceBackupPackage/);
    assert.match(backup, /verifyFinanceBackupDecryptability/);
    assert.match(backup, /executeFinanceRestoreTransaction/);
    assert.match(backup, /queueRemote: false/);
    assert.match(backup, /requireDurableWrite: true/);
    assert.match(backup, /exactReplace: true/);
    assert.match(storage, /replaceInstallmentImageRecordsInIndexedDB/);
    assert.match(storage, /db\.transaction\(INSTALLMENT_IMAGE_STORE, 'readwrite'\)/);
    assert.match(storage, /recordRemoteSyncFailure\(\)/);
    assert.match(storage, /scheduleRemoteSyncRetry\(\)/);
    assert.match(storage, /pendingAttachmentCount/);
    assert.match(auth, /allowRemote = true, queueRemote = true/);
    assert.match(auth, /getDB\(\{ forceRemote, allowRemote \}\)/);
});
