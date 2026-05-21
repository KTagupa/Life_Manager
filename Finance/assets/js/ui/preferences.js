        function toggleDarkMode() {
            document.body.classList.toggle('dark');
            const icon = document.querySelector('#dark-mode-toggle i');
            const isDark = document.body.classList.contains('dark');

            icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
            localStorage.setItem('darkMode', isDark);
            lucide.createIcons();
        }

        function isFinanceShortcutBlocked() {
            const authOverlay = document.getElementById('auth-overlay');
            return authOverlay && !authOverlay.classList.contains('hidden');
        }

        function focusTransactionSearch() {
            const searchInput = document.querySelector('[data-filter-search]');
            if (!searchInput) return;

            searchInput.focus();
            searchInput.select();
        }

        const FINANCE_CARD_SHORTCUTS = Object.freeze({
            Space: 'ledger',
            KeyW: 'wishlist',
            KeyF: 'assets',
            KeyI: 'installments',
            KeyH: 'insights',
            KeyR: 'revenue',
            KeyT: 'trends',
            KeyG: 'goals',
            KeyD: 'debts',
            KeyC: 'credit-cards',
            KeyL: 'lent',
            KeyB: 'bills',
            KeyS: 'spend',
            KeyV: 'variance'
        });

        let financeCardFocusTimer = 0;

        function isFinanceTextEntryTarget(target) {
            if (!(target instanceof Element)) return false;

            if (target.isContentEditable) return true;

            const inputLike = target.closest('input, textarea, select, [contenteditable="true"]');
            return Boolean(inputLike);
        }

        function markFinanceCardFocused(elements) {
            if (financeCardFocusTimer) {
                window.clearTimeout(financeCardFocusTimer);
                financeCardFocusTimer = 0;
            }

            document.querySelectorAll('.is-finance-card-focused').forEach(el => {
                el.classList.remove('is-finance-card-focused');
            });

            elements.filter(Boolean).forEach(el => {
                el.classList.add('is-finance-card-focused');
            });

            financeCardFocusTimer = window.setTimeout(() => {
                elements.filter(Boolean).forEach(el => {
                    el.classList.remove('is-finance-card-focused');
                });
                financeCardFocusTimer = 0;
            }, 1400);
        }

        function focusFinanceCard(cardKey) {
            const card = document.querySelector(`[data-finance-card="${cardKey}"]`);
            const toolbar = document.querySelector(`[data-finance-card-toolbar="${cardKey}"]`);
            const scrollTarget = cardKey === 'ledger' ? (toolbar || card) : card;

            if (!scrollTarget) return;

            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
            markFinanceCardFocused([card, toolbar]);

            if (card instanceof HTMLElement) {
                card.focus({ preventScroll: true });
            }

            if (cardKey === 'ledger') {
                window.setTimeout(focusTransactionSearch, 120);
            }
        }

        document.addEventListener('keydown', (e) => {
            if (isFinanceShortcutBlocked()) return;

            if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.altKey && e.code === 'Space') {
                e.preventDefault();
                focusFinanceCard('ledger');
                return;
            }

            if (isFinanceTextEntryTarget(e.target)) return;
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

            const cardKey = FINANCE_CARD_SHORTCUTS[e.code];
            if (!cardKey) return;

            e.preventDefault();
            focusFinanceCard(cardKey);
        });
