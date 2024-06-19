import { compressUrlSafe, decompressUrlSafe } from './lib/lzma-url.mjs'


// Disable initial animations for state restore
document.documentElement.classList.add('no-transition');
$(document).ready(function () { setTimeout(() => { document.documentElement.classList.remove('no-transition'); }, 10); });


// Dark mode
// Some of the logic  must be run before the document is ready to avoid flicker
const darkMode = syncToLocalStorage('darkModeStatus', { 'value': true });
const renderDarkMode = (bool) => document.documentElement.setAttribute('data-bs-theme', bool ? 'dark' : 'light');
renderDarkMode(darkMode.value);
$(document).ready(function () {
    $('#darkModeToggle').prop('checked', darkMode.value).on('change', function () {
        renderDarkMode(darkMode.value = this.checked);
    });
});


$(document).ready(function () {
    // Save current tab in sessionStorage
    const storedTab = syncToSessionStorage('currentTab', { 'value': null });
    if (storedTab.value) $(`.nav-tabs a[href="${storedTab.value}"]`).tab('show');
    $("#tabs [data-bs-toggle='tab']").on('shown.bs.tab', function () { storedTab.value = $(this).attr('href'); });

    // Set selectpicker defaults
    $.fn.selectpicker.Constructor.DEFAULTS.liveSearch = true;
    $.fn.selectpicker.Constructor.DEFAULTS.styleBase = 'form-control';

    // Replace all instances of 'Sygil(s)' with stylized spans
    function replaceSygil(rootNode) {
        const regex = /(Sygils?)/g;
        const selector = ":not(.sygil):not(input):not(textarea)" // We don't want to edit the contents of input elements
        $(rootNode).find(selector + ":not(iframe)").addBack(selector).contents() // Allegedly iframes cause a jQuery bug with contents()
            .filter(function () { return this.nodeType === Node.TEXT_NODE && regex.test(this.nodeValue); })
            .each(function () {
                const fragment = document.createDocumentFragment(); // Document fragment to hold the new nodes
                this.nodeValue.split(regex).forEach((part, i) => {
                    // Even entries are the text around the "Sygil(s)"
                    if (i % 2 == 0 && part) fragment.appendChild(document.createTextNode(part)); // Don't add empty text nodes
                    // Odd entries are the "Sygil(s)"
                    if (i % 2 == 1) fragment.appendChild($('<span>', { class: 'sygil', text: part })[0]);
                });
                this.parentNode.replaceChild(fragment, this);
            });
    }
    replaceSygil(document.body);
    (new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes) mutation.addedNodes.forEach(replaceSygil);
        });
    })).observe(document, { childList: true, subtree: true });

    // Autofocus on the first input in a modal or popover
    $(document).on('shown.bs.modal', '.modal, .popover', function () { $(this).find('input:text:visible:first').focus(); });

    // Initialize tooltips
    whenAdded('[data-bs-toggle="tooltip"]', function () { new bootstrap.Tooltip(this); });
});

