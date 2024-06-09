import { compressUrlSafe, decompressUrlSafe } from './lib/lzma-url.mjs'


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

    // Initialize select pickers whenever they're added
    (new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes) mutation.addedNodes.forEach(node => {
                $(node).find('.select-picker-X').addBack('.select-picker-X').each(function () {
                    // Initialize select picker
                    $(this).selectpicker({
                        liveSearch: true,
                        noneSelectedText: "Select a wordpack",
                        noneResultsText: 'No wordpacks found matching "{0}"',
                        selectOnTab: true,
                        styleBase: 'form-control',
                        style: ''
                    });
                    // Make sure we don't double-dip
                    $(this).removeClass('select-picker-X');
                    // Bind a click handler to the clear button
                    $(this).parent().find('.select-picker-clear').on('click', () => {
                        $(this).find('select').selectpicker('deselectAll');
                    });
                });
            });
        });
    })).observe(document, { childList: true, subtree: true });

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

    // Autofocus on the first input in a modal
    $('.modal').on('shown.bs.modal', function () {
        $(this).find('input').trigger('focus');
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
        const defaultWordpackNames = (await fetchFilesFromDirectory('/static/wordpacks/')).map(file => file.split('/').pop().split('.')[0]);
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
            const response = await fetch(`/static/wordpacks/${wordpackName}.txt`);
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
        const presets = await fetch('static/presets.json').then(response => response.json());

        /* Generator */
        // Clone one object to another, overwriting it.
        // Used for when you need to preserve the target object instead of creating a new one. (i.e. for proxies)
        function overwrite(target, source) {
            Object.getOwnPropertyNames(target).filter(p => !p.startsWith("__")).forEach(p => delete target[p]);
            Object.assign(target, JSON.parse(JSON.stringify(source)));
            return target;
        }

        // Function to convert the current form data to a preset
        function getPresetFromForm() {
            const formData = $("#generator-form").serializeFieldsets();

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
                            "wordpacks": next("wordpacks")
                        });
                    }
                    out.players = parseInt(next("players"));
                    return out;
                });
            } catch (e) {
                console.error("Invalid form data:", e);
            }
        }

        const generator_input = syncToLocalStorage("generator_input", presets["Default"]);
        const generator_output = syncToLocalStorage("generator_output", {
            output: [],
            options: {
                alphabetize: true,
                oneLine: false,
                groupByWordpack: false
            }
        });
        // Load params from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("i")) overwrite(generator_input, JSON.parse(decompressUrlSafe(urlParams.get("i"))));
        if (urlParams.has("o")) overwrite(generator_output, JSON.parse(decompressUrlSafe(urlParams.get("o"))));
        // Initialize generator output options
        $("#alphabetize").prop("checked", generator_output["options"]["alphabetize"]);
        $("#one-line").prop("checked", generator_output["options"]["oneLine"]);
        $("#group-by-wordpack").prop("checked", generator_output["options"]["groupByWordpack"]);

        // Load a preset into the generator
        function loadPreset(preset) {
            $('#set-container').empty();
            for (let i = 0; i < preset.sets.length; i++) {
                const set = preset.sets[i];
                const setClone = $('#set-template').prop('content').cloneNode(true);

                // Header
                $(setClone).find('.set').toggleClass('border', preset.sets.length > 1);
                $(setClone).find('.set-header').toggleClass('d-none', !(preset.sets.length > 1));

                for (const group of set.groups) {
                    const groupClone = $('#group-template').prop('content').cloneNode(true);
                    $(groupClone).find('[name="num_words"]').val(group.num_words);
                    updateWordpackSelect($(groupClone).find('[name="wordpacks"]'));
                    $(groupClone).find('[name="wordpacks"]').val(group.wordpacks);
                    if (set.groups.length > 1) $(groupClone).find('.delete-group').removeClass('invisible');
                    $(setClone).find('.group-container').append(groupClone);
                }
                $(setClone).find('[name="players"]').val(set.players);

                $('#set-container').append(setClone);
            }
        }
        loadPreset(generator_input);

        let markdown = "";
        function render() {
            markdown = renderOutput(generator_output);
            $("#generator-output").empty().append(`<md-block>${markdown}</md-block>`);
        }
        function updateGeneratorInput() {
            const sets = getPresetFromForm()
            overwrite(generator_input, {
                schema_version: CURRENT_SCHEMA_VERSION,
                sets: sets,
                wordpacks: _.pick(wordpacks, generator_input.sets.flatMap(set => set.groups.flatMap(group => group.wordpacks))) // Filter for only relevant wordpacks
            });
        }
        $("#generator-form").on("change", updateGeneratorInput);
        $("#generator-form").on("submit", function (e) {
            // Coerce invalid "players" fields to 1
            $("#generator-form").find("[name='players']:invalid").each(function () { this.value = 1; });

            updateGeneratorInput();

            // Do the builtin form validation, for stuff like the 'required' attribute
            let isValid = true;
            if (!this.checkValidity()) {
                $("#generator-form").find(":invalid").addClass('is-invalid');
                isValid = false;
            }

            // Now try to generate the output and see if we get any errors
            let output;
            try {
                output = generate(generator_input);
            } catch (error) {
                // Handle all errors from the generator
                if (error instanceof BundledGeneratorError) {
                    isValid = false;
                    for (const suberror of error.errors) {
                        if (suberror instanceof NotEnoughWordsError) {
                            // Get the relevant group's element using info from the error
                            const groupElem = $(`#generator-form .set:nth-child(${suberror.set_i + 1}) .group:nth-child(${suberror.group_i + 1})`);
                            // Show invalid text
                            groupElem.children(":first").addClass("is-invalid");
                            groupElem.find('.invalid-feedback').text(suberror.validation_message);
                            // Make the wordpack dropdown invalid
                            groupElem.find(".dropdown-toggle").addClass("is-invalid");//.removeClass("border");
                        } else { throw suberror; }
                    }
                } else { throw error; }
            }
            // If at any point something was invalid, don't update the generator output
            if (!isValid) return false;

            // Update the generator output and render
            generator_output["output"] = output;
            render();
            $("#generator-output-container").fadeIn();
            return false;
        });
        // When an invalid form element is changed, remove the invalid styles (though it might still be invalid when Generate is clicked again)
        $("#generator-form").on("change", ".is-invalid", function () {
            $(this).find(".is-invalid").addBack(".is-invalid").removeClass("is-invalid");
        });
        // Keep the generator output options updated
        $("#generator-output-options").on("change", () => {
            generator_output["options"]["alphabetize"] = $("#alphabetize").is(":checked");
            generator_output["options"]["oneLine"] = $("#one-line").is(":checked");
            generator_output["options"]["groupByWordpack"] = $("#group-by-wordpack").is(":checked");
            render();
        });
        // Show output if initially loaded from localStorage
        if (generator_output["output"] && generator_output["output"].length > 0) {
            render();
            $("#generator-output-container").show();
        }

        $("#copy-to-clipboard").on("click", async () => { await navigator.clipboard.writeText(markdown.replace(/`/g, "")); });
        $("#copy-link").on("click", async () => {
            const url_parts = []
            url_parts.push("i=" + compressUrlSafe(JSON.stringify(generator_input)))
            if (generator_output["output"].length > 0) url_parts.push("o=" + compressUrlSafe(JSON.stringify(generator_output)))
            await navigator.clipboard.writeText(`${window.location.href}?${url_parts.join("&")}`);
        });

        // Bind button handlers
        function wrap(callback) {
            return function () { // Helper to locate set/group indices and update generator
                callback($(this).closest(".set").index(), $(this).closest(".group").index());
                loadPreset(generator_input);
                updateGeneratorInput();
            };
        }
        $("body").on("click", ".add-group", wrap((setIndex, groupIndex) =>
            generator_input.sets[setIndex].groups.push({ num_words: null, wordpacks: [""] })));
        $("body").on("click", ".delete-group", wrap((setIndex, groupIndex) =>
            generator_input.sets[setIndex].groups.splice(groupIndex, 1)));
        $("body").on("click", ".add-set", wrap((setIndex, groupIndex) =>
            generator_input.sets.push({ name: "", groups: [{ wordpacks: [], num_words: null }], players: null })));
        $("body").on("click", ".set-up", wrap((setIndex, groupIndex) => {
            if (setIndex == 0) return;
            generator_input.sets.splice(setIndex - 1, 0, generator_input.sets.splice(setIndex, 1)[0]);
        }));
        $("body").on("click", ".set-down", wrap((setIndex, groupIndex) => {
            if (setIndex == generator_input.sets.length - 1) return;
            generator_input.sets.splice(setIndex + 1, 0, generator_input.sets.splice(setIndex, 1)[0]);
        }));
        $("body").on("click", ".set-copy", wrap((setIndex, groupIndex) =>
            generator_input.sets.splice(setIndex + 1, 0, JSON.parse(JSON.stringify(generator_input.sets[setIndex])))));
        $("body").on("click", ".set-delete", wrap((setIndex, groupIndex) =>
            generator_input.sets.splice(setIndex, 1)));
    })();
});
