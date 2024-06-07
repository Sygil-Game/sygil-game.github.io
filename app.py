"""
The website for the Sygil magic system.
Includes rules and a Sygil set generator.
"""

import json
import os
import random
import re
import textwrap
from collections import defaultdict
from contextlib import contextmanager
from copy import deepcopy
from uuid import uuid4
import streamlit as st
import streamlit_antd_components as sac
import streamlit_extras as stx
import streamlit_extras.grid
from streamlit_js import st_js, st_js_blocking

s = st.session_state  # Shorthand
st.set_page_config(layout='wide')

# Container for hiding components
@contextmanager
def hide():
    with st.container():
        st.components.v1.html("""<script>window.frameElement.parentElement.parentElement.parentElement.parentElement.style.display = 'none';</script>""")
        yield

# Helper for running some JS without worrying about display or ID.
# Generally works but sometimes won't rerun identical code when you expect.
running_js_id = 0
def run_js(code, block=False):
    global running_js_id
    running_js_id += 1
    with hide():
        return (st_js_blocking if block else st_js)(code=code, key=f"js_runner_{running_js_id}_{hash(code)}")

# Fetch localStorage and create helper for writing it back
local_storage_key = "sygil_local_storage"
local_storage = json.loads(run_js(f"""return window.localStorage.getItem("{local_storage_key}");""", block=True) or "{}")
def write_local_storage(): run_js(f"""window.localStorage.setItem("{local_storage_key}", "{json.dumps(local_storage, ensure_ascii=False).replace('"', '\\"')}");""", block=True)


# Load wordpacks
def parse_wordpack(wordpack):
    lines = [line.strip() for line in s["wordpack_raws"][wordpack].split("\n")]
    lines = [line for line in lines if line]
    if '===' in lines:
        s["wordpacks"][wordpack] = lines[:lines.index('===')]
        s["wordpacks"][f"{wordpack}+"] = lines[:lines.index('===')] + lines[lines.index('===') + 1:]
    else:
        s["wordpacks"][wordpack] = lines
if not "wordpacks" in s:
    s["wordpacks"] = {}
    s["wordpack_raws"] = {}

    for filename in os.listdir("wordpacks"):
        if filename.endswith(".txt"):
            with open(os.path.join("wordpacks", filename), 'r') as f:
                wordpack = os.path.splitext(filename)[0]
                s["wordpack_raws"][wordpack] = f.read()
                parse_wordpack(wordpack)
    s["default_wordpacks"] = list(s["wordpacks"].keys())


# Load presets
with open("presets.json") as f:
    presets = json.load(f)


# Helper for making stable keys that won't be automatically cleaned up.
# Streamlit's "magic" cleans up the session_state of any widgets which are not loaded on even a single re-run,
# but if we edit them at all manually (such as by setting them equal to themselves) it leaves them alone.
# Make sure to set appropriate default values - many widgets are not happy with None.
# See here for details: https://docs.streamlit.io/develop/concepts/architecture/widget-behavior
def _stable(key, default):
    st.session_state[key] = st.session_state[key] if key in st.session_state else default  # We don't use .get in case "get" is a key of session_state
    return key
_stable("stable_keys", set())
def stable(key, default=None):
    st.session_state["stable_keys"].add(key)
    return _stable(key, default)
# Maintain stability of keys even if stable() isn't called for them on this rerun
for key in st.session_state["stable_keys"]:
    if key in st.session_state:  # This is here because of page-switching shenaningans
        st.session_state[key] = st.session_state[key]

st.title("Sygil")

# Order query params to place certain params first (in the order given)
query_params_order = ["tab"]
st.query_params.from_dict({k: st.query_params[k] for k in
                           [k2 for k2 in query_params_order if k2 in st.query_params] +
                           [k3 for k3 in st.query_params.keys() if k3 not in query_params_order]})


