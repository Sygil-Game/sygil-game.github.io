const PREFIX = "sygil_"; // For localStorage keys


const syncTo = (storage, key, defaultValue = {}) => {
    key = `${PREFIX}${key}`;
    const initialValue = storage.getItem(key) !== null ? JSON.parse(storage.getItem(key)) : defaultValue;
    return ObservableSlim.create(initialValue, true, changes => storage.setItem(key, JSON.stringify(initialValue)));
};
/**
 * Keep an object in sync with localStorage, stringifying it and updating it whenever it's changed.
 * @param {string} key The key to use for the object in localStorage
 * @param {object} obj The object to sync to localStorage
 */
const syncToLocalStorage = (key, defaultValue = {}) => syncTo(localStorage, key, defaultValue);
/**
 * Keep an object in sync with localStorage, stringifying it and updating it whenever it's changed.
 * @param {string} key The key to use for the object in localStorage
 * @param {object} obj The object to sync to localStorage
 */
const syncToSessionStorage = (key, defaultValue = {}) => syncTo(sessionStorage, key, defaultValue);


// Clone of jQuery's serializeArray that groups by fieldset and includes blank fields (particularly empty multiselects).
// Call it on the form element (or anything that contains the fieldsets).
// Adapted from https://github.com/jquery/jquery/blob/74970524e5e164c72ec0415267b1e057280c9455/src/serialize.js
jQuery.fn.extend({
    serializeFieldsets: function () {
        var
            rCRLF = /\r?\n/g,
            rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
            rsubmittable = /^(?:input|select|textarea|keygen)/i;

        return this.find("fieldset").get().map(fieldset =>
            jQuery(fieldset).find("*[name]").filter(function () {
                var type = this.type;

                // Use .is( ":disabled" ) so that fieldset[disabled] works
                return this.name && !jQuery(this).is(":disabled") &&
                    rsubmittable.test(this.nodeName) && !rsubmitterTypes.test(type);
            }).get().map(elem => {
                var val = jQuery(elem).val();
                if (Array.isArray(val)) return { name: elem.name, value: val.map(val => val?.replace(rCRLF, "\r\n")) };
                return { name: elem.name, value: val?.replace(rCRLF, "\r\n") };
            })
        );
    }
});

// Helper to run a function whenever new nodes matching a selector are added to the DOM
function whenAdded(selector, callback) {
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes) mutation.addedNodes.forEach(node => {
                $(node).find(selector).addBack(selector).each(callback);
            });
        });
    });
    observer.observe(document, { childList: true, subtree: true });
    $(document.body).find(selector).addBack(selector).each(callback);
    return observer;
}

// Clear all input children
jQuery.fn.extend({
    clearInputs: function () {
        jQuery(this).find(':input').each(function () {
            switch (this.type) {
                case 'password':
                case 'text':
                case 'textarea':
                case 'file':
                case 'select-one':
                case 'select-multiple':
                case 'date':
                case 'number':
                case 'tel':
                case 'email':
                    jQuery(this).val('');
                    break;
                case 'checkbox':
                case 'radio':
                    this.checked = false;
                    break;
            }
            jQuery(this).selectpicker("refresh"); // Refresh selectpicker if present; if not this does nothing
            jQuery(this).removeClass(["is-invalid", "is-valid"]);
            jQuery(this).trigger("change");
        });
    }
});

