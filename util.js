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
