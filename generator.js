const CURRENT_SCHEMA_VERSION = 1;

class BundledGeneratorError extends Error {
    constructor(errors) {
        if (errors.length === 0) throw new Error("No errors to bundle");
        if (errors.length === 1) super(errors[0].message);
        else super("Multiple errors occurred while generating:\n\n" + errors.map(error => error.message).join("\n\n"));
        this.errors = errors;
    }
}

class NotEnoughWordsError extends Error {
    constructor(generator_input, set_i, group_i) {
        const num_words = generator_input["sets"][set_i]["groups"][group_i]["num_words"];
        const wordpacks = generator_input["sets"][set_i]["groups"][group_i]["wordpacks"];
        super("Cannot generate " + num_words + " unique words from wordpacks " +
            JSON.stringify(wordpacks) + ". Please reduce the number of words or add more wordpacks.");
        this.name = "NotEnoughWordsError";
        this.generator_input = generator_input;
        this.set_i = set_i;
        this.group_i = group_i;
        this.num_words = num_words;
        this.wordpacks = wordpacks;
        this.wordpacks_word_count = wordpacks.map(wordpack => generator_input["wordpacks"][wordpack].length).reduce((a, b) => a + b, 0);
        if (wordpacks.length == 0) this.validation_message = "No wordpacks selected.";
        else this.validation_message = `These wordpacks only have ${this.wordpacks_word_count} word${this.wordpacks_word_count == 1 ? "" : "s"}.`;
    }
}


function generate_v1(generator_input) {
    const generator_output = [];
    const errors = [];
    generator_input["sets"].forEach((set, set_i) => {
        for (let player_i = 0; player_i < set["players"]; player_i++) {
            const player_output = { words: [] };

            // Name logic
            if (set["name"]) player_output["name"] = set["name"];
            else if (generator_input["sets"].length == 1) player_output["name"] = "Player " + (player_i + 1);
            else player_output["name"] = "Player " + (set_i + 1);
            if (generator_input["sets"].length > 1 && set["players"] > 1) player_output["name"] += " [" + player_i + "]";

            set["groups"].forEach((group, group_i) => {
                // Gather choices
                const choices = [];
                const words = new Set();  // For deduplication
                group["wordpacks"].forEach((wordpackName) => {
                    generator_input["wordpacks"][wordpackName].forEach((word) => {
                        if (words.has(word) || player_output["words"].includes(word)) return;
                        choices.push({ word: word, wordpack_origin: wordpackName, group_origin: group_i });
                        words.add(word);
                    });
                });

                // Sample
                if (choices.length < group["num_words"]) {
                    errors.push(new NotEnoughWordsError(generator_input, set_i, group_i));
                }
                player_output["words"] = player_output["words"].concat(_.sample(choices, group["num_words"]));
            });
            generator_output.push(player_output);
        }
    });
    if (errors.length > 0) throw new BundledGeneratorError(errors);
    return generator_output;
}

function generate(generator_input) {
    const version = generator_input["schema_version"] ?? CURRENT_SCHEMA_VERSION;
    if (version == 1) return generate_v1(generator_input);

    console.error("Unsupported generator schema version: " + version);
    return [];
}

/**
 * Render the generator output in markdown format.
 * @param {Object} generator_output - The generator output.
 * @returns {string} The rendered output.
 */
function renderOutput(generator_output) {
    function renderList(l, pre = false) {
        if (l.length === 0) return "";
        else if (generator_output["options"]["oneLine"]) return (pre ? "* " : "") + l.map(word => `\`${word}\``).join(", ");
        else return l.map(word => `* \`${word}\``).join("\n");
    }

    let output = "";
    generator_output["output"].forEach(player => {
        let words = player.words;
        if (generator_output["options"]["alphabetize"]) words = [...words].sort((a, b) => a.word.localeCompare(b.word));
        if (generator_output["output"].length > 1) output += `### ${player.name}\n`;
        if (generator_output["options"]["groupByWordpack"]) {
            const groupedWords = {};
            for (const word of words) {
                if (!groupedWords[word.wordpack_origin]) groupedWords[word.wordpack_origin] = [];
                groupedWords[word.wordpack_origin].push(word.word);
            }
            output += Object.keys(groupedWords).sort()
                .map(wordpack => `* ${wordpack}:\n${renderList(groupedWords[wordpack], true).replace(/^/gm, '  ')}`).join("\n");
        } else {
            output += renderList(words.map(word => word.word));
        }
        output += "\n";
    });
    return output;
}
