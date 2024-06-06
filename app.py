"""
This website generates random word-sets for use with the magic system Sygil.
It loads in one or more wordpacks, allows you to select which ones to include, and then draws a given number of words.
"""

import json
import os
import random
import re
import textwrap
from collections import defaultdict
from copy import deepcopy
from uuid import uuid4
import streamlit as st
import streamlit.components.v1 as components
import streamlit_antd_components as sac
import streamlit_extras as stx
import streamlit_extras.grid
import streamlit_extras.stylable_container

s = st.session_state  # Shorthand

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


st.set_page_config(layout='wide')
st.title("Sygil Word Generator")

stable("generator_input", default=presets["Default"])
stable("generator_output", default=[])

# Streamlit's default tabs are garbage and don't preserve state across reruns. This fixes that.
# Argument order matters! "stable" must be called before the session_state for index= is read.
sac.tabs(["Generator", "Wordpacks"], key=stable("current_tab", default=0),
         return_index=True, index=s["current_tab"])

if s["current_tab"] == 0:
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

if s["current_tab"] == 1:
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
with stx.stylable_container.stylable_container(key=f"button_js_styler", css_styles="""{ display: none }"""):
    components.html("""<script>
    window.parent.document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" integrity="sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W6A==" crossorigin="anonymous" referrerpolicy="no-referrer" />');
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
    window.parent.document.querySelectorAll(".stButton button").forEach(updateButton);
</script>""")
