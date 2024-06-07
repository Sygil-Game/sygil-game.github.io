const PREFIX = "sygil_"; // For localStorage keys

// Dark mode logic that must be run before the document is ready to avoid flicker
const darkModeKey = `${PREFIX}darkModeStatus`;
const darkModeStatus = (localStorage.getItem(darkModeKey) ?? 'true') === 'true';
const setDarkModeStatus = (bool) => document.documentElement.setAttribute('data-bs-theme', bool ? 'dark' : 'light');
setDarkModeStatus(darkModeStatus);

// Disable initial animations for state restore
document.documentElement.classList.add('no-transition');
$(document).ready(function () { setTimeout(() => { document.documentElement.classList.remove('no-transition'); }, 10); });

$(document).ready(function () {
    // Dark mode
    document.getElementById('darkModeToggle').checked = darkModeStatus;
    $('#darkModeToggle').on('change', function () {
        const darkModeStatus = this.checked;
        localStorage.setItem(darkModeKey, darkModeStatus);
        setDarkModeStatus(darkModeStatus);
    });

    // Save active tab in sessionStorage
    const storedTab = sessionStorage.getItem('currentTab');
    if (storedTab) {
        $(`.nav-tabs a[href="${storedTab}"]`).tab('show');
    }
    $(document).on('click', 'a.nav-link', function () {
        let newTab = $(this).attr('href');
        sessionStorage.setItem('currentTab', newTab);
    });
});