def load_from_url(key, default, parse_json=True):
    if key in st.query_params:
        try:
            value = st.query_params[key]
            if parse_json:
                value = json.loads(value)
            return value
        except json.JSONDecodeError:
            st.error(f'Invalid JSON provided for "{key}" in URL.')
            return default
    return default

# Streamlit's default tabs are garbage and don't preserve state across reruns.
# This fixes that and also syncs the tab state up with a URL param.
# The first tab is the default and won't appear in the URL.
tabs = ["Rules", "DM", "Generator", "Wordpacks"]
default_tab = load_from_url("tab", tabs[0], parse_json=False)
if default_tab not in tabs:
    default_tab = tabs[0]
stable("tab", default=default_tab)
selected_tab = sac.tabs(tabs, key="tab", index=tabs.index(s["tab"]))
if selected_tab == tabs[0]:
    if "tab" in st.query_params:
        del st.query_params["tab"]
else:
    st.query_params["tab"] = selected_tab

# Intialize generator_input and generator_output and load them from the URL if present, or from localStorage if not
stable("generator_input", default=load_from_url("generator_input", local_storage.get("generator_input", presets["Default"])))
stable("generator_output", default=load_from_url("generator_output", local_storage.get("generator_output", [])))


if s["tab"] == "Rules":
    st.markdown("""**Sygil** is a magic system that lets magic be the way it was meant to be - overpowered, creative, and **LIMITLESS**.

As a player, you'll get a set of Sygils from your DM, for example: `Water`, `Heavy`, `Wood`, `Hot`  
Sygils are power words that can be combined to cast spells. To cast a spell, choose any two Sygils and combine them using the verb "is":  
`Wood is Water` - *The wooden door blocking your path turns into a puddle.*

You can direct the general interpretation of your spell if it is ambiguous. `Hot is Heavy` could mean  
*The hot cauldron in front of you becomes extremely heavy and punches a hole in the floor.*  
Or: *The heat coming from the cauldron becomes heavier and more intense.* (Or both!)  
Your DM has final say on the outcome of spell and whether an interpretation is reasonable or not.

Once you cast a spell, you can't cast it again that day, though you can use the same Sygils for new spells.  
You always have the special Sygil `That`, which can only be used as the first Sygil in a spell:  
`That is Wood` - *The guard you're pointing at turns into a tree.*

The power of your spells is **LIMITLESS**. Be careful how you use them.  
`Water is Hot` - *You decide to boil the entire ocean for fun. The resulting steam explosion instantly kills every creature on the planet (including you).*

At the end of each day you'll get an all new set of Sygils to replace your current ones.  
Don't be stingy with your spells! The more spells you cast, the more your power will grow, granting you more Sygils per day, signature Sygils, special Sygils, and more.

Now go show the world what magic can really do.""")

