        // =============================================
        // SECTION 12: CSV IMPORT & CATEGORIZATION RULES
        // =============================================

        let importDraft = {
            fileName: '',
            fileHash: '',
            headers: [],
            rawRows: [],
            mappedRows: []
        };

        function openImportModal() {
            importDraft = { fileName: '', fileHash: '', headers: [], rawRows: [], mappedRows: [] };
            document.getElementById('import-file-name').innerText = 'No file selected.';
            document.getElementById('import-step-mapping').classList.add('hidden');
            document.getElementById('import-step-preview').classList.add('hidden');
            document.getElementById('import-preview-body').innerHTML = '';
            document.getElementById('import-preview-summary').innerText = 'No preview yet.';
            document.getElementById('import-duplicate-action').value = 'skip';
            document.getElementById('import-file-input').value = '';
            document.getElementById('import-modal').classList.remove('hidden');
        }

        function closeImportModal() {
            document.getElementById('import-modal').classList.add('hidden');
        }

        function normalizeTextForMatching(input) {
            return String(input || '')
                .trim()
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .replace(/\s+/g, ' ');
        }

        function parseCsvLine(line) {
            const out = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                const next = line[i + 1];

                if (ch === '"' && inQuotes && next === '"') {
                    current += '"';
                    i++;
                    continue;
                }
                if (ch === '"') {
                    inQuotes = !inQuotes;
                    continue;
                }
                if (ch === ',' && !inQuotes) {
                    out.push(current);
                    current = '';
                    continue;
                }
                current += ch;
            }
            out.push(current);
            return out.map(v => v.trim());
        }

        function parseCsvText(text) {
            const lines = text
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(Boolean);
            if (lines.length < 2) return { headers: [], rows: [] };

            const headers = parseCsvLine(lines[0]);
            const rows = lines.slice(1).map(line => {
                const values = parseCsvLine(line);
                const rowObj = {};
                headers.forEach((h, idx) => rowObj[h] = values[idx] || '');
                return rowObj;
            });
            return { headers, rows };
        }

        async function sha256Hex(text) {
            const encoded = new TextEncoder().encode(text);
            const hash = await crypto.subtle.digest('SHA-256', encoded);
            return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        function fillMappingSelect(id, headers, guessKeywords = []) {
            const el = document.getElementById(id);
            el.innerHTML = '';

            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '-- none --';
            el.appendChild(defaultOption);

            headers.forEach(h => {
                const op = document.createElement('option');
                op.value = h;
                op.textContent = h;
                el.appendChild(op);
            });

            const guessed = headers.find(h => guessKeywords.some(k => h.toLowerCase().includes(k)));
            if (guessed) el.value = guessed;
        }

        function populateImportMapping(headers) {
            fillMappingSelect('map-date', headers, ['date', 'posted', 'transaction date']);
            fillMappingSelect('map-description', headers, ['description', 'memo', 'details', 'item']);
            fillMappingSelect('map-amount', headers, ['amount', 'total', 'value']);
            fillMappingSelect('map-type', headers, ['type', 'direction', 'drcr']);
            fillMappingSelect('map-category', headers, ['category', 'cat']);
            fillMappingSelect('map-currency', headers, ['currency', 'ccy']);
            fillMappingSelect('map-merchant', headers, ['merchant', 'payee', 'store']);
            fillMappingSelect('map-tags', headers, ['tag', 'labels']);
        }

        async function previewImportFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const parsed = parseCsvText(text);
                if (!parsed.headers.length) {
                    showToast('❌ Could not parse CSV headers');
                    return;
                }

                importDraft.fileName = file.name;
                importDraft.fileHash = await sha256Hex(text);
                importDraft.headers = parsed.headers;
                importDraft.rawRows = parsed.rows;
                importDraft.mappedRows = [];

                document.getElementById('import-file-name').innerText = `${file.name} (${parsed.rows.length} rows)`;
                populateImportMapping(parsed.headers);
                document.getElementById('import-step-mapping').classList.remove('hidden');
                document.getElementById('import-step-preview').classList.add('hidden');
            } catch (error) {
                console.error(error);
                showToast('❌ Failed to read CSV file');
            }
        }

        function getMappedValue(mapId, row) {
            const key = document.getElementById(mapId).value;
            return key ? row[key] : '';
        }

        function parseTransactionType(rawType, rawAmount) {
            const t = String(rawType || '').trim().toLowerCase();
            if (t.includes('income') || t.includes('credit') || t === 'in') return 'income';
            if (t.includes('expense') || t.includes('debit') || t === 'out') return 'expense';
            const amount = parseFloat(rawAmount);
            return amount < 0 ? 'expense' : 'income';
        }

        function parseDateValue(rawDate) {
            if (!rawDate) return new Date();
            const dt = new Date(rawDate);
            if (Number.isNaN(dt.getTime())) return new Date();
            return dt;
        }

        function parseTags(rawTags) {
            if (!rawTags) return [];
            return String(rawTags)
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);
        }

        function getAllCategoryChoices() {
            const debtCats = (window.allDecryptedDebts || []).map(d => d.name);
            const lentCats = (window.allDecryptedLent || []).map(l => `Lent: ${l.name}`);
            return Array.from(new Set([...standardCategories, ...customCategories, ...debtCats, ...lentCats]));
        }

        function applyCategorizationRules(description, amount, direction) {
            const normalized = normalizeTextForMatching(description);
            const sorted = [...(categorizationRules || [])]
                .filter(r => r && r.active !== false)
                .sort((a, b) => (a.priority || 999) - (b.priority || 999));

            for (const rule of sorted) {
                const contains = normalizeTextForMatching(rule.contains_text || '');
                if (contains && !normalized.includes(contains)) continue;
                if (rule.direction && rule.direction !== 'any' && rule.direction !== direction) continue;
                if (typeof rule.minAmount === 'number' && amount < rule.minAmount) continue;
                if (typeof rule.maxAmount === 'number' && amount > rule.maxAmount) continue;
                if (rule.category) return rule.category;
            }
            return null;
        }

        function getDuplicateMatch(mappedRow, existingTransactions) {
            const normalizedDesc = normalizeTextForMatching(mappedRow.desc);
            const baseDate = new Date(mappedRow.date).getTime();
            return (existingTransactions || []).find(tx => {
                const txDate = getTxTimestamp(tx);
                const daysDiff = Math.abs(txDate - baseDate) / (24 * 60 * 60 * 1000);
                const txCurrency = tx.originalCurrency || 'PHP';
                const txNormalizedDesc = normalizeTextForMatching(tx.desc);
                return daysDiff <= 2 &&
                    Math.abs((tx.amt || 0) - mappedRow.amtPHP) < 0.01 &&
                    txCurrency === mappedRow.currency &&
                    txNormalizedDesc === normalizedDesc;
            }) || null;
        }

        function buildImportPreview() {
            if (!importDraft.rawRows.length) {
                showToast('⚠️ Select a CSV first');
                return;
            }
            if (!document.getElementById('map-amount').value) {
                showToast('⚠️ Map the amount column first');
                return;
            }

            const mapped = importDraft.rawRows.map(row => {
                const rawDate = getMappedValue('map-date', row);
                const rawDesc = getMappedValue('map-description', row);
                const rawAmt = getMappedValue('map-amount', row);
                const rawType = getMappedValue('map-type', row);
                const rawCategory = getMappedValue('map-category', row);
                const rawCurrency = getMappedValue('map-currency', row) || 'PHP';
                const rawMerchant = getMappedValue('map-merchant', row);
                const rawTags = getMappedValue('map-tags', row);

                const date = parseDateValue(rawDate).toISOString();
                const desc = rawDesc || rawMerchant || 'Imported transaction';
                const amount = Math.abs(parseFloat(rawAmt || '0')) || 0;
                const type = parseTransactionType(rawType, rawAmt);
                const currencyRaw = String(rawCurrency || 'PHP').toUpperCase();
                const currency = exchangeRates[currencyRaw] ? currencyRaw : 'PHP';
                const amtPHP = convertToDisplayCurrency(amount, currency, 'PHP');
                const merchant = rawMerchant || null;
                const tags = parseTags(rawTags);

                const ruleCategory = applyCategorizationRules(desc, amtPHP, type);
                const category = rawCategory || ruleCategory || (type === 'income' ? 'Salary' : 'Others');
                const dedupeHash = `${new Date(date).toISOString().split('T')[0]}|${amtPHP.toFixed(2)}|${normalizeTextForMatching(desc)}|${currency}`;

                return {
                    row,
                    date,
                    desc,
                    amount,
                    currency,
                    amtPHP,
                    type,
                    category,
                    merchant,
                    tags,
                    dedupeHash
                };
            }).filter(r => r.amount > 0);

            const existing = window.allDecryptedTransactions || [];
            mapped.forEach(r => {
                const duplicate = getDuplicateMatch(r, existing);
                r.duplicate = !!duplicate;
                r.duplicateId = duplicate ? duplicate.id : null;
            });

            importDraft.mappedRows = mapped;
            const duplicateCount = mapped.filter(r => r.duplicate).length;
            document.getElementById('import-preview-summary').innerText =
                `${mapped.length} parsed row(s), ${duplicateCount} duplicate candidate(s).`;

            const body = document.getElementById('import-preview-body');
            body.innerHTML = mapped.slice(0, 200).map(r => `
                <tr>
                    <td class="p-2 font-bold ${r.duplicate ? 'text-amber-600' : 'text-emerald-600'}">${r.duplicate ? 'Duplicate' : 'New'}</td>
                    <td class="p-2 text-slate-600">${new Date(r.date).toLocaleDateString()}</td>
                    <td class="p-2 text-slate-700">${escapeHTML(r.desc)}</td>
                    <td class="p-2 text-right text-slate-700">${formatCurrency(r.amount, r.currency)}</td>
                    <td class="p-2 text-slate-600">${escapeHTML(r.category)}</td>
                </tr>
            `).join('');

            document.getElementById('import-step-preview').classList.remove('hidden');
        }

        async function persistCategorizationRules(db) {
            db.categorization_rules = (categorizationRules || []).sort((a, b) => (a.priority || 999) - (b.priority || 999));
            await saveDB(db);
        }

        async function confirmImportRows() {
            if (!importDraft.mappedRows.length) {
                showToast('⚠️ Build preview first');
                return;
            }

            const duplicateAction = document.getElementById('import-duplicate-action').value;
            const db = await getDB();
            const importId = `imp_${Date.now().toString(36)}`;
            let imported = 0;
            let deduped = 0;

            for (const row of importDraft.mappedRows) {
                if (row.duplicate && duplicateAction === 'skip') {
                    deduped++;
                    continue;
                }

                if (row.duplicate && duplicateAction === 'merge' && row.duplicateId) {
                    const idx = (db.transactions || []).findIndex(t => t.id === row.duplicateId);
                    if (idx >= 0) {
                        const existing = await decryptData(db.transactions[idx].data);
                        if (existing) {
                            existing.merchant = existing.merchant || row.merchant;
                            existing.tags = Array.from(new Set([...(existing.tags || []), ...(row.tags || [])]));
                            if ((!existing.category || existing.category === 'Others') && row.category) {
                                existing.category = row.category;
                            }
                            existing.importId = existing.importId || importId;
                            existing.dedupeHash = existing.dedupeHash || row.dedupeHash;
                            db.transactions[idx] = {
                                ...db.transactions[idx],
                                data: await encryptData(existing),
                                lastModified: Date.now()
                            };
                            deduped++;
                            continue;
                        }
                    }
                }

                const payload = {
                    desc: row.desc,
                    merchant: row.merchant,
                    tags: row.tags,
                    amt: row.amtPHP,
                    originalAmt: row.amount,
                    originalCurrency: row.currency,
                    quantity: 1,
                    notes: '',
                    type: row.type,
                    category: row.category,
                    date: row.date,
                    importId,
                    dedupeHash: row.dedupeHash,
                    deletedAt: null
                };

                db.transactions.push({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
                    data: await encryptData(payload),
                    createdAt: Date.now(),
                    deletedAt: null
                });
                imported++;
            }

            db.imports = db.imports || [];
            db.imports.push({
                id: importId,
                source: importDraft.fileName,
                importedAt: new Date().toISOString(),
                rowCount: importDraft.mappedRows.length,
                dedupedCount: deduped,
                hash: importDraft.fileHash
            });

            await saveDB(db);
            rawTransactions = (db.transactions || []).filter(t => !t.deletedAt);
            importsLog = db.imports;

            closeImportModal();
            await loadAndRender();
            await renderDebts(rawDebts);
            showToast(`✅ Imported ${imported} row(s), deduped ${deduped}`);
        }

        function openCategorizationRulesModal() {
            const categorySelect = document.getElementById('rule-category');
            const categories = getAllCategoryChoices();
            categorySelect.innerHTML = '';
            categories.forEach(c => {
                const op = document.createElement('option');
                op.value = c;
                op.textContent = c;
                categorySelect.appendChild(op);
            });
            resetRuleForm();
            renderCategorizationRulesList();
            toggleModal('categorization-rules-modal');
        }

        function resetRuleForm() {
            document.getElementById('rule-id').value = '';
            document.getElementById('rule-text').value = '';
            document.getElementById('rule-min-amount').value = '';
            document.getElementById('rule-max-amount').value = '';
            document.getElementById('rule-direction').value = 'any';
            document.getElementById('rule-priority').value = '10';
            document.getElementById('rule-active').checked = true;
        }

        function renderCategorizationRulesList() {
            const list = document.getElementById('rules-list');
            if (!list) return;

            const rules = [...(categorizationRules || [])].sort((a, b) => (a.priority || 999) - (b.priority || 999));
            if (!rules.length) {
                list.innerHTML = '<div class="text-xs text-slate-400">No rules configured.</div>';
                return;
            }

            list.innerHTML = rules.map(rule => `
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                    <div>
                        <p class="text-sm font-bold text-slate-700">${escapeHTML(rule.contains_text || '(any text)')} → ${escapeHTML(rule.category)}</p>
                        <p class="text-[10px] text-slate-500">Priority ${rule.priority || 999} • Direction: ${escapeHTML(rule.direction || 'any')} • ${rule.active === false ? 'Inactive' : 'Active'}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="editCategorizationRule(decodeURIComponent('${encodeInlineArg(rule.id)}'))" class="text-xs font-bold text-indigo-600">Edit</button>
                        <button onclick="deleteCategorizationRule(decodeURIComponent('${encodeInlineArg(rule.id)}'))" class="text-xs font-bold text-rose-600">Delete</button>
                    </div>
                </div>
            `).join('');
        }

        async function saveCategorizationRule() {
            const id = document.getElementById('rule-id').value || `rule_${Date.now().toString(36)}`;
            const contains_text = document.getElementById('rule-text').value.trim().toLowerCase();
            const minAmountVal = document.getElementById('rule-min-amount').value;
            const maxAmountVal = document.getElementById('rule-max-amount').value;
            const direction = document.getElementById('rule-direction').value;
            const category = document.getElementById('rule-category').value;
            const priority = parseInt(document.getElementById('rule-priority').value || '10', 10);
            const active = document.getElementById('rule-active').checked;

            const rule = {
                id,
                contains_text,
                minAmount: minAmountVal ? parseFloat(minAmountVal) : undefined,
                maxAmount: maxAmountVal ? parseFloat(maxAmountVal) : undefined,
                direction,
                category,
                priority,
                active
            };

            const idx = (categorizationRules || []).findIndex(r => r.id === id);
            if (idx >= 0) categorizationRules[idx] = rule;
            else categorizationRules.push(rule);

            const db = await getDB();
            db.categorization_rules = categorizationRules;
            await saveDB(db);

            resetRuleForm();
            renderCategorizationRulesList();
            showToast('✅ Rule saved');
        }

        function editCategorizationRule(id) {
            const rule = (categorizationRules || []).find(r => r.id === id);
            if (!rule) return;
            document.getElementById('rule-id').value = rule.id;
            document.getElementById('rule-text').value = rule.contains_text || '';
            document.getElementById('rule-min-amount').value = typeof rule.minAmount === 'number' ? rule.minAmount : '';
            document.getElementById('rule-max-amount').value = typeof rule.maxAmount === 'number' ? rule.maxAmount : '';
            document.getElementById('rule-direction').value = rule.direction || 'any';
            document.getElementById('rule-category').value = rule.category || 'Others';
            document.getElementById('rule-priority').value = rule.priority || 10;
            document.getElementById('rule-active').checked = rule.active !== false;
        }

        async function deleteCategorizationRule(id) {
            if (!confirm('Delete this categorization rule?')) return;
            categorizationRules = (categorizationRules || []).filter(r => r.id !== id);
            const db = await getDB();
            db.categorization_rules = categorizationRules;
            await saveDB(db);
            renderCategorizationRulesList();
            showToast('🗑️ Rule deleted');
        }
