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


    // Replace all instances of 'Sygil' with stylized spans
    function replaceSygil(rootNode) {
        const searchText = "Sygil";
        const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (!node.nodeValue.includes(searchText)) continue;
            if (node.nodeValue == searchText && node.parentNode.classList.contains("sygil")) continue; // Don't restyle text that's already styled

            const parts = node.nodeValue.split(searchText);
            const fragment = document.createDocumentFragment(); // Document fragment to hold the new nodes
            for (let i = 0; i < parts.length; i++) {
                if (parts[i]) { // Don't add empty text nodes
                    fragment.appendChild(document.createTextNode(parts[i]));
                }
                if (i < parts.length - 1) { // We split on "Sygil", so between each pair of text nodes we add a "Sygil" span
                    const span = document.createElement('span');
                    span.className = 'sygil';
                    span.textContent = searchText;
                    fragment.appendChild(span);
                }
            }

            node.parentNode.replaceChild(fragment, node);
        }
    }
    replaceSygil(document.body);
    (new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes) mutation.addedNodes.forEach(replaceSygil);
        });
    })).observe(document, { childList: true, subtree: true });

    const localStorageKey = "sygil_local_storage";
    let localStorageData = JSON.parse(localStorage.getItem(localStorageKey) || "{}");

    const wordpacks = {
        Basic: "Water\nHeavy\nWood\nHot\n===",
        // Add more default wordpacks here if needed
    };

    function saveToLocalStorage() {
        localStorage.setItem(localStorageKey, JSON.stringify(localStorageData));
    }

    function loadWordpacks() {
        const select = document.getElementById("wordpack-select");
        select.innerHTML = '';
        for (const [name, content] of Object.entries(localStorageData.wordpacks || wordpacks)) {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        }
        document.getElementById("wordpack-content").value = localStorageData.wordpacks?.[select.value] || wordpacks[select.value];
    }

    document.getElementById("new-wordpack").addEventListener("click", () => {
        const name = prompt("Enter the new wordpack name:");
        if (name) {
            localStorageData.wordpacks = localStorageData.wordpacks || {};
            localStorageData.wordpacks[name] = "";
            saveToLocalStorage();
            loadWordpacks();
        }
    });

    document.getElementById("delete-wordpack").addEventListener("click", () => {
        const select = document.getElementById("wordpack-select");
        if (confirm(`Are you sure you want to delete the wordpack "${select.value}"?`)) {
            delete localStorageData.wordpacks[select.value];
            saveToLocalStorage();
            loadWordpacks();
        }
    });

    document.getElementById("wordpack-select").addEventListener("change", (event) => {
        const selectedWordpack = event.target.value;
        document.getElementById("wordpack-content").value = localStorageData.wordpacks?.[selectedWordpack] || wordpacks[selectedWordpack];
    });

    document.getElementById("wordpack-content").addEventListener("input", (event) => {
        const select = document.getElementById("wordpack-select");
        localStorageData.wordpacks[select.value] = event.target.value;
        saveToLocalStorage();
    });

    document.getElementById("reset").addEventListener("click", () => {
        localStorageData = {};
        saveToLocalStorage();
        location.reload();
    });

    document.getElementById("generate").addEventListener("click", () => {
        const output = document.getElementById("output");
        output.innerHTML = "Generated Sygils: ..."; // Add generation logic here
    });

    loadWordpacks();
});
