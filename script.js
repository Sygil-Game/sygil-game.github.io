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

    // Save active tab in sessionStorage
    const storedTab = sessionStorage.getItem('currentTab');
    if (storedTab) {
        $(`.nav-tabs a[href="${storedTab}"]`).tab('show');
    }
    $(document).on('click', 'a.nav-link', function () {
        let newTab = $(this).attr('href');
        sessionStorage.setItem('currentTab', newTab);
    });

    // Enable popovers
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]')
    const popoverList = [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl))

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
    $('.modal').on('shown.bs.modal', function () { $(this).find('input').trigger('focus'); });

    // Initialize tooltips
    whenAdded('[data-bs-toggle="tooltip"]', function () { new bootstrap.Tooltip(this) });

    // Async code that depends on fetched resources
    (async () => {
        /* Wordpacks */
        const defaultWordpackNames = (await fetch('/static/wordpacks/wordpacks.json').then(response => response.json())).wordpacks
            .filter(name => !(name in wordpacks.getAll(false)));

        // Fetch wordpacks
        (await Promise.all(defaultWordpackNames.map(async wordpackName => {
            const response = await fetch(`/static/wordpacks/${wordpackName}.txt`);
            return [wordpackName, await response.text()];
        }))).map(([name, rawText]) => wordpacks.setDefault(name, rawText)); // In 2 steps to preserve order

        // Initialize wordpack selects whenever they're added
        whenAdded('select.wordpack-select', function () {
            // Make sure we don't double-dip
            if ($(this).hasClass('wordpack-select-initialized')) return;
            $(this).addClass('wordpack-select-initialized');
            // Initialize select picker
            $(this).selectpicker({
                liveSearch: true,
                noneSelectedText: "Select a wordpack",
                noneResultsText: 'No wordpacks found matching "{0}"',
                selectOnTab: true,
                styleBase: 'form-control',
                style: ''
            });
            // Add a clear button if requested
            if ($(this).hasClass('wordpack-select-clear')) {
                const clearButton = $('#select-picker-clear-template').prop('content').cloneNode(true);
                $(clearButton).find('button').on('click', () => $(this).val("").selectpicker('refresh'));
                $(this).parent().append(clearButton);
            }
            // For wordpack-view-select specifically, turn off border radius
            if ($(this).attr('id') === 'wordpack-view-select') {
                $(this).siblings('button').addClass('rounded-0');
            }
        });
        // Add wordpacks to wordpack select dropdowns
        function updateWordpackSelects() {
            const newHTML = Object.keys(wordpacks.getAll(false)).map(name => `<option>${name}</option>`); // Extended wordpacks aren't editable because you just edit the base one
            $("select.wordpack-select").each(function () {
                const val = $(this).val(); // Save val and restore it (since we're temporarily nuking all the options)
                $(this).empty().append(newHTML);
                $(this).val(val);
                $(this).selectpicker('refresh');
            });
        }
        updateWordpackSelects();

        function updateWordpackContent() {
            $("#wordpack-content").val(wordpacks.getRaw($("#wordpack-view-select").val()));
            $("#delete-wordpack").prop("disabled", !wordpacks.get($("#wordpack-view-select").val()));
            updateWordpackCornerButtons();
        }
        updateWordpackContent();
        $("#wordpack-view-select").on("change", updateWordpackContent);

        // Corner buttons
        function updateWordpackCornerButtons() {
            const selectedWordpack = $("#wordpack-view-select").val();
            $("#wordpack-corner-buttons").toggleClass("d-none", !selectedWordpack);
            if (selectedWordpack) {
                $("#wordpack-corner-buttons button[name='reset']").toggleClass("d-none", !wordpacks.isDefault(selectedWordpack));
                $("#wordpack-corner-buttons button[name='reset']").prop("disabled", !wordpacks.isDefaultModified(selectedWordpack));
                $("#wordpack-corner-buttons button[name='reset'] + button").toggleClass("rounded-start", !wordpacks.isDefault(selectedWordpack));
            }
        }
        function animateSuccess(button) {
            $(button).addClass("btn-outline-success");
            setTimeout(() => $(button).removeClass("btn-outline-success"), 500);
        }
        $("#wordpack-corner-buttons button[name='reset']").on("click", function () {
            wordpacks.set($("#wordpack-view-select").val(), wordpacks.getDefault($("#wordpack-view-select").val()));
            animateSuccess(this);
            updateWordpackContent();
        });
        $("#wordpack-corner-buttons button[name='link']").on("click", function () {
            const link = `${window.location.origin}/?share-wordpack=${compressUrlSafe($("#wordpack-view-select").val())}`;
            // TODO actually make this link work
            navigator.clipboard.writeText(link).then(() => animateSuccess(this))
        });
        $("#wordpack-corner-buttons button[name='copy']").on("click", function () {
            navigator.clipboard.writeText($("#wordpack-content").val()).then(() => animateSuccess(this))
        });
        $("#wordpack-corner-buttons button[name='download']").on("click", function () {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([$("#wordpack-content").val()], { type: "text/plain" }));
            a.download = `${$("#wordpack-view-select").val()}.txt`;
            a.click();
            animateSuccess(this);
        });

        // Save modifications to the wordpack content
        let typingTimer;
        const doneTypingInterval = 300;
        $("#wordpack-content").on("input", function () {
            wordpacks.set($("#wordpack-view-select").val(), $("#wordpack-content").val());
            updateWordpackCornerButtons();

            // Only show the save icon after the user has stopped typing
            clearTimeout(typingTimer);
            typingTimer = setTimeout(function () {
                if ($("#save-icon").css("display") == "none") { // Only animate if it's not already visible
                    $("#save-icon").fadeIn(0).fadeOut(1000);
                }
            }, doneTypingInterval);
        });

        // New wordpack popover
        $('#new-wordpack-popover').on('show.bs.modal', function () {
            $('#new-wordpack-base-on').val($("#wordpack-view-select").val()).selectpicker('refresh');
        });
        function validateWordpackName(form) {
            const el = $(form).find("[name='wordpack-name']");
            const invalidFeedback = el.siblings('.invalid-feedback')
            invalidFeedback.text("");
            let isValid = true;
            if (!$(form)[0].checkValidity()) {
                $(form).find(":invalid").addClass('is-invalid');
                isValid = false;
            }
            const name = el.val();
            if (name.endsWith("+")) {
                invalidFeedback.text("Wordpack names cannot end with a plus sign.");
                el.addClass('is-invalid');
                isValid = false;
            }
            if (wordpacks.get(name)) {
                invalidFeedback.text(`A wordpack with the name "${name}" already exists.`);
                el.addClass('is-invalid');
                isValid = false;
            }
            invalidFeedback.toggleClass('d-none', invalidFeedback.text() == "");
            return isValid ? name : false;
        }
        $('#new-wordpack-popover form').on('submit', function () {
            // Validation
            const name = validateWordpackName(this);
            if (!name) return false;

            // Create the new wordpack and clear fields
            const baseOn = $("#new-wordpack-base-on").val();
            wordpacks.set(name, baseOn ? wordpacks.getRaw(baseOn) : "");
            $(this).find("[name='wordpack-name']").removeClass("is-invalid").val("");
            $("#new-wordpack-base-on").val("").selectpicker("refresh");

            updateWordpackSelects();
            $('#wordpack-view-select').val(name).selectpicker("refresh");
            updateWordpackContent();

            $('#new-wordpack-popover').popoverX('hide');
            return false;
        });

        // Import wordpack popover
        function parseName(filename) { return filename.replace(/\..+$/, ""); }
        $('#import-wordpack-popover form [name="wordpack-file"]').on("change", function () {
            const names = Array.from($(this).prop("files")).map(file => parseName(file.name));
            const overwriteCheckbox = $("#import-wordpack-overwrite-checkbox");
            overwriteCheckbox.prop("checked", false);
            const existingNames = names.filter(name => wordpacks.get(name));
            overwriteCheckbox.parent().toggleClass("invisible", existingNames.length == 0);
            $("label[for='import-wordpack-overwrite-checkbox'] span").text(`"${existingNames.join('", "')}"`);
        });
        function readFile(file) {
            return new Promise(function (resolve, reject) {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader);
                reader.readAsText(file);
            });
        }
        $('#import-wordpack-popover form').on('submit', function () {
            // File reading is async but we need to return false immediately to prevent form submission, so we have an inner async wrapper
            (async () => {
                // Read files
                const files = Array.from($(this).find("[name='wordpack-file']").prop("files"));
                const names = files.map(file => parseName(file.name));
                const fileContents = await Promise.all(files.map(readFile));

                // Create wordpacks, handling duplicate names
                let name;
                for (let i = 0; i < names.length; i++) {
                    name = names[i];
                    if (!$(this).find("#import-wordpack-overwrite-checkbox").prop("checked")) {
                        while (wordpacks.get(name)) {
                            const regex = / \((\d+)\)$/;
                            const match = regex.exec(name);
                            const copyNum = match ? parseInt(match[1]) + 1 : 2;
                            name = `${name.replace(regex, "")} (${copyNum})`;
                        }
                    }
                    wordpacks.set(name, fileContents[i]);
                }

                // Clear fields
                $(this).find("[name='wordpack-file']").val(null).change(); // Trigger the change event so the overwrite checkbox is handled

                updateWordpackSelects();
                $('#wordpack-view-select').val(name).selectpicker("refresh"); // Set to last imported wordpack
                updateWordpackContent();

                $('#import-wordpack-popover').popoverX('hide');
            })();
            return false;
        });

        // When an invalid form element is changed, remove the invalid styles (though it might still be invalid when Generate is clicked again)
        $("#generator-form").on("change", ".is-invalid", function () {
            $(this).find(".is-invalid").addBack(".is-invalid").removeClass("is-invalid");
        });

        // Delete wordpack button
        $("#delete-wordpack").on("click", () => {
            const select = $("#wordpack-view-select");
            bootbox.confirm(`Are you sure you want to delete the wordpack "${select.val()}"?`, (confirmed) => {
                if (!confirmed) return;
                wordpacks.remove(select.val());
                updateWordpackSelects();
                updateWordpackContent();
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
                const setElem = $(setClone).find('.set'); // Save a reference to the element, since adding the document fragment to the page makes interacting with it weird
                $('#set-container').append(setClone);
                // Header
                setElem.toggleClass('border', preset.sets.length > 1);
                setElem.find('.set-header').toggleClass('d-none', !(preset.sets.length > 1));
                setElem.find('[name="set_name"]').attr("placeholder", `Player ${i + 1}`);
                // Add all group clones first so we can update their wordpack selects
                const groupElems = set.groups.map(() => {
                    const groupClone = $('#group-template').prop('content').cloneNode(true);
                    const groupElem = $(groupClone).find('.group');
                    setElem.find('.group-container').append(groupClone);
                    return groupElem;
                });
                updateWordpackSelects();
                // Now populate values
                for (let i = 0; i < set.groups.length; i++) {
                    const group = set.groups[i];
                    const groupElem = groupElems[i];
                    groupElem.find('[name="num_words"]').val(group.num_words);
                    groupElem.find('[name="wordpacks"]').val(group.wordpacks).selectpicker("refresh");
                    if (set.groups.length > 1) groupElem.find('.delete-group').removeClass('invisible');
                }
                setElem.find('[name="players"]').val(set.players);
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
                wordpacks: wordpacks.getWordpacksFor(sets)
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
            $("#generator-output-container").fadeIn(100);
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
