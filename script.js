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

    // Replace all instances of 'Sygil(s)' with stylized spans
    function replaceSygil(rootNode) {
        const regex = /Sygils?/g;

        const nodeIterator = document.createNodeIterator(rootNode, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue.match(regex)) return NodeFilter.FILTER_REJECT;
                if (node.parentNode.classList.contains('sygil')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const nodes = [];
        let currentNode;
        while ((currentNode = nodeIterator.nextNode())) nodes.push(currentNode); // Collect into a list first since we'll be modifying the DOM and that confuses the iterator
        for (const node of nodes) {
            const delimiters = Array.from(node.nodeValue.matchAll(regex), match => match[0]);
            const parts = node.nodeValue.split(regex);
            const fragment = document.createDocumentFragment(); // Document fragment to hold the new nodes
            parts.forEach((part) => {
                if (part) fragment.appendChild(document.createTextNode(part)); // Don't add empty text nodes
                const delimiter = delimiters.shift();
                if (delimiter) { // Re-add the "Sygil(s)" delimiters we split on
                    const span = document.createElement('span');
                    span.className = 'sygil';
                    span.textContent = delimiter;
                    fragment.appendChild(span);
                }
            });
            node.parentNode.replaceChild(fragment, node);
        }
    }
    replaceSygil(document.body);
    (new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes) mutation.addedNodes.forEach(replaceSygil);
        });
    })).observe(document, { childList: true, subtree: true });


    /**
     * Keep an object in sync with localStorage, stringifying it and updating it whenever it's changed.
     * @param {string} key The key to use for the object in localStorage
     * @param {object} obj The object to sync to localStorage
     */
    const syncToLocalStorage = (key, defaultValue = {}) => {
        key = `${PREFIX}${key}`;
        const initialValue = localStorage.getItem(key) !== null ? JSON.parse(localStorage.getItem(key)) : defaultValue;
        return new Proxy(initialValue, {
            set(target, property, value) {
                const returnValue = Reflect.set(...arguments);
                localStorage.setItem(key, JSON.stringify(target));
                return returnValue;
            },
            deleteProperty(target, property) {
                const returnValue = Reflect.deleteProperty(...arguments);
                localStorage.setItem(key, JSON.stringify(target));
                return returnValue;
            }
        });
    };

    // Autofocus on the first input in a modal
    $('.modal').on('shown.bs.modal', function () {
        $(this).find('input').trigger('focus');
    });

    // Validate forms before submitting
    $('.needs-validation').on('submit', function (e) {
        if (!this.checkValidity()) {
            e.preventDefault();
            e.stopPropagation();
        }
        this.classList.add('was-validated');
    });

    // Async code that depends on fetched resources
    (async () => {
        /**
         * Fetch list of filepaths from a directory URL
         * @param {string} url The URL of the directory
         * @returns {Promise<string[]>} A promise that resolves to an array of filepaths
         */
        async function fetchFilesFromDirectory(url) {
            const text = await fetch(url).then(response => response.text());
            return Array.from((new DOMParser()).parseFromString(text, 'text/html').querySelectorAll('a'))
                .map(link => link.getAttribute('href'))
                .filter(href => href && !href.endsWith('/'));
        }

        /* Wordpacks */
        const defaultWordpackNames = (await fetchFilesFromDirectory('/wordpacks/')).map(file => file.split('/').pop().split('.')[0]);
        const wordpacks = syncToLocalStorage('wordpacks');
        const wordpackRaws = syncToLocalStorage('wordpackRaws');
        /**
         * Parse a wordpack, splitting it into a base Wordpack and an extended Wordpack+ if it has a === line.
         * The raw wordpack must already be in wordpackRaws.
         * @param {string} wordpackName The name of the wordpack
         */
        function parseWordpack(wordpackName) {
            const lines = wordpackRaws[wordpackName].split("\n").map(line => line.trim()).filter(line => line);
            if (lines.includes('===')) {
                wordpacks[wordpackName] = lines.slice(0, lines.indexOf('==='));
                wordpacks[`${wordpackName}+`] = lines.slice(0, lines.indexOf('===')).concat(lines.slice(lines.indexOf('===') + 1));
            } else {
                wordpacks[wordpackName] = lines;
            }
        }

        // Fetch wordpacks
        await Promise.all(defaultWordpackNames.map(async wordpackName => {
            const response = await fetch(`wordpacks/${wordpackName}.txt`);
            const text = await response.text();
            wordpackRaws[wordpackName] = text;
            parseWordpack(wordpackName);
        }));

        // Add wordpacks to the given dropdown
        function updateWordpackSelect(el) {
            el = $(el);
            el.empty();
            Object.entries(wordpacks)
                .filter(([name, content]) => !name.endsWith("+")) // Extended wordpacks aren't editable because you just edit the base one
                .forEach(([name, content]) => { el.append(`<option>${name}</option>`); });
            // el.selectpicker();
        }
        updateWordpackSelect("#wordpack-select");
        function updateWordpackContent() {
            $("#wordpack-content").val(wordpackRaws[$("#wordpack-select").val()]);
            $("#wordpack-content").prop('disabled', defaultWordpackNames.includes($("#wordpack-select").val()));
        }
        updateWordpackContent();
        $("#wordpack-select").on("change", updateWordpackContent);

        // Save modifications to the wordpack content
        let typingTimer;
        const doneTypingInterval = 300;
        $("#wordpack-content").on("input", function () {
            wordpackRaws[$("#wordpack-select").val()] = $("#wordpack-content").val();
            parseWordpack($("#wordpack-select").val());
            // Only show the same icon after the user has stopped typing
            clearTimeout(typingTimer);
            typingTimer = setTimeout(function () {
                if ($("#save-icon").css("display") == "none") { // Only animate if it's not already visible
                    $("#save-icon").fadeIn(0).fadeOut(1000);
                }
            }, doneTypingInterval);
        });

        // New wordpack button
        $("#new-wordpack").on("click", () => {
            $('#new-wordpack-modal').modal('show');
            $('#new-wordpack-modal').on('submit', e => {
                e.preventDefault();

                const name = $('#new-wordpack-name').val();
                if (!name) return false;
                if (name in wordpacks) {
                    console.log("A wordpack with the name " + name + " already exists.");
                    $('#new-wordpack-name').addClass('is-invalid');
                    return false;
                }

                wordpackRaws[name] = "";
                parseWordpack(name);

                updateWordpackSelect("#wordpack-select");
                $('#wordpack-select').val(name);
                updateWordpackContent();
                $('#new-wordpack-modal').modal('hide');
                return false; // Don't do the normal HTML form submission
            });
        });

        // Delete wordpack button
        $("#delete-wordpack").on("click", () => {
            const select = $("#wordpack-select");
            bootbox.confirm(`Are you sure you want to delete the wordpack "${select.val()}"?`, (confirmed) => {
                if (!confirmed) return;
                delete wordpacks[select.val()];
                delete wordpackRaws[select.val()];
                if (`${select.val()}+` in wordpacks) {
                    delete wordpacks[`${select.val()}+`];
                    delete wordpackRaws[`${select.val()}+`];
                }
                updateWordpackSelect();
            });
        });

        /* Presets */
        const presets = await fetch('presets.json').then(response => response.json());

        /* Generator */

        // Load a preset into the generator
        function loadPreset(preset) {
            for (const set of preset.sets) {
                const setClone = $('#set-template').prop('content').cloneNode(true);
                for (const group of set.groups) {
                    const innerClone = $(setClone).find('#group-template').prop('content').cloneNode(true);
                    $(innerClone).find('[name="num_words"]').val(group.num_words);
                    updateWordpackSelect($(innerClone).find('[name="wordpacks"]'));
                    $(innerClone).find('[name="wordpacks"]').val(group.wordpacks);
                    $(setClone).find('.group-container').append(innerClone);
                }
                $(setClone).find('[name="players"]').val(set.players);
                if (set.players.length > 1) $(setClone).find('.set').addClass('border');
                $('#set-container').append(setClone);
            }
            $('#generator .selectpicker').selectpicker();
        }
        loadPreset(presets["Default"]);

        // Clone one object to another, overwriting it.
        // Used for when you need to preserve the target object instead of creating a new one. (i.e. for proxies)
        function overwrite(target, source) {
            Object.getOwnPropertyNames(target).forEach(p => delete target[p]);
            Object.assign(target, JSON.parse(JSON.stringify(source)));
            return target;
        }

        // Assert helper
        function assert(value, expected) {
            if (value !== expected) throw new Error(`Expected ${expected} but got ${value}`);
            return value;
        }

        // Function to convert the current form data to a preset
        function getPresetFromForm() {
            const formData = $("#generator-form").find("fieldset").map((i, el) => [$(el).find("*[name]").serializeArray()]).get();

            try {
                return formData.map(set => {
                    function next(expectedName, allowFail = false) {
                        if (set[0].name !== expectedName) {
                            if (allowFail) return false;
                            throw new Error(`Expected ${expectedName} but got ${set[0].name}`);
                        }
                        return set.shift().value;
                    }

                    const out = {};
                    out.name = next("set_name");
                    out.groups = [];
                    let num_words;
                    while ((num_words = next("num_words", true)) !== false) {
                        out.groups.push({
                            "num_words": parseInt(num_words),
                            "wordpacks": [next("wordpacks")]
                        });
                    }
                    out.players = parseInt(next("players"));
                    return out;
                });
            } catch (e) {
                console.error("Invalid form data:", e);
            }
        }

        // Load and initialize generator output options
        const generator_output_options = syncToLocalStorage("generator_output_options", {
            alphabetize: true,
            oneLine: false,
            groupByWordpack: false
        });
        $("#alphabetize").prop("checked", generator_output_options.alphabetize);
        $("#one-line").prop("checked", generator_output_options.oneLine);
        $("#group-by-wordpack").prop("checked", generator_output_options.groupByWordpack);
        const generator_input = syncToLocalStorage("generator_input");
        const generator_output = syncToLocalStorage("generator_output", { "output": [] });
        let markdown = "";
        function render() {
            markdown = renderOutput(generator_output["output"], generator_output_options);
            $("#generator-output").empty().append(`<md-block>${markdown}</md-block>`);
        }
        $("#generator-form").on("submit", e => {
            e.preventDefault();
            const preset = getPresetFromForm();
            overwrite(generator_input, {
                "schema_version": CURRENT_SCHEMA_VERSION,
                "sets": preset,
                "wordpacks": JSON.parse(JSON.stringify(wordpacks))
            });
            console.log(generator_input);
            generator_output["output"] = generate(generator_input);
            render();
            $("#generator-output-container").fadeIn();
            return false;
        });
        $("#generator-output-options").on("change", () => {
            generator_output_options.alphabetize = $("#alphabetize").is(":checked");
            generator_output_options.oneLine = $("#one-line").is(":checked");
            generator_output_options.groupByWordpack = $("#group-by-wordpack").is(":checked");
            render();
        });
        // Show output if initially loaded from localStorage
        if (generator_output["output"].length > 0) {
            render();
            $("#generator-output-container").show();
        }

        $("#copy-to-clipboard").on("click", async () => { await navigator.clipboard.writeText(markdown.replace(/`/g, "")); });
    })();
});
