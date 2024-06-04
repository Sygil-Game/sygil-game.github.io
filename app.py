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
import streamlit_extras as stx

# from streamlit_extras.grid import grid as st_grid
# from streamlit_extras.stylable_container import stylable_container as


# Load wordpacks
def parse_wordpack(wordpack):
    lines = [line.strip() for line in st.session_state.wordpack_raws[wordpack].split("\n")]
    lines = [line for line in lines if line]
    if '===' in lines:
        st.session_state.wordpacks[wordpack] = lines[:lines.index('===')]
        st.session_state.wordpacks[f"{wordpack}+"] = lines[:lines.index('===')] + lines[lines.index('===') + 1:]
    else:
        st.session_state.wordpacks[wordpack] = lines


if not "wordpacks" in st.session_state:
    st.session_state.wordpacks = {}
    st.session_state.wordpack_raws = {}

    for filename in os.listdir("wordpacks"):
        if filename.endswith(".txt"):
            with open(os.path.join("wordpacks", filename), 'r') as f:
                wordpack = os.path.splitext(filename)[0]
                st.session_state.wordpack_raws[wordpack] = f.read()
                parse_wordpack(wordpack)


# Load presets
with open("presets.json") as f:
    presets = json.load(f)

# Helper for using icons in buttons
# key_dict = {}
# st.write('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css"/>', unsafe_allow_html=True)


# def generate_key(icon, button_key):
#     key_dict[button_key] = icon
#     return {'label': button_key, 'key': button_key}


st.title("Sygil Word Generator")

tabs = st.tabs(["Generator", "Wordpacks"])

with tabs[0]:
    st.write("Select which wordpacks to include and the number of words to generate:")

    if "generator_input" not in st.session_state:
        st.session_state.generator_input = presets["Default"]
    if "generator_output" not in st.session_state:
        st.session_state.generator_output = []

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
                        for word in st.session_state.wordpacks[wordpack]:
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

    # st.button(**generate_key('<i class="fa-solid fa-circle-user fa-bounce"></i>', button_key='button_test_1'))
    # st.button(**generate_key('<i class="fa-brands fa-youtube fa-spin-pulse"></i>', button_key='button_test_2'))

    # Give each player an ID for key-generating purposes (otherwise you get issues with moving Streamlit components around)

    def generate_player_id(): return str(uuid4())[:8]

    for player in st.session_state.generator_input["players"]:
        if "id" not in player:
            player["id"] = generate_player_id()

    is_multiple_players = len(st.session_state.generator_input["players"]) > 1
    with st.container(border=True):
        players = deepcopy(st.session_state.generator_input["players"])

        cols = st.columns([13, 3])
        is_advanced_v = len(players) > 1 or len(players[0]["groups"]) > 1 or players[0]["copies"] > 1
        is_advanced = cols[1].toggle("Advanced", value=is_advanced_v)
        if not is_advanced and len(players) > 1:
            players = players[:1]
            st.session_state.generator_input["players"] = players
            st.rerun()

        for player_i, player in enumerate(players):
            with st.container(border=True):
                # Player name on left, buttons (up/down/clone/delete) on right
                if is_advanced:
                    with st.container():
                        grid = stx.grid.grid([10, 4, 1, 1, 1, 1], vertical_align="center")
                        player["name"] = grid.text_input("Name", key=f"name_player-{player['id']}",
                                                         value=player["name"], placeholder=f"Player {player_i + 1}", label_visibility="collapsed")
                        grid.empty()
                        if grid.button("↑", key=f"up_button_player-{player['id']}", disabled=player_i == 0):
                            players.pop(player_i)
                            players.insert(player_i - 1, player)
                            st.session_state.generator_input["players"] = players
                            st.rerun()
                        if grid.button("↓", key=f"down_button_player-{player['id']}", disabled=player_i == len(st.session_state.generator_input["players"]) - 1):
                            players.pop(player_i)
                            players.insert(player_i + 1, player)
                            st.session_state.generator_input["players"] = players
                            st.rerun()
                        if grid.button("C", key=f"clone_button_player-{player['id']}"):
                            copy = deepcopy(player)
                            if copy["name"]:
                                copy["name"] += " (copy)"
                            copy["id"] = generate_player_id()
                            players.insert(player_i + 1, copy)
                            st.session_state.generator_input["players"] = players
                            st.rerun()
                        if grid.button("\\-", key=f"delete_button_player-{player['id']}"):
                            players.pop(player_i)
                            st.session_state.generator_input["players"] = players
                            st.rerun()

                groups = []
                grid = stx.grid.grid(*[[4, 2, 12]] + [[4, 2, 11, 1]] * (len(player["groups"]) - 1), vertical_align="center")
                for group_i, group in enumerate(player["groups"]):
                    group_values = {}
                    group_values["num_words"] = grid.number_input("Number of words", key=f"num_words_player-{player['id']}_group{group_i}",
                                                                  min_value=1, value=group["num_words"], label_visibility="collapsed")
                    grid.write(" from ")
                    group_values["wordpacks"] = grid.multiselect("Wordpacks", key=f"wordpacks_player-{player['id']}_group{group_i}", options=list(st.session_state.wordpacks.keys()),
                                                                 default=group["wordpacks"], label_visibility="collapsed", placeholder="Choose wordpacks...")
                    groups.append(group_values)
                    if group_i > 0:
                        def f(player_i, group_i):  # Using a callback prevents group_i reuse from causing issues
                            players[player_i]["groups"].pop(group_i)
                            st.session_state.generator_input["players"] = players
                        grid.button("\\-", key=f"group_delete_button_player-{player['id']}_group{group_i}", on_click=f, args=[player_i, group_i])

                player["groups"] = groups

                if is_advanced:
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
                        st.session_state.generator_input["players"] = players
                        st.rerun()
                else:
                    if player["copies"] != 1 or len(player["groups"]) > 1:
                        player["copies"] = 1
                        player["groups"] = player["groups"][:1]
                        st.session_state.generator_input["players"] = players
                        st.rerun()

        if is_advanced:
            cols = st.columns([18, 4])
            if cols[1].button("Add player"):
                st.session_state.generator_input["players"].append({
                    "name": None,
                    "groups": [{"wordpacks": [], "num_words": 1}],
                    "id": generate_player_id()
                })
                st.rerun()

        if st.button("Generate", type="primary"):
            st.session_state.generator_input["players"] = players
            st.session_state.generator_output = generate(st.session_state.generator_input) or st.session_state.generator_output  # Maintain state if error during generation

    # if len(st.session_state.generator_output or []) > 0:
    cols = st.columns(3)
    alphabetize = cols[0].checkbox("Alphabetize")
    one_line = cols[1].checkbox("One-line", value=True)
    do_group = cols[2].checkbox("Group by wordpack")

    def render_list(l, pre=False):
        if len(l) == 0:
            return ""
        if one_line:
            return ("* " if pre else "") + ", ".join(l)
        else:
            return "\n".join(f"* {word}" for word in l)

    for player_i, player in enumerate(st.session_state.generator_output or []):
        words = player["words"]
        if alphabetize:
            words = sorted(words, key=lambda w: w["word"])
        if len(st.session_state.generator_output) > 1:
            st.markdown("### " + player["name"])
        if do_group:
            grouped_words = defaultdict(list)
            for word in words:
                grouped_words[word["wordpack_origin"]].append(word["word"])
            st.markdown("\n".join(f"* {wordpack}:\n" + textwrap.indent(render_list(words, pre=True), "  ") for wordpack, words in sorted(grouped_words.items())))
        else:
            st.markdown(render_list([word["word"] for word in words]))