if s["tab"] == "DM":
    st.markdown("""
### Quick-start

Read the player rules. Then go to the Generator tab and use the default settings to generate a set of Sygils for each player.  
Suggested first adventure:

> Deep in the bowels of a hidden temple, the special Sygil `All` is resting, with the power to make one spell permanent and universal.  
> E.g. `All Metal is Round` would make all metal forcibly reshape itself into balls forevermore.  
> This Sygil is too dangerous to be allowed to fall into the wrong hands. Find it.

### When should I use Sygil?

**Sygil** intentionally makes magic incredibly overpowered. Magic is supposed to be **LIMITLESS** and almighty, and if you want to use **Sygil** in your game you'll need to embrace that.  
You can use **Sygil** alongside any other RPG or by itself. It's best suited for open-ended games without a pre-planned narrative.  
You should not use **Sygil** if you have a specific story you want to tell, such as a mystery. Railroading doesn't work when the players can turn the rails into soup.  
Don't try to use **Sygil** for only some of your players (like only giving it to the wizard but not the warrior) - it will make other players feel weak.

### Creating Sygil sets
 
You'll need to give each player a set of Sygils at the start of the game. It's recommended to start off with 10 per player.  
You can use the Generator tab to automatically generate a set of Sygils. You can turn on advanced mode and set a number of "copies" to generate sets for many players at once.  
The Generator will randomly choose Sygils from a default wordpack. If you want, you can use more wordpacks or create your own.  

### Making Sygil work in your game

General:
- Let players be strong! That's the whole point.
- Think through what indirect consequences spells might have. `Mountain is Gold` might devastate a kingdom's economy and `Ground is Soft` might cause nearby buildings to start collapsing.
- Have each player keep track of the spells they've cast by writing them down.
- Reward creativity. If players come up with a really cool spell, have it work out in their favor. You can even give out explicit rewards like bonus Sygils.
- Don't punish players for experimenting! The more spells your players cast the more interesting and fun the game will be.
- You get final say on whether an interpretation works and what a spell ends up doing.
- If a player's spell will have a disastrous outcome (like `Bridge is Sand` plummeting them to their deaths), warn them, either in-character as a premonition or out-of-character.
- If you feel like spells are too strong or too weak, the problem is usually your wordpack. Sygils that allow targeting enemies directly (e.g. `Heart`) are very strong. Sygils that are very specific (e.g. `Necklace`) are very weak.

Players:
- If players are dying too much, give them multiple lives or resistance/immunity to direct magic.
- If some players are overshadowing others, make things turn-based and allow each player to cast only one spell per turn.
- Don't allow PvP. **Sygil** is not balanced around players being on the receiving end. This is best done by simply talking to your players about it out-of-character.
- Players may quickly run out of useful spells, especially if you gave them a small number of Sygils. If this happens, you can give them consumable items that reroll or refresh one of their Sygils.
- It can be fun to require players to shout their spells out loud.

Enemies:
- Expect most enemies to be defeated in a single spell. Use groups of enemies and multiple encounters to keep things interesting.
- Don't give enemies access to Sygils unless you really know what you're doing - they'll probably instakill your players. Let the players be special users of Sygil magic.
- If you want a boss enemy to last more than a few seconds, give them multiple lives or resistance/immunity to direct magic.
- It's easy to destroy with Sygils, but other problems require more creativity. Finding things, interrogating enemies, inflitrating - if you feel like things are too easy, give players challenges other than direct combat.

### Progression

As players become accustomed to **Sygil**, you can introduce new abilities and mechanics.  
Most obviously, you can increase the number of Sygils or use more niche wordpacks once players are creative enough to find ways to use weirder Sygils.  
`That` is a very powerful training Sygil meant to make it easier for players to cast spells in any context; more experienced players might not need it.  
To introduce stronger themes to certain sessions and more variety between sessions, you can give players access to one or more temporary Sygils based on the environment they're in (e.g. everyone can use `Tree` when in the haunted forest).  
Here are some other ideas. These can be level-up rewards for specific players or new mechanics that become accessible to everyone.
- Signature Sygil: the player picks one Sygil they've used before to keep forever. (Let them swap this if they feel like they're stuck with something bad.)
- Overchannel: the player can recast a spell they've cast before, at the cost of losing of the Sygils used.
- Magic Shield: after casting any spell, the player gets a magical shield that absorbs one attack in the next 5 minutes. Good if your players need more defenses or aren't casting enough spells.
- Special Sygils: the player permanently gains a special Sygil. Examples:
    - `Not` - e.g. `Water is Not Hot`
    - `I` - e.g. `I is Fast` (you may want to restrict this to only being the first Sygil of a spell)
    - `Shield` - e.g. `Water is Shield` (helpful to give players a consistent defensive option if they're too fragile)
- Blank Sygil: the player permanently gains a special Sygil that starts out blank. Once per day they can point at something and gain a Sygil for it (e.g. point at a wolf and gain the `Wolf` sygil).
- New verbs. These are tricky to choose because they need to be generally applicable enough but also not redundant with "is". Some examples:
    - `goes to` - e.g. `Building goes to Air` flings a nearby building into the air. (It's recommended to use this with the "Goes words" wordpack, which adds words like "up".)
    - `look like` - e.g. `Paper looks like Monster`. Best given to a single player to let them specialize as an illusionist.
- You can let players write their own Sygils to be added to the wordpack pool. Be warned that this can be very volatile.
- Cooperative Magic: players can combine their Sygils to cast spells together.""")

