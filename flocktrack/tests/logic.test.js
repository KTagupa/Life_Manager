const assert = require("node:assert/strict");
const {
  STATUS_DATE_FIELDS,
  INCUBATION_SCHEDULE,
  nextCode,
  eggCode,
  outsiderTagCode,
  parseOutsiderTagCode,
  normalizeTagId,
  resolveBatchIncubationDates,
  getBirdPenAtDate,
  buildBirdPenUpdate,
  estimatePenFeedLog,
  buildBatchIncubationProfile,
  buildAutomaticHatchReminders,
  buildAutomaticIncubationReminders,
  stageSuggestion,
  retentionDaysForStatus,
  buildRetentionSnapshot,
  buildBirdSaleFinanceRows,
  buildFinanceLedger,
  buildFeedExpenseMetrics,
  filterFinanceRowsByMonth,
  summarizeFinanceRows,
  rollupFinanceCategories,
  normalizeBackupPayload,
  completeReminderAndScheduleNext
} = require("../src/core/logic.shared.js");

function isoDaysAgo(days, nowMs = Date.now()) {
  return new Date(nowMs - days * 86400000).toISOString().slice(0, 10);
}

function run() {
  assert.equal(nextCode([{
    code: "B001"
  }, {
    code: "B009"
  }, {
    code: "B010"
  }]), "B011");
  assert.equal(eggCode("B007", 2), "C-B007-003");
  assert.equal(outsiderTagCode(4, 12), "OB004-012");
  assert.deepEqual(parseOutsiderTagCode("ob004-012"), {
    batchNo: 4,
    indivNo: 12
  });
  assert.equal(parseOutsiderTagCode("C-B001-001"), null);
  assert.equal(normalizeTagId(101), "101");
  assert.equal(parseOutsiderTagCode(40012), null);

  const nowMs = Date.now();
  assert.equal(stageSuggestion({
    hatchDate: isoDaysAgo(60, nowMs),
    sex: "female",
    breed: "native",
    status: "active"
  }).stage, "pullet");
  assert.equal(stageSuggestion({
    hatchDate: isoDaysAgo(45, nowMs),
    sex: "male",
    breed: "broiler",
    status: "active"
  }).stage, "broiler");
  assert.equal(stageSuggestion({
    hatchDate: isoDaysAgo(80, nowMs),
    sex: "male",
    breed: "broiler",
    status: "active"
  }).stage, "rooster");

  assert.equal(retentionDaysForStatus("sold"), 90);
  assert.equal(retentionDaysForStatus("culled"), 30);
  assert.equal(retentionDaysForStatus("active"), null);
  assert.equal(STATUS_DATE_FIELDS.sold, "soldDate");
  assert.equal(INCUBATION_SCHEDULE.length, 4);

  const incubationDates = resolveBatchIncubationDates({
    collectedDate: "2026-03-01",
    incubationStartDate: "2026-03-03"
  });
  assert.equal(incubationDates.incubationStartDate, "2026-03-03");
  assert.equal(incubationDates.expectedHatchDate, "2026-03-24");

  const incubationProfile = buildBatchIncubationProfile({
    id: "batch-1",
    code: "B001",
    collectedDate: "2026-03-01",
    incubationStartDate: "2026-03-03"
  }, {
    nowMs: new Date("2026-03-16T05:00:00.000Z").getTime()
  });
  assert.equal(incubationProfile.dayNumber, 14);
  assert.equal(incubationProfile.currentStage.id, "organ_development");
  assert.equal(incubationProfile.currentStage.humidity, "45-50% RH");
  assert.equal(incubationProfile.nextCheckpointTitle, "Day 15 humidity adjustment");
  assert.equal(incubationProfile.nextCheckpointDay, "2026-03-17");
  assert.equal(incubationProfile.expectedHatchDate, "2026-03-24");

  const snapshot = buildRetentionSnapshot({
    nowMs: new Date("2026-03-06T00:00:00.000Z").getTime(),
    birds: [{
      id: "bird-1",
      tagId: "OB001-001",
      status: "sold",
      archivedAt: "2025-10-01T00:00:00.000Z"
    }, {
      id: "bird-2",
      tagId: "OB001-002",
      status: "deceased",
      archivedAt: "2026-02-20T00:00:00.000Z"
    }],
    photos: [{
      id: "photo-1",
      birdId: "bird-1",
      dataUrl: "data:image/jpeg;base64,AAAA",
      sizeKb: 12,
      takenAt: "2025-09-25T00:00:00.000Z"
    }, {
      id: "photo-2",
      birdId: "bird-2",
      dataUrl: "data:image/jpeg;base64,BBBB",
      sizeKb: 10,
      takenAt: "2026-02-19T00:00:00.000Z"
    }, {
      id: "photo-3",
      birdId: "bird-1",
      dataUrl: "",
      sizeKb: 0,
      takenAt: "2025-09-20T00:00:00.000Z"
    }]
  });
  assert.equal(snapshot.archivedPhotos, 3);
  assert.equal(snapshot.archivedPhotosWithImage, 2);
  assert.equal(snapshot.eligible.length, 1);
  assert.equal(snapshot.eligible[0].photo.id, "photo-1");
  assert.equal(snapshot.eligible[0].bird.id, "bird-1");

  const normalizedBackup = normalizeBackupPayload({
    stores: {
      birds: [{
        id: "bird-1"
      }],
      measurements: [{
        id: "measurement-1"
      }],
      financeEntries: [{
        id: "finance-1"
      }]
    }
  }, ["birds", "measurements", "eggBatches", "financeEntries"]);
  assert.equal(normalizedBackup.total, 3);
  assert.deepEqual(normalizedBackup.normalized.eggBatches, []);
  assert.deepEqual(normalizedBackup.normalized.financeEntries, [{
    id: "finance-1"
  }]);
  assert.throws(() => normalizeBackupPayload({
    foo: []
  }, ["birds"]), /recognized store data/i);

  const birdSaleRows = buildBirdSaleFinanceRows({
    birds: [{
      id: "bird-1",
      tagId: "OB001-010",
      status: "sold",
      salePrice: "1200",
      soldDate: "2026-03-05",
      buyerName: "Buyer A",
      createdAt: "2026-02-01T00:00:00.000Z"
    }, {
      id: "bird-2",
      nickname: "Ruby",
      tagId: "TAG-2",
      status: "sold",
      salePrice: 950,
      updatedAt: "2026-02-28T05:00:00.000Z",
      createdAt: "2026-02-10T00:00:00.000Z"
    }, {
      id: "bird-3",
      tagId: "TAG-3",
      status: "sold",
      salePrice: "bad-data",
      soldDate: "2026-03-03"
    }]
  });
  assert.equal(birdSaleRows.length, 2);
  assert.equal(birdSaleRows[0].date, "2026-03-05");
  assert.equal(birdSaleRows[0].category, "bird_sale");
  assert.equal(birdSaleRows[0].notes, "Buyer: Buyer A");
  assert.equal(birdSaleRows[1].date, "2026-02-28");
  assert.equal(birdSaleRows[1].description, "Ruby (TAG-2) sold");

  const financeLedger = buildFinanceLedger({
    birds: [{
      id: "bird-1",
      tagId: "OB001-010",
      status: "sold",
      salePrice: 1200,
      soldDate: "2026-03-05"
    }, {
      id: "bird-2",
      tagId: "TAG-2",
      status: "sold",
      salePrice: 950,
      soldDate: "2026-02-28"
    }],
    financeEntries: [{
      id: "finance-1",
      date: "2026-03-06",
      type: "expense",
      category: "feed",
      amount: 400,
      description: "Starter feed",
      notes: "March purchase",
      feedTypeId: "feed-1",
      quantity: 5,
      unit: "sack",
      sackKg: 50,
      createdAt: "2026-03-06T01:00:00.000Z",
      updatedAt: "2026-03-06T01:00:00.000Z"
    }, {
      id: "finance-2",
      date: "2026-03-02",
      type: "income",
      category: "egg_sale",
      amount: 300,
      description: "Egg trays",
      notes: "",
      createdAt: "2026-03-02T01:00:00.000Z",
      updatedAt: "2026-03-02T01:00:00.000Z"
    }]
  });
  assert.equal(financeLedger.length, 4);
  assert.equal(financeLedger[0].id, "finance-1");
  assert.equal(financeLedger[0].feedTypeId, "feed-1");
  assert.equal(financeLedger[0].unitPrice, 80);
  assert.equal(financeLedger[0].pricePerKg, 1.6);
  assert.equal(financeLedger[1].category, "bird_sale");

  const feedMetrics = buildFeedExpenseMetrics({
    type: "expense",
    category: "feed",
    amount: 630,
    feedTypeId: "feed-2",
    quantity: 6,
    unit: "sack",
    sackKg: 40
  });
  assert.equal(feedMetrics.feedTypeId, "feed-2");
  assert.equal(feedMetrics.unitPrice, 105);
  assert.equal(feedMetrics.quantityKg, 240);
  assert.equal(feedMetrics.pricePerKg, 2.625);

  const marchFinanceRows = filterFinanceRowsByMonth(financeLedger, "2026-03");
  const marchSummary = summarizeFinanceRows(marchFinanceRows);
  const marchRollups = rollupFinanceCategories(marchFinanceRows);
  assert.equal(marchFinanceRows.length, 3);
  assert.equal(marchSummary.income, 1500);
  assert.equal(marchSummary.expenses, 400);
  assert.equal(marchSummary.net, 1100);
  assert.equal(marchSummary.transactions, 3);
  assert.deepEqual(marchRollups.income.map(row => [row.category, row.amount]), [["bird_sale", 1200], ["egg_sale", 300]]);
  assert.deepEqual(marchRollups.expense.map(row => [row.category, row.amount]), [["feed", 400]]);

  const reminderResult = completeReminderAndScheduleNext({
    id: "inst-1",
    birdId: "bird-1",
    kind: "checkup",
    dueAt: "2026-03-01T00:00:00.000Z",
    status: "pending",
    ruleId: "rule-1"
  }, {
    id: "rule-1",
    cadenceDays: 7
  }, {
    nowIso: "2026-03-06T12:00:00.000Z",
    makeId: () => "inst-2"
  });
  assert.equal(reminderResult.completed.status, "done");
  assert.equal(reminderResult.completed.completedAt, "2026-03-06T12:00:00.000Z");
  assert.equal(reminderResult.next.id, "inst-2");
  assert.equal(reminderResult.next.dueAt, "2026-03-13T12:00:00.000Z");

  const hatchReminders = buildAutomaticHatchReminders({
    batches: [{
      id: "batch-1",
      code: "B001",
      collectedDate: "2026-03-01",
      incubationStartDate: "2026-03-03",
      eggCount: 12
    }, {
      id: "batch-2",
      code: "B002",
      collectedDate: "2026-03-02",
      eggCount: 6
    }],
    eggStates: [{
      id: "egg-1",
      batchId: "batch-1",
      status: "hatched"
    }, {
      id: "egg-2",
      batchId: "batch-1",
      status: "failed"
    }, {
      id: "egg-3",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-4",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-5",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-6",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-7",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-8",
      batchId: "batch-2",
      status: "hatched"
    }]
  });
  assert.equal(hatchReminders.length, 1);
  assert.equal(hatchReminders[0].id, "auto-hatch-batch-1");
  assert.equal(hatchReminders[0].batchCode, "B001");
  assert.equal(hatchReminders[0].pendingEggCount, 10);
  assert.equal(hatchReminders[0].expectedHatchDate, "2026-03-24");
  assert.equal(hatchReminders[0].dueAt, "2026-03-24T12:00:00.000Z");
  assert.equal(hatchReminders[0].title, "Hatch due");
  assert.equal(hatchReminders[0].auto, true);

  const incubationReminders = buildAutomaticIncubationReminders({
    batches: [{
      id: "batch-1",
      code: "B001",
      collectedDate: "2026-03-01",
      eggCount: 12
    }, {
      id: "batch-2",
      code: "B002",
      collectedDate: "2026-03-02",
      eggCount: 6
    }],
    eggStates: [{
      id: "egg-1",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-2",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-3",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-4",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-5",
      batchId: "batch-2",
      status: "hatched"
    }, {
      id: "egg-6",
      batchId: "batch-2",
      status: "hatched"
    }],
    nowMs: new Date("2026-03-01T06:00:00.000Z").getTime()
  });
  assert.equal(incubationReminders.length, 4);
  assert.equal(incubationReminders[0].id, "auto-incubation-batch-1-early_embryo");
  assert.equal(incubationReminders[0].title, "Start incubation");
  assert.equal(incubationReminders[0].humidity, "45-50% RH");
  assert.equal(incubationReminders[3].id, "auto-incubation-batch-1-lockdown");
  assert.equal(incubationReminders[3].dueAt, "2026-03-18T12:00:00.000Z");

  const penUpdatedBird = buildBirdPenUpdate({
    bird: {
      penId: "pen-a",
      penHistory: [{
        id: "move-1",
        date: "2026-03-01",
        fromPenId: null,
        toPenId: "pen-a",
        reason: "pen_assignment"
      }]
    },
    nextPenId: "pen-b",
    nextStatus: "active",
    changeDate: "2026-03-04",
    makeId: () => "move-2"
  });
  assert.equal(penUpdatedBird.penId, "pen-b");
  assert.equal(penUpdatedBird.penHistory.length, 2);
  assert.equal(getBirdPenAtDate({
    penId: "pen-b",
    penHistory: penUpdatedBird.penHistory
  }, "2026-03-02"), "pen-a");
  assert.equal(getBirdPenAtDate({
    penId: "pen-b",
    penHistory: penUpdatedBird.penHistory
  }, "2026-03-05"), "pen-b");

  const feedEstimate = estimatePenFeedLog({
    log: {
      penId: "pen-b",
      loggedAt: "2026-03-05",
      amount: 6
    },
    birds: [{
      id: "bird-1",
      status: "active",
      penId: "pen-b",
      penHistory: penUpdatedBird.penHistory
    }, {
      id: "bird-2",
      status: "sold",
      soldDate: "2026-03-05",
      penId: null,
      penHistory: [{
        id: "move-1",
        date: "2026-03-01",
        fromPenId: null,
        toPenId: "pen-b",
        reason: "pen_assignment"
      }, {
        id: "move-2",
        date: "2026-03-05",
        fromPenId: "pen-b",
        toPenId: null,
        reason: "status_sold"
      }]
    }, {
      id: "bird-3",
      status: "active",
      penId: "pen-b",
      penHistory: [{
        id: "move-1",
        date: "2026-03-02",
        fromPenId: null,
        toPenId: "pen-b",
        reason: "pen_assignment"
      }]
    }]
  });
  assert.equal(feedEstimate.birdCount, 2);
  assert.equal(feedEstimate.perBirdAmount, 3);
}

run();
console.log("logic tests passed");
