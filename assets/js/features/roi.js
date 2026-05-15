/**
 * roi.js - Time Opportunity Cost Calculator
 * Calculates whether to outsource a task or do it yourself based on hourly rate.
 */

function openROIModal() {
    // Default rate if not set, grab from some config if it existed, otherwise 50
    const currentRate = document.getElementById('roi-rate').value;
    if (!currentRate) {
        document.getElementById('roi-rate').value = '500'; // Defaulting to 500 PHP
    }
    document.getElementById('roi-cost').value = '';
    document.getElementById('roi-hours').value = '';

    const resultEl = document.getElementById('roi-result');
    resultEl.classList.add('hidden');
    resultEl.innerHTML = '';

    toggleModal('roi-modal');
}

function calculateROI() {
    const rate = parseFloat(document.getElementById('roi-rate').value);
    const cost = parseFloat(document.getElementById('roi-cost').value);
    const hours = parseFloat(document.getElementById('roi-hours').value);

    const resultEl = document.getElementById('roi-result');
    resultEl.classList.remove('hidden');

    if (isNaN(rate) || isNaN(cost) || isNaN(hours) || rate <= 0 || cost < 0 || hours <= 0) {
        resultEl.className = 'p-4 rounded-2xl border text-sm mt-4 bg-rose-50 border-rose-200 text-rose-700';
        resultEl.innerHTML = '<strong>Error:</strong> Please enter valid numbers greater than 0.';
        return;
    }

    const myTimeValue = rate * hours;
    const netBenefit = myTimeValue - cost;
    const currency = 'PHP';
    const formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: currency });

    if (netBenefit > 0) {
        // Outsource is better
        resultEl.className = 'p-4 rounded-2xl border text-sm mt-4 bg-emerald-50 border-emerald-200 text-emerald-800';
        resultEl.innerHTML = `
            <div class="flex items-center gap-2 mb-2 font-black text-emerald-700">
                <i data-lucide="check-circle" class="w-5 h-5"></i>
                Outsource It!
            </div>
            <p>Your time is worth <strong>${formatter.format(myTimeValue)}</strong> (${hours} hrs @ ${formatter.format(rate)}/hr).</p>
            <p class="mt-1">By paying <strong>${formatter.format(cost)}</strong>, you gain a net benefit of <strong>${formatter.format(netBenefit)}</strong>.</p>
        `;
    } else if (netBenefit === 0) {
        // Neutral
        resultEl.className = 'p-4 rounded-2xl border text-sm mt-4 bg-blue-50 border-blue-200 text-blue-800';
        resultEl.innerHTML = `
            <div class="flex items-center gap-2 mb-2 font-black text-blue-700">
                <i data-lucide="info" class="w-5 h-5"></i>
                It's a Tie
            </div>
            <p>Your time is worth exactly the cost of the service (<strong>${formatter.format(cost)}</strong>).</p>
            <p class="mt-1">Choose based on whether you enjoy the task or need the energy for something else.</p>
        `;
    } else {
        // DIY is better
        const loss = Math.abs(netBenefit);
        resultEl.className = 'p-4 rounded-2xl border text-sm mt-4 bg-amber-50 border-amber-200 text-amber-800';
        resultEl.innerHTML = `
            <div class="flex items-center gap-2 mb-2 font-black text-amber-700">
                <i data-lucide="alert-circle" class="w-5 h-5"></i>
                Do It Yourself
            </div>
            <p>Your time is worth <strong>${formatter.format(myTimeValue)}</strong> (${hours} hrs @ ${formatter.format(rate)}/hr).</p>
            <p class="mt-1">By paying <strong>${formatter.format(cost)}</strong>, you are losing <strong>${formatter.format(loss)}</strong> in value.</p>
        `;
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Make accessible globally
window.openROIModal = openROIModal;
window.calculateROI = calculateROI;