if s["tab"] == "Generator":

    st.write("Select which wordpacks to include and the number of words to generate:")

    # generator_input schema:
    # {
    #   "schema_version": 1,
    #   "players": [
    #       {
    #           "name": str|None,
    #           "groups": [
    #               {
    #                   "wordpacks": [str],
    #                   "num_words": int
    #               },
    #           ],
    #       },
    #   ],
    # }

    def generate_v1(generator_input):
        generator_output = []
        for player_i, player in enumerate(generator_input["players"]):
            for copy_i in range(player["copies"]):
                # Name logic
                if player["name"]:
                    name = player["name"]
                elif len(generator_input["players"]) == 1:
                    name = f"Player {copy_i + 1}"
                else:
                    name = f"Player {player_i + 1}"
                if len(generator_input["players"]) > 1 and player["copies"] > 1:
                    name += f" [{copy_i}]"

                player_output = {
                    "name": name,
                    "words": [], "wordpack_origins": [], "group_origins": []
                }
                for group_i, group in enumerate(player["groups"]):
                    # Gather choices
                    choices = []
                    words = set()  # For deduplication
                    for wordpack in group["wordpacks"]:
                        for word in s["wordpacks"][wordpack]:
                            if word in words or word in player_output["words"]:
                                continue
                            choices.append({"word": word, "wordpack_origin": wordpack, "group_origin": group_i})
                            words.add(word)

                    # Sample
                    try:
                        player_output["words"] += random.sample(choices, group["num_words"])
                    except ValueError:
                        st.error(f"Cannot generate {group['num_words']} unique words from wordpacks {group['wordpacks']}{'' if len(generator_input) == 1 else (' (' + player_output['name'] + ')')}. Please reduce the number of words or add more wordpacks.")
                        return
                generator_output.append(player_output)
        return generator_output

    def generate(generator_input):
        if generator_input["schema_version"] == 1:
            return generate_v1(generator_input)
        st.error(f"Unsupported generator schema version: f{generator_input['schema_version']}")

    # Give each player an ID for key-generating purposes (otherwise you get issues with moving Streamlit components around)
    def generate_player_id(): return str(uuid4())[:8]

    for player in s["generator_input"]["players"]:
        if "id" not in player:
            player["id"] = generate_player_id()

    with st.container(border=True):
        players = deepcopy(s["generator_input"]["players"])  # Deepcopy so we don't lose data if something errors along the way

        cols = st.columns([13, 3])
        cols[1].toggle("Advanced", key="is_advanced", help="Can't be disabled if you're using any advanced features.",
                       value=len(players) > 1 or len(players[0]["groups"]) > 1 or players[0]["copies"] > 1)
        if not s["is_advanced"] and len(players) > 1:
            players = players[:1]
            s["generator_input"]["players"] = players
            st.rerun()

        for player_i, player in enumerate(players):
            with st.container(border=True):
                # Player name on left, buttons (up/down/clone/delete) on right
                if s["is_advanced"]:
                    with st.container():
                        grid = stx.grid.grid([10, 4, 1, 1, 1, 1], vertical_align="center")
                        player["name"] = grid.text_input("Name", key=f"name_player-{player['id']}",
                                                         value=player["name"], placeholder=f"Player {player_i + 1}", label_visibility="collapsed")
                        grid.empty()
                        if grid.button("↑", key=f"up_button_player-{player['id']}", disabled=player_i == 0):
                            players.pop(player_i)
                            players.insert(player_i - 1, player)
                            s["generator_input"]["players"] = players
                            st.rerun()
                        if grid.button("↓", key=f"down_button_player-{player['id']}", disabled=player_i == len(s["generator_input"]["players"]) - 1):
                            players.pop(player_i)
                            players.insert(player_i + 1, player)
                            s["generator_input"]["players"] = players
                            st.rerun()
                        if grid.button('<i class="fa-regular fa-copy"></i>', key=f"clone_button_player-{player['id']}"):
                            copy = deepcopy(player)
                            if copy["name"]:
                                copy["name"] += " (copy)"
                            copy["id"] = generate_player_id()
                            players.insert(player_i + 1, copy)
                            s["generator_input"]["players"] = players
                            st.rerun()
                        if grid.button("\\-", key=f"delete_button_player-{player['id']}", disabled=len(players) == 1):
                            players.pop(player_i)
                            s["generator_input"]["players"] = players
                            st.rerun()

                groups = []
                grid = stx.grid.grid(*[[4, 2, 12]] + [[4, 2, 11, 1]] * (len(player["groups"]) - 1), vertical_align="center")
                for group_i, group in enumerate(player["groups"]):
                    # Unique ID for this group of this player (for keys)
                    PGID = f"P{player['id']}_G{group_i}"
                    grid.number_input("Number of words", min_value=1, label_visibility="collapsed",
                                      key=stable(f"GI_num_words_{PGID}", default=group["num_words"]))
                    grid.write(" from ")
                    grid.multiselect("Wordpacks", options=list(s["wordpacks"].keys()),
                                     label_visibility="collapsed", placeholder="Choose wordpacks...",
                                     key=stable(f"GI_wordpacks_{PGID}", default=group["wordpacks"]))
                    groups.append({"num_words": s[f"GI_num_words_{PGID}"],
                                   "wordpacks": s[f"GI_wordpacks_{PGID}"]})
                    if group_i > 0:
                        def delete_player_group(player_i, group_i):  # Using a callback prevents group_i reuse from causing issues
                            players[player_i]["groups"].pop(group_i)
                            s["generator_input"]["players"] = players
                        grid.button("\\-", key=f"group_delete_button_{PGID}", on_click=delete_player_group, args=[player_i, group_i])
                player["groups"] = groups

                if s["is_advanced"]:
                    st.html('<hr style="margin: 0;" />')
                    grid = stx.grid.grid([1, 6, 12, 4], vertical_align="center")
                    grid.text("X")
                    player["copies"] = grid.number_input("Copies", key=f"copies_player-{player['id']}",
                                                         min_value=1, value=None, placeholder="Copies...", label_visibility="collapsed") \
                        or 1
                    grid.empty()
                    if grid.button("Add group", key=f"group_add_button_player-{player['id']}"):
                        groups.append({"wordpacks": [], "num_words": 1})
                        player["groups"] = groups
                        s["generator_input"]["players"] = players
                        st.rerun()
                else:
                    if player["copies"] != 1 or len(player["groups"]) > 1:
                        player["copies"] = 1
                        player["groups"] = player["groups"][:1]
                        s["generator_input"]["players"] = players
                        st.rerun()

        if s["is_advanced"]:
            cols = st.columns([18, 4])
            if cols[1].button("Add player"):
                s["generator_input"]["players"].append({
                    "name": None,
                    "groups": [{"wordpacks": [], "num_words": 1}],
                    "copies": 1,
                    "id": generate_player_id()
                })
                st.rerun()

        if st.button("Generate", type="primary"):
            s["generator_input"]["players"] = players
            s["generator_output"] = generate(s["generator_input"]) or s["generator_output"]  # Maintain state if error during generation

    stable("alphabetize", default=False)
    stable("one_line", default=True)
    stable("do_group", default=False)
    if len(s["generator_output"]) > 0:
        cols = st.columns(3)
        alphabetize = cols[0].checkbox("Alphabetize", key="alphabetize")
        one_line = cols[1].checkbox("One-line", key="one_line")
        do_group = cols[2].checkbox("Group by wordpack", key="do_group")

    def render_list(l, pre=False):
        if len(l) == 0:
            return ""
        if one_line:
            return ("* " if pre else "") + ", ".join(l)
        else:
            return "\n".join(f"* {word}" for word in l)

    for player_i, player in enumerate(s["generator_output"]):
        words = player["words"]
        if alphabetize:
            words = sorted(words, key=lambda w: w["word"])
        if len(s["generator_output"]) > 1:
            st.markdown("### " + player["name"])
        if do_group:
            grouped_words = defaultdict(list)
            for word in words:
                grouped_words[word["wordpack_origin"]].append(word["word"])
            st.markdown("\n".join(f"* {wordpack}:\n" + textwrap.indent(render_list(words, pre=True), "  ") for wordpack, words in sorted(grouped_words.items())))
        else:
            st.markdown(render_list([word["word"] for word in words]))

    local_storage["generator_input"] = s["generator_input"]
    local_storage["generator_output"] = s["generator_output"]
    write_local_storage()


