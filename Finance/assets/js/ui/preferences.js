        function toggleDarkMode() {
            document.body.classList.toggle('dark');
            const icon = document.querySelector('#dark-mode-toggle i');
            const isDark = document.body.classList.contains('dark');

            icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
            localStorage.setItem('darkMode', isDark);
            lucide.createIcons();
        }

        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key.toLowerCase() === 'w') {
                const authOverlay = document.getElementById('auth-overlay');
                if (authOverlay && !authOverlay.classList.contains('hidden')) return;
                e.preventDefault();
                openWishlistModal();
            }
        });
