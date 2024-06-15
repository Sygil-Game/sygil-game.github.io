class WordpackManager {
    constructor() {
        // Singleton
        if (WordpackManager.instance) return WordpackManager.instance;
        WordpackManager.instance = this;

        this.wordpacks = syncToLocalStorage('wordpacks', {});
        this.listeners = [];
    }

    _get(name) {
        if (!name) return [];
        const [nameBase, type] = this.analyzeName(name);
        if (!(nameBase in this.wordpacks)) return [];
        return [this.wordpacks[nameBase], type];
    }

    get(name) {
        const [wordpack, type] = this._get(name);
        return wordpack?.[type];
    }

    getRaw(name) {
        const [wordpack, type] = this._get(name);
        return wordpack?.raw;
    }

    getDefault(name) {
        const [wordpack, type] = this._get(name);
        return wordpack?.defaultRaw;
    }

    set(name, rawText, reason = null) {
        this.wordpacks[name] = Object.assign(this.wordpacks[name] || {}, this.parse(rawText));
        this.listeners.forEach(listener => listener(this, reason));
    }

    setDefault(name, rawText) {
        this.set(name, rawText);
        this.wordpacks[name].defaultRaw = this.wordpacks[name].raw;
    }

    remove(name) {
        delete this.wordpacks[name];
        this.listeners.forEach(listener => listener(this));
    }

    analyzeName(name) {
        if (name.endsWith('+')) return [name.slice(0, -1), "extended"];
        return [name, "base"];
    }

    getAll(includeExtended = true) {
        return Object.fromEntries(Object.entries(this.wordpacks).map(([name, wordpack]) => {
            const out = [];
            if (wordpack.base) out.push([name, wordpack.base]);
            if (includeExtended && wordpack.extended) out.push([`${name}+`, wordpack.extended]);
            return out;
        }).flat());
    }

    getDefaultNames() {
        return Object.entries(this.wordpacks).filter(([name, wordpack]) => wordpack.defaultRaw).map(([name]) => name);
    }

    parse(rawText) {
        const lines = rawText.split("\n").map(line => line.trim()).filter(line => line);
        const out = { raw: rawText };
        if (lines.includes('===')) {
            out.base = lines.slice(0, lines.indexOf('==='));
            out.extended = lines.slice(lines.indexOf('===') + 1);
        } else {
            out.base = lines;
        }
        return out;
    }

    getWordpacksFor(sets) {
        const relevantWordpacks = new Set(sets.map(set => set.groups.map(group => group.wordpacks).flat()).flat());
        return Object.fromEntries(Array.from(relevantWordpacks).map(name => [name, this.get(name)]));
    }

    isDefault(name) {
        const [wordpack, type] = this._get(name);
        return wordpack?.defaultRaw;
    }

    isDefaultModified(name) {
        const [wordpack, type] = this._get(name);
        return !!(wordpack?.defaultRaw && (wordpack?.defaultRaw !== wordpack?.raw));
    }

    onChange(listener) {
        this.listeners.push(listener);
    }
}

window.wordpacks = new WordpackManager();