if s["tab"] == "Wordpacks":
    grid = stx.grid.grid([8, 1, 1], vertical_align="bottom")
    selected_wordpack = grid.selectbox("Wordpack:", key="selected_wordpack",
                                       options=[wordpack for wordpack in s["wordpacks"].keys() if not wordpack.endswith("+")])

    def find_nearest_name(name):
        if name not in s["wordpacks"]:
            return name
        results = re.search(r"^(.*) \((\d+)\)$", name)
        if results:
            return find_nearest_name(f"{results.group(1)} ({int(results.group(2)) + 1})")
        else:
            return find_nearest_name(f"{name} (2)")

    if grid.button("New", use_container_width=True):
        @st.experimental_dialog("Create new wordpack")
        def new_wordpack_dialog():
            st.text_input("Name:", key="new_wordpack_name", value=find_nearest_name(selected_wordpack))
            options = [wordpack for wordpack in s["wordpacks"].keys() if not wordpack.endswith("+")]
            st.selectbox("Copy from:", key="new_wordpack_copy_from",
                         options=options, index=options.index(selected_wordpack))
            if st.button("Create"):
                new_name = s["new_wordpack_name"]
                if new_name in s["wordpacks"]:
                    st.error("A wordpack with that name already exists.")
                    return
                if new_name == "":
                    st.error("Invalid name.")
                    return
                copy_from = s["new_wordpack_copy_from"]
                s["wordpack_raws"][new_name] = s["wordpack_raws"][copy_from] if copy_from else ""
                parse_wordpack(new_name)
                s["selected_wordpack"] = new_name
                st.rerun()
        new_wordpack_dialog()

    def delete_wordpack_callback():
        del s["wordpack_raws"][selected_wordpack]
        del s["wordpacks"][selected_wordpack]
        s["selected_wordpack"] = "Basic"
    grid.button('<span><i class="fa-solid fa-trash"></i> Delete</span>', use_container_width=True,
                disabled=selected_wordpack in s["default_wordpacks"], on_click=delete_wordpack_callback)

    def update_wordpack():
        s["wordpack_raws"][selected_wordpack] = s["modified_wordpack_raw"]
        parse_wordpack(selected_wordpack)
    st.text_area("Wordpack content", value=s["wordpack_raws"][selected_wordpack], key="modified_wordpack_raw",
                 height=1000, label_visibility="collapsed", on_change=update_wordpack,
                 disabled=selected_wordpack in s["default_wordpacks"])


# Make all buttons on the page HTML buttons (if they start with <)
# Must be run after all buttons are created
# Unfortunately introduces a brief render delay
with hide():
    run_js("""window.parent.document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" integrity="sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W6A==" crossorigin="anonymous" referrerpolicy="no-referrer" />');
function updateButton(el) {
    if (el.innerText.startsWith("<")) el.innerHTML = el.innerText
}
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                node.querySelectorAll(".stButton button").forEach(updateButton)
            }
        });
    });
});
observer.observe(window.parent.document.body, { childList: true, subtree: true });
window.parent.document.querySelectorAll(".stButton button").forEach(updateButton);""")
