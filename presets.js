class PresetManager {
    constructor() {
        // Singleton
        if (PresetManager.instance) return PresetManager.instance;
        PresetManager.instance = this;

        this.presets = syncToLocalStorage('presets', {});
        this.listeners = [];
        this.defaults = [];
    }

    get(name) {
        return name in this.presets ? JSON.parse(JSON.stringify(this.presets[name])) : null;
    }

    set(obj) {
        if (!obj.name) throw new Error('Preset must have a name');
        if (this.isDefault(obj.name)) throw new Error(`Cannot overwrite default preset "${obj.name}"`);
        this.presets[obj.name] = JSON.parse(JSON.stringify(obj));
        this.listeners.forEach(listener => listener(this));
    }

    setDefault(obj) {
        this.set(JSON.parse(JSON.stringify(obj)));
        this.defaults.push(obj.name);
    }

    remove(name) {
        if (this.isDefault(name)) throw new Error(`Cannot delete default preset "${name}"`);
        delete this.presets[name];
        this.listeners.forEach(listener => listener(this));
    }

    getAll() {
        return JSON.parse(JSON.stringify(this.presets));
    }

    getDefaultNames() {
        return [...this.defaults];
    }

    isDefault(name) {
        return this.defaults.includes(name);
    }

    onChange(listener) {
        this.listeners.push(listener);
    }
}

window.presets = new PresetManager();
