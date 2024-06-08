const CURRENT_SCHEMA_VERSION = 1;

function generate_v1(generator_input) {
    const generator_output = [];
    generator_input["sets"].forEach((set, set_i) => {
        for (let player_i = 0; player_i < set["players"]; player_i++) {
            const player_output = {words: []};

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
                    console.error("Cannot generate " + group["num_words"] + " unique words from wordpacks " + group["wordpacks"] + (generator_input["sets"].length == 1 ? "" : " (" + player_output["name"] + ")") + ". Please reduce the number of words or add more wordpacks.");
                    return;
                }
                player_output["words"] = player_output["words"].concat(_.sample(choices, group["num_words"]));
            });
            generator_output.push(player_output);
        }
    });
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
 * @param {Array} generator_output - The generator output.
 * @param {boolean} alphabetize - Whether to alphabetize the words.
 * @param {boolean} oneLine - Whether to render the words as one line or as a list.
 * @param {boolean} groupByWordpack - Whether to group the words by wordpack.
 * @returns {string} The rendered output.
 */
function renderOutput(generator_output, {alphabetize = true, oneLine = false, groupByWordpack = false} = {}) {
    function renderList(l, pre = false) {
        if (l.length === 0) return "";
        else if (oneLine) return (pre ? "* " : "") + l.map(word => `\`${word}\``).join(", ");
        else return l.map(word => `* \`${word}\``).join("\n");
    }

    let output = "";
    generator_output.forEach(player => {
        let words = player.words;
        if (alphabetize) words = [...words].sort((a, b) => a.word.localeCompare(b.word));
        if (generator_output.length > 1) output += `### ${player.name}\n`;
        if (groupByWordpack) {
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
