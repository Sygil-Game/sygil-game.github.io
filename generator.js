function generate_v1(generator_input) {
    const generator_output = [];
    generator_input["sets"].forEach((set, set_i) => {
        for (let player_i = 0; player_i < set["players"]; player_i++) {
            // Name logic
            let name;
            if (set["name"]) name = set["name"];
            else if (generator_input["sets"].length == 1) name = "Player " + (player_i + 1);
            else name = "Player " + (set_i + 1);
            if (generator_input["sets"].length > 1 && set["players"] > 1) name += " [" + player_i + "]";

            const player_output = {
                name: name,
                words: [], wordpack_origins: [], group_origins: []
            };
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
                try {
                    player_output["words"] = player_output["words"].concat(choices.slice(0, group["num_words"]));
                } catch (error) {
                    console.error("Cannot generate " + group["num_words"] + " unique words from wordpacks " + group["wordpacks"] + (generator_input["sets"].length == 1 ? "" : " (" + player_output["name"] + ")") + ". Please reduce the number of words or add more wordpacks.");
                    return;
                }
            });
            generator_output.push(player_output);
        }
    });
    return generator_output;
}

function generate(generator_input) {
    if (generator_input["schema_version"] == 1) {
        return generate_v1(generator_input);
    }
    console.error("Unsupported generator schema version: " + generator_input["schema_version"]);
}

