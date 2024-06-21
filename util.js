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
        `<div class="d-flex document-browser" id="${id}">
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


/**
 * Clone an object, replacing all leaf nodes with the blank string.
 * @param {object} obj The object to clone
 * @returns {object} The cloned object
 */
function cloneStructure(obj) {
    const cleanObj = JSON.parse(JSON.stringify(obj)); // Destroy any weird objects (e.g. Sets)
    return JSON.parse(JSON.stringify(cleanObj, (key, value) => { // Set all leaf nodes to the blank string
        if (typeof value !== 'object' && !Array.isArray(value)) return "";
        return value;
    }));
}
/**
 * Check if two objects have the same structure, ignoring leaf node values.
 * @param {object} obj1 The first object
 * @param {object} obj2 The second object
 * @returns {boolean} Whether the objects have the same structure
 */
function areStructuresEqual(obj1, obj2) {
    return _.isEqual(cloneStructure(obj1), cloneStructure(obj2));
}

/**
 * Clone one object to another, overwriting it.
 * Used for when you need to preserve the target object instead of creating a new one. (i.e. for proxies)
 * Ignores properties that start with "__".
 * @param {object} target The target object
 * @param {object} source The source object
 * @returns {object} The target object
 */
function overwrite(target, source) {
    Object.getOwnPropertyNames(target).filter(p => !p.startsWith("__")).forEach(p => delete target[p]);
    Object.assign(target, JSON.parse(JSON.stringify(source)));
    return target;
}

/**
 * Read a file as text.
 * @param {File} file The file to read
 * @returns {Promise<string>} The file's text
 */
function readFile(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader);
        reader.readAsText(file);
    });
}


/**
 * A replacer to be passed to JSON.stringify to replace errors with their string representation
 */
function errorJSONreplacer(key, value) {
    if (value instanceof Error) {
        return Object.fromEntries(Object.getOwnPropertyNames(value).map(propName => [propName, value[propName]]));
    }
    return value;
}