// Async code that depends on fetched resources
$(document).ready(async function () {
    /* Wordpacks */

    // Fetch wordpacks
    const defaultWordpackNames = (await fetch('/static/wordpacks/wordpacks.json').then(response => response.json()))
        .wordpacks.filter(name => !(name in wordpacks.getAll(false)));
    (await Promise.all(defaultWordpackNames.map(async wordpackName => {
        const response = await fetch(`/static/wordpacks/${wordpackName}.txt`);
        return [wordpackName, await response.text()];
    }))).forEach(([name, rawText]) => wordpacks.setDefault(name, rawText)); // In 2 steps to preserve order

    // Initialize wordpack selects whenever they're added
    whenAdded('select.wordpack-select:not(.wordpack-select-initialized)', function () {
        $(this).addClass('wordpack-select-initialized'); // Make sure we don't double-dip
        $(this).selectpicker({
            noneSelectedText: "Select a wordpack",
            noneResultsText: 'No wordpacks found matching "{0}"',
        });
        populateWordpackSelects(this);
    });

    // Add clear buttons to select pickers (only once initialized)
    whenAdded('.bootstrap-select select.select-picker-clear', function () {
        const clearButton = $('#select-picker-clear-template').prop('content').cloneNode(true);
        $(clearButton).find('button').on('click', () => $(this).val("").selectpicker('refresh').trigger("change"));
        $(this).parent().append(clearButton);
    });

    // To be run whenever the available wordpacks change.
    // Adds options to all wordpack selects and rebuilds the wordpack document browser.
    // If root is provided, only updates the selects within that root element and doesn't rebuild the wordpack document browser.
    function populateWordpackSelects(root = null) {
        const newHTML = Object.keys(wordpacks.getAll()).map(name => `<option>${name}</option>`);
        const newHTMLNoExtended = Object.keys(wordpacks.getAll(false)).map(name => `<option>${name}</option>`);
        $(root ?? document).find("select.wordpack-select").addBack("select.preset-select").each(function () {
            const val = $(this).val(); // Save val and restore it (since we're temporarily nuking all the options)
            if ($(this).hasClass('wordpack-select-no-extended')) $(this).empty().append(newHTMLNoExtended);
            else $(this).empty().append(newHTML);
            $(this).val(val).selectpicker('refresh');
        });
        if (!root) rebuildWordpackDocumentBrowser();
    }
    populateWordpackSelects();
    wordpacks.onChange((_, reason) => { if (reason != "textarea_edit") populateWordpackSelects(); }); // Don't rebuild things if wordpacks only changed because the user typed something in the textarea

    // Select the first wordpack by default in the wordpack view select
    $("#wordpack-view-select").val($("#wordpack-view-select option").first().val()).selectpicker("refresh");
    // When a user changes the wordpack view select, switch to the appropriate tab
    $("#wordpack-view-select").on("change", function () {
        $("#wordpacks .document-browser .nav-link[data-tab-name='" + $(this).val() + "']").tab("show");
    });
    // When a tab is shown, update the wordpack view select and corner buttons
    $("#wordpacks").on("shown.bs.tab", ".nav-link", function () {
        $("#wordpack-view-select").val($(this).data("tab-name")).selectpicker("refresh");
        updateWordpackCornerButtons();
    });

    // Create the wordpack document browser
    function rebuildWordpackDocumentBrowser() {
        const component = createDocumentBrowser(Object.keys(wordpacks.getAll(false)).map(name => ({ name, content: wordpacks.getRaw(name) })));
        if ($("#wordpacks .document-browser").length) {
            const selectedTab = $("#wordpacks .document-browser .nav-link.active").data("tab-name");
            $("#wordpacks .document-browser").replaceWith(component);
            if (component.find(`.nav-link[data-tab-name="${selectedTab}"]`).length) {
                component.find(`.nav-link[data-tab-name="${selectedTab}"]`).tab("show");
            }
        } else {
            component.appendTo($("#wordpacks"));
        }
        $("#wordpacks .nav-link.active").trigger("shown.bs.tab"); // Trigger the shown-tab event for the first tab shown so it updates the select and corner buttons
        $('#wordpacks .document-browser').css('height', `calc(100vh - ${$('#wordpacks .document-browser').offset().top}px - 40px)`);
        return component;
    }
    rebuildWordpackDocumentBrowser();

    // Corner buttons
    function updateWordpackCornerButtons() {
        const selectedWordpack = $("#wordpack-view-select").val();
        $("#wordpack-corner-buttons").toggleClass("d-none", !selectedWordpack);
        if (selectedWordpack) {
            $("#wordpack-corner-buttons button[name='reset']").toggleClass("d-none", !wordpacks.isDefault(selectedWordpack));
            $("#wordpack-corner-buttons button[name='reset']").prop("disabled", !wordpacks.isDefaultModified(selectedWordpack));
            $("#wordpack-corner-buttons button[name='reset'] + div > button").toggleClass("rounded-start", !wordpacks.isDefault(selectedWordpack));
            $("#wordpack-corner-buttons button[name='delete']").toggle(!wordpacks.isDefault(selectedWordpack)); // Hide the delete button for default wordpacks
        }
    }
    $("#wordpack-corner-buttons button[name='reset']").on("click", function () {
        wordpacks.set($("#wordpack-view-select").val(), wordpacks.getDefault($("#wordpack-view-select").val()));
    });

    // Sets up functionality for all buttons in an export dropdown (e.g. copy link, download)
    // Used for both wordpacks and presets
    function handleItemButtons({ groupName, root, manager, select, getCurrentContent, getAll, filetype }) {
        $(root).find("button[name='link']").on("click", function () {
            const shareData = [{
                name: $(select).val(),
                content: getCurrentContent(),
                group: groupName
            }];
            const link = `${window.location.origin}/?share=${compressUrlSafe(JSON.stringify(shareData))}`;
            navigator.clipboard.writeText(link);
        });
        $(root).find("button[name='copy']").on("click", function () {
            navigator.clipboard.writeText(getCurrentContent());
        });
        $(root).find("button[name='download']").on("click", function () {
            saveAs(new Blob([getCurrentContent()], { type: "text/plain" }),
                `${$(select).val()}.${filetype}`);
        });
        $(root).find("button[name='delete']").on("click", () => {
            bootbox.confirm(`Are you sure you want to delete the ${groupName.toLowerCase().replace(/s$/, "")} "${$(select).val()}"?`, (confirmed) => {
                if (!confirmed) return;
                manager.remove($(select).val());
            });
        });
        $(root).find("button[name='link-all']").on("click", () => {
            const shareData = Object.entries(getAll())
                .map(([name, content]) => ({
                    name: name,
                    content: content,
                    group: groupName
                }));
            if (shareData.length == 0) {
                bootbox.alert(`No ${groupName.toLowerCase()} to share.`);
                return;
            }
            const link = `${window.location.origin}/?share=${compressUrlSafe(JSON.stringify(shareData))}`;
            navigator.clipboard.writeText(link);
        });
        $(root).find("button[name='download-all']").on("click", () => {
            const zip = new JSZip();
            Object.entries(getAll()).forEach(([name, content]) => zip.file(`${name}.${filetype}`, content));
            zip.generateAsync({ type: "blob" }).then(content => saveAs(content, `${groupName}.zip`));
        });
    }

    handleItemButtons({
        groupName: "Wordpacks",
        root: $("#wordpack-corner-buttons"),
        manager: wordpacks,
        select: $("#wordpack-view-select"),
        getCurrentContent: () => $("#wordpacks .document-browser .tab-pane.show textarea").val(),
        getAll: () => Object.fromEntries(Object.keys(wordpacks.getAll(false))
            .filter(name => !wordpacks.isDefault(name) || wordpacks.isDefaultModified(name))
            .map(name => [name, wordpacks.getRaw(name)])),
        filetype: "txt"
    });

    handleItemButtons({
        groupName: "Presets",
        root: $("#generator-preset-bar"),
        manager: presets,
        select: $("#generator-preset-select"),
        getCurrentContent: () => JSON.stringify(presets.get($("#generator-preset-select").val())),
        getAll: () => Object.fromEntries(Object.entries(presets.getAll())
            .filter(([name, content]) => !presets.isDefault(name))
            .map(([name, content]) => [name, JSON.stringify(content)])),
        filetype: "json"
    });

    // Save modifications to the wordpack content
    let typingTimer;
    const doneTypingInterval = 300;
    $("#wordpacks").on("input", ".document-browser .tab-pane.active textarea", function () {
        wordpacks.set($("#wordpack-view-select").val(), $("#wordpacks .document-browser .tab-pane.show textarea").val(), "textarea_edit");
        updateWordpackCornerButtons(); // Editing a default wordpack might cause the reset button to be enabled/disabled

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

        // Create the new wordpack
        const baseOn = $("#new-wordpack-base-on").val();
        wordpacks.set(name, baseOn ? wordpacks.getRaw(baseOn) : "");

        $(this).clearInputs();
        $('#wordpack-view-select').val(name).selectpicker("refresh").trigger("change"); // Trigger change so the tab changes

        $('#new-wordpack-popover').popoverX('hide');
        return false;
    });

    // Import wordpack popover
    function parseName(filename) { return filename.replace(/\..+$/, ""); }
    $('#import-wordpack-popover form [name="wordpack-file"]').on("change", function () {
        const names = Array.from($(this).prop("files")).map(file => parseName(file.name));
        const overwriteCheckbox = $("#import-wordpack-overwrite-checkbox");
        overwriteCheckbox.prop("checked", false);
        const invalidNames = names.filter(name => name.endsWith("+"));
        const existingNames = names.filter(name => wordpacks.get(name));

        if (invalidNames.length > 0) {
            bootbox.alert(`Wordpack names cannot end with a plus sign: "${invalidNames.join('", "')}"`);
            $(this).val(''); // Clear the file input
            overwriteCheckbox.parent().addClass("invisible");
        } else {
            overwriteCheckbox.parent().toggleClass("invisible", existingNames.length == 0);
            $("label[for='import-wordpack-overwrite-checkbox'] span").text(`"${existingNames.join('", "')}"`);
        }
    });

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

            $(this).clearInputs();
            $('#wordpack-view-select').val(name).selectpicker("refresh").trigger("change"); // Set to last imported wordpack

            $('#import-wordpack-popover').popoverX('hide');
        })();
        return false;
    });

    /* Presets */
    // Get default presets
    await fetch('static/presets.json')
        .then(response => response.json())
        .then(defaultPresets => defaultPresets.forEach(preset => presets.setDefault(preset)));

    // Initialize preset selects whenever they're added
    whenAdded('select.preset-select:not(.preset-select-initialized)', function () {
        $(this).addClass('preset-select-initialized'); // Make sure we don't double-dip
        $(this).selectpicker({
            noneSelectedText: "Select a preset",
            noneResultsText: 'No presets found matching "{0}"',
        });
    });

    // Add presets to preset select dropdown
    function populatePresetSelects() {
        const newHTML = Object.keys(presets.getAll()).map(name => `<option>${name}</option>`);
        $("select.preset-select").each(function () {
            const val = $(this).val(); // Save val and restore it (since we're temporarily nuking all the options)
            $(this).empty().append(newHTML);
            $(this).val(val).selectpicker('refresh');
        });
    }
    populatePresetSelects();
    presets.onChange(populatePresetSelects);

    // Load presets into the generator when selected
    $("#generator-preset-select").on("changed.bs.select", function () {
        if ($(this).val() && generator_input.name !== $(this).val()) { // Don't double-dip (since loading a preset also changes the select picker)
            overwrite(generator_input, presets.get($(this).val()));
            renderGenerator();
        }
    });

    // Handle hiding of delete preset button for default presets
    function updateDeletePresetButton() {
        const val = $("#generator-preset-select").val();
        $("#generator-preset-bar button[name='delete']").toggle(val && !presets.isDefault(val));
    }
    updateDeletePresetButton();
    presets.onChange(updateDeletePresetButton);
    $("#generator-preset-select").on("changed.bs.select", updateDeletePresetButton);
    $("#delete-preset").on("click", () => {
        const select = $("#generator-preset-select");
        bootbox.confirm(`Are you sure you want to delete the preset "${select.val()}"?`, (confirmed) => {
            if (!confirmed) return;
            presets.remove(select.val());
        });
    });

    /* Generator */
    const generator_input = syncToLocalStorage("generator_input", presets.get("Default"));
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
    if (urlParams.has('share')) {
        const shareData = JSON.parse(decompressUrlSafe(urlParams.get('share')));
        const component = createDocumentBrowser(shareData).addClass('h-100');
        component.find('textarea').prop('disabled', true);
        let hasDuplicates = false;
        component.find('.nav-link').each(function () {
            const tabName = $(this).data('tab-name');
            if (wordpacks.get(tabName)) {
                $(this).addClass('nav-link-danger');
                hasDuplicates = true;
            }
        });
        $("#importWordpackModal .duplicate-warning").toggle(hasDuplicates);
        component.appendTo($('#importWordpackModal .modal-body'));
        $('#importWordpackModal').modal('show');
        $('#importWordpackModal form').on('submit', function () {
            shareData.forEach(({ name, content }) => wordpacks.setDefault(name, content));
            $('#importWordpackModal').modal('hide');
            return false;
        });

        // Remove the share parameter from the URL when the modal is closed
        $('#importWordpackModal').on('hidden.bs.modal', function () {
            const url = new URL(window.location);
            url.searchParams.delete('share');
            window.history.pushState({}, "", url.toString());
        });
    }

    // Initialize generator output options
    $("#alphabetize").prop("checked", generator_output["options"]["alphabetize"]);
    $("#one-line").prop("checked", generator_output["options"]["oneLine"]);
    $("#group-by-wordpack").prop("checked", generator_output["options"]["groupByWordpack"]);

    // Turn generator_input into the generator form HTML
    async function renderGenerator() {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < generator_input.sets.length; i++) {
            const set = generator_input.sets[i];
            const setClone = $('#set-template').prop('content').cloneNode(true);
            const setElem = $(setClone).find('.set');
            // Header
            setElem.toggleClass('border', generator_input.sets.length > 1);
            setElem.find('.set-header').toggleClass('d-none', !(generator_input.sets.length > 1));
            setElem.find('[name="set_name"]').attr("placeholder", `Player ${i + 1}`).val(set.name);
            // Groups
            for (const group of set.groups) {
                const groupClone = $('#group-template').prop('content').cloneNode(true);
                const groupElem = $(groupClone).find('.group');
                populateWordpackSelects(groupElem);
                groupElem.find('[name="num_words"]').val(group.num_words);
                groupElem.find('[name="wordpacks"]').val(group.wordpacks).selectpicker("refresh");
                if (set.groups.length > 1) groupElem.find('.delete-group').removeClass('invisible');
                setElem.find('.group-container').append(groupClone);
            }
            setElem.find('[name="players"]').val(set.players);
            fragment.append(setClone);
        }
        $('#set-container').empty().append(fragment);
        updateGeneratorInput(); // Read the data back from the form, which handles things like the preset select and included wordpacks
    }
    await renderGenerator();

    // Show the generator output as markdown
    let markdown = "";
    function renderGeneratorOutput() {
        markdown = renderOutput(generator_output);
        $("#generator-output").empty().append(`<md-block>${markdown}</md-block>`);
    }

    // Convert the current form data to a preset
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
    // Update the generator input from the form
    function updateGeneratorInput() {
        const sets = getPresetFromForm();
        overwrite(generator_input, {
            name: Object.values(presets.getAll()).find(preset => _.isEqual(preset.sets, sets))?.name,
            schema_version: CURRENT_SCHEMA_VERSION,
            sets: sets,
            wordpacks: wordpacks.getWordpacksFor(sets)
        });
        $("#generator-preset-select").val(generator_input.name).selectpicker("refresh");
        updateDeletePresetButton(); // Must be called manually because the above change doesn't trigger a change event
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
        renderGeneratorOutput();
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
        renderGeneratorOutput();
    });
    // Show output if initially loaded from localStorage
    if (generator_output["output"] && generator_output["output"].length > 0) {
        renderGeneratorOutput();
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
        return async function () { // Helper to locate set/group indices and update generator
            callback($(this).closest(".set").index(), $(this).closest(".group").index());
            await renderGenerator(); // Needs to finish first, since messing with the generator input while this runs causes race conditions
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

    $("#new-preset-modal").on("show.bs.modal", function () {
        $("#new-preset-modal-codeblock").text(JSON.stringify(generator_input, null, 2));
    });

    $("form:has(#new-preset-modal)").on('submit', function () {
        return false;
    });

    $('form:has(#upload-preset-modal) [name="preset-file"]').on("change", async function () {
        const names = await Promise.all(Array.from($(this).prop("files")).map(readFile)).then(contents => contents.map(JSON.parse).map(preset => preset.name));
        const overwriteCheckbox = $("#upload-preset-overwrite-checkbox");
        overwriteCheckbox.prop("checked", false);
        const existingNames = names.filter(name => presets.get(name));
        overwriteCheckbox.parent().toggleClass("invisible", existingNames.length == 0);
        $("label[for='upload-preset-overwrite-checkbox'] span").text(`"${existingNames.join('", "')}"`);
    });

    $('form:has(#upload-preset-modal)').on('submit', function () {
        // File reading is async but we need to return false immediately to prevent form submission, so we have an inner async wrapper
        (async () => {
            // Read files
            const files = Array.from($(this).find("[name='preset-file']").prop("files"));
            const newPresets = await Promise.all(files.map(readFile)).then(contents => contents.map(JSON.parse));

            // Create presets, handling duplicate names
            for (const preset of newPresets) {
                if (!$(this).find("#upload-preset-overwrite-checkbox").prop("checked")) {
                    while (presets.get(preset.name)) {
                        const regex = / \((\d+)\)$/;
                        const match = regex.exec(preset.name);
                        const copyNum = match ? parseInt(match[1]) + 1 : 2;
                        preset.name = `${preset.name.replace(regex, "")} (${copyNum})`;
                    }
                }
                presets.set(preset);
            }

            $(this).clearInputs();
            $('#generator-preset-select').val(newPresets[newPresets.length - 1].name).selectpicker("refresh").trigger("change"); // Set to last imported preset

            $('#upload-preset-modal').popoverX('hide');
        })();
        return false;
    });
});
