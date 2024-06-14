const PREFIX = "sygil_"; // For localStorage keys

/**
 * Keep an object in sync with localStorage, stringifying it and updating it whenever it's changed.
 * @param {string} key The key to use for the object in localStorage
 * @param {object} obj The object to sync to localStorage
 */
const syncToLocalStorage = (key, defaultValue = {}) => {
    key = `${PREFIX}${key}`;
    const initialValue = localStorage.getItem(key) !== null ? JSON.parse(localStorage.getItem(key)) : defaultValue;
    return ObservableSlim.create(initialValue, true, changes => localStorage.setItem(key, JSON.stringify(initialValue)));
};

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

function createLeftTabComponent(data) {
    const id = `left-tab-component-${crypto.randomUUID()}`;
    const $component = $(
        `<div class="d-flex h-100" id="${id}">
    <div class="nav flex-column nav-tabs left-tabs nav-sm-column me-3" role="tablist"></div>
    <div class="tab-content flex-grow-1"></div>
</div>`);

    let groups = [...new Set(data.map(tab => tab.group ?? ""))];
    if (groups.includes("")) groups = [""].concat(groups.filter(group => group !== "")); // If there's an empty group, move it to the front
    const groupFragments = {};
    data.forEach((tab, index) => {
        const tabClass = `tab-${index}-content`;
        const $button = $(`<button class="nav-link rounded-0" data-bs-toggle="tab" type="button" role="tab" data-bs-target="#${id} .${tabClass}">${tab.name}</button>`);
        const $content = $(`<div class="tab-pane fade h-100 ${tabClass}" role="tabpanel"><textarea class="form-control w-100 h-100" name="wordpack-content" required>${tab.content}</textarea></div>`);

        const group = tab.group ?? "";
        if (!groupFragments[group]) {
            groupFragments[group] = {
                buttons: $(document.createDocumentFragment()),
                contents: $(document.createDocumentFragment())
            };
            if (groups.length > 1 && group) {
                const $groupHeader = $(`<span class="user-select-none tab-group-header my-2" data-tab-group-name="${group}">${group}</span>`);
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
    return $component;
}



