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

        document.addEventListener('keydown', (e) => {
            if (isFinanceShortcutBlocked()) return;

            if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.altKey && e.code === 'Space') {
                e.preventDefault();
                focusTransactionSearch();
                return;
            }

            if (e.altKey && e.key.toLowerCase() === 'w') {
                e.preventDefault();
                openWishlistModal();
            }
        });