function createDocumentBrowser(data, existing = []) {
    if (new Set(data.map(tab => tab.name)).size !== data.length) {
        throw new Error("Tab names must be unique.");
    }

    const id = `document-browser-${existing.length ? existing.prop("id") : crypto.randomUUID()}`;
    const $component = $(
        `<div class="d-flex h-100 document-browser" id="${id}">
    <div class="nav flex-column nav-tabs flex-nowrap overflow-scroll" role="tablist"></div>
    <div class="tab-content flex-grow-1 p-0"></div>
</div>`);

    let groups = [...new Set(data.map(tab => tab.group ?? ""))];
    if (groups.includes("")) groups = [""].concat(groups.filter(group => group !== "")); // If there's an empty group, move it to the front
    const groupFragments = {};
    data.forEach((tab, index) => {
        const $button = $(`<button class="nav-link" data-bs-toggle="tab" type="button" role="tab" data-bs-target="#${id} .tab-pane[data-tab-name='${tab.name}']" data-tab-name="${tab.name}">${tab.name}</button>`);
        const $content = $(`<div class="tab-pane h-100" role="tabpanel" data-tab-name="${tab.name}"><textarea class="form-control w-100 h-100 rounded-0" name="wordpack-content" required>${tab.content}</textarea></div>`);

        const group = tab.group ?? "";
        if (!groupFragments[group]) {
            groupFragments[group] = {
                buttons: $(document.createDocumentFragment()),
                contents: $(document.createDocumentFragment())
            };
            if (groups.length > 1 && group) {
                const $groupHeader = $(`<span class="user-select-none tab-group-header mt-3 mb-1" data-tab-group-name="${group}">${group}</span>`);
                groupFragments[group].buttons.append($groupHeader);
            }
        }
        groupFragments[group].buttons.append($button);
        groupFragments[group].contents.append($content);
    });

    groups.forEach(group => {
        $component.find('.nav').append(groupFragments[group].buttons);
        $component.find('.tab-content').append(groupFragments[group].contents);
    });

    $component.find('.nav-link').first().addClass('active');
    $component.find('.tab-pane').first().addClass('active show');

    if (existing.length) existing.replaceWith($component);
    return $component;
}


const testCases = [
    [ // 1. Two empty objects
        {},
        {},
        true
    ],
    [ // 2. Simple objects with same key
        { a: 1 },
        { a: 2 },
        true],
    [ // 3. Simple objects with different keys
        { a: 1 },
        { b: 2 },
        false],
    [ // 4. Nested objects with same structure
        { a: { b: 2 } },
        { a: { b: 3 } },
        true],
    [ // 5. Nested objects with different structure
        { a: { b: 2 } },
        { a: { c: 3 } },
        false],
    [ // 6. Simple arrays
        [1, 2],
        [3, 4],
        true],
    [ // 7. Arrays with objects
        [{ a: 1 }],
        [{ a: 2 }],
        true],
    [ // 8. Arrays with objects with different keys
        [{ a: 1 }],
        [{ b: 2 }],
        false],
    [ // 9. Objects with arrays
        { a: [1, 2] },
        { a: [3, 4] },
        true],
    [ // 10. Different order
        { a: [1, { b: 2 }] },
        { a: [{ b: 4 }, 3] },
        false],
    [ // 11. Different number of keys
        { a: { b: [1, { c: 3 }, 4] } },
        { a: { b: [2, { c: 4, d: 6 }, 5] } },
        false],
    [ // 12. Different array lengths
        { a: [{ b: { c: 1 } }, 2] },
        { a: [{ b: { c: 2 } }, 3, 4] },
        false],
    [ // 13. Empty arrays
        { a: { b: [1, { c: { d: [] } }, 4] } },
        { a: { b: [2, { c: { d: [] } }, 5] } },
        true],
    [ // 14. Empty objects
        { a: [1, { b: [2, { c: 3, d: {} }] }, 4] },
        { a: [5, { b: [6, { c: 7, d: {} }] }, 8] },
        true],
    [ // 15. Complex nested arrays and objects with multiple levels
        { a: [{ b: { c: [1, 2] } }, { d: { e: [3, 4] } }] },
        { a: [{ b: { c: [5, 6] } }, { d: { e: [7, 8] } }] },
        true
    ]
];

function cloneStructure(obj) {
    const clone = JSON.parse(JSON.stringify(obj)); // Destroy any weird objects (e.g. Sets)
    return JSON.parse(JSON.stringify(clone, (key, value) => { // Set all leaf nodes to the blank string
        if (typeof value !== 'object' && !Array.isArray(value)) return "";
        return value;
    }));
}
function areStructuresEqual(obj1, obj2) {
    return _.isEqual(cloneStructure(obj1), cloneStructure(obj2));
}

for (let i = 0; i < testCases.length; i++) {
    if (areStructuresEqual(testCases[i][0], testCases[i][1]) !== testCases[i][2]) {
        console.log(`Test case ${i + 1} FAILED`);
    } else {
        console.log(`${i + 1} passed`);
    }
}