with tabs[1]:
    grid = stx.grid.grid([7, 3], vertical_align="top")
    selected_wordpack = grid.selectbox("Wordpack:", key="selected_wordpack",
                                       options=[wordpack for wordpack in st.session_state.wordpacks.keys() if not wordpack.endswith("+")])

    with grid.container():
        with stx.stylable_container.stylable_container(key="wordpacks_button_styler", css_styles="""button {
                width: 100%;
            }"""):

            def find_nearest_name(name):
                if name not in st.session_state.wordpacks:
                    return name
                results = re.search(r"^(.*) \((\d+)\)$", name)
                if results:
                    return find_nearest_name(f"{results.group(1)} ({int(results.group(2)) + 1})")
                else:
                    return find_nearest_name(f"{name} (2)")

            grid2 = stx.grid.grid(2, 2, vertical_align="top")

            def new_wordpack_callback():
                new_wordpack = find_nearest_name("My Wordpack")
                st.session_state.wordpack_raws[new_wordpack] = ""
                parse_wordpack(new_wordpack)
                st.session_state.selected_wordpack = new_wordpack
            grid2.button("New", on_click=new_wordpack_callback)

            def copy_wordpack_callback():
                new_wordpack = find_nearest_name(selected_wordpack)
                st.session_state.wordpack_raws[new_wordpack] = st.session_state.wordpack_raws[selected_wordpack]
                parse_wordpack(new_wordpack)
                st.session_state.selected_wordpack = new_wordpack
            grid2.button("Copy", on_click=copy_wordpack_callback)

            with grid2.container():
                with stx.stylable_container.stylable_container(key="rename_wordpack_styler", css_styles="""button > :nth-child(2) {
                        display: none;
                    }"""):
                    with st.popover("Rename"):
                        def rename_wordpack_callback():
                            new_name = st.session_state.rename_wordpack_input
                            st.session_state.wordpack_raws[new_name] = st.session_state.wordpack_raws[selected_wordpack]
                            st.session_state.wordpacks[new_name] = st.session_state.wordpacks[selected_wordpack]
                            st.session_state.selected_wordpack = new_name
                            del st.session_state.wordpack_raws[selected_wordpack]
                            del st.session_state.wordpacks[selected_wordpack]
                        st.text_input("New name:", key="rename_wordpack_input", on_change=rename_wordpack_callback)
            if grid2.button("Delete"):
                pass

    def update_wordpack():
        st.session_state.wordpack_raws[selected_wordpack] = st.session_state.modified_wordpack_raw
        parse_wordpack(selected_wordpack)
    st.text_area("Wordpack content", value=st.session_state.wordpack_raws[selected_wordpack], key="modified_wordpack_raw",
                 height=1000, label_visibility="collapsed", on_change=update_wordpack)

# Logic for using icons in buttons
# icon_config = f"""
#         <script>
#             var elements = window.parent.document.getElementsByClassName('css-x78sv8 eqr7zpz4');
#             let dict = {json.dumps(key_dict)};
#             let keys = Object.keys(dict);
#             let icons = Object.values(dict);
#             for (var i = 0; i < elements.length; ++i) {{
#                 for (var j = 0; j < keys.length; ++j){{
#                     if (elements[i].innerText == keys[j])
#                     elements[i].innerHTML = icons[j];
#                 }}
#             }}
#         </script>
#         """
# components.html(f"{icon_config}", height=0, width=0)
