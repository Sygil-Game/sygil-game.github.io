"""
This website generates random word-sets for use with the magic system Sygil.
It loads in one or more wordpacks, allows you to select which ones to include, and then draws a given number of words.
"""

import os
import random
import textwrap
from collections import defaultdict
from copy import deepcopy
from uuid import uuid4
import streamlit as st
import streamlit.components.v1 as components

# Load the wordpacks
wordpacks = {}
for filename in os.listdir("wordpacks"):
    if filename.endswith(".txt"):
        with open(os.path.join("wordpacks", filename), 'r') as f:
            wordpack = os.path.splitext(filename)[0]
            lines = [line.strip() for line in f.readlines()]
            if '===' in lines:
                wordpacks[wordpack] = lines[:lines.index('===')]
                wordpacks[f"{wordpack}+"] = lines[:lines.index('===')] + lines[lines.index('===') + 1:]
            else:
                wordpacks[wordpack] = lines

# Helper for using icons in buttons
# key_dict = {}
# st.write('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css"/>', unsafe_allow_html=True)


# def generate_key(icon, button_key):
#     key_dict[button_key] = icon
#     return {'label': button_key, 'key': button_key}


st.title("Sygil Word Generator")
st.write("Select which wordpacks to include and the number of words to generate:")

if "generator_input" not in st.session_state:
    st.session_state.generator_input = {
        "schema_version": 1,
        "players": [
            {
                "name": None,
                "groups": [
                    {
                        "wordpacks": ["Basic"],
                        "num_words": 10
                    }
                ]
            }
        ]}
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
        player_output = {
            "name": player["name"] or f"Player {player_i + 1}",
            "words": [], "wordpack_origins": [], "group_origins": []
        }
        for group_i, group in enumerate(player["groups"]):
            # Gather choices
            choices = []
            words = set()  # For deduplication
            for wordpack in group["wordpacks"]:
                for word in wordpacks[wordpack]:
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
    for player_i, player in enumerate(players):
        with st.container(border=True):
            # Player name on left, buttons (up/down/clone/delete) on right
            if is_multiple_players:
                with st.container():
                    cols = st.columns([10, 4, 1, 1, 1, 1])
                    player["name"] = cols[0].text_input("Name",
                                                        key=f"name_player-{player['id']}",
                                                        value=player["name"], placeholder=f"Player {player_i + 1}", label_visibility="collapsed")
                    if cols[2].button("↑", key=f"up_button_player-{player['id']}", disabled=player_i == 0):
                        players.pop(player_i)
                        players.insert(player_i - 1, player)
                        st.session_state.generator_input["players"] = players
                        st.rerun()
                    if cols[3].button("↓", key=f"down_button_player-{player['id']}", disabled=player_i == len(st.session_state.generator_input["players"]) - 1):
                        players.pop(player_i)
                        players.insert(player_i + 1, player)
                        st.session_state.generator_input["players"] = players
                        st.rerun()
                    if cols[4].button("C", key=f"clone_button_player-{player['id']}"):
                        copy = deepcopy(player)
                        if copy["name"]:
                            copy["name"] += " (copy)"
                        copy["id"] = generate_player_id()
                        players.insert(player_i + 1, copy)
                        st.session_state.generator_input["players"] = players
                        st.rerun()
                    if cols[5].button("X", key=f"delete_button_player-{player['id']}"):
                        players.pop(player_i)
                        st.session_state.generator_input["players"] = players
                        st.rerun()

            groups = []
            for player_i, group in enumerate(player["groups"]):
                group_values = {}
                cols = st.columns([2, 1, 6])
                group_values["num_words"] = cols[0].number_input(f"Number of words",
                                                                 key=f"num_words_player-{player['id']}_group{player_i}",
                                                                 min_value=1, value=group["num_words"], label_visibility="collapsed")
                cols[1].write(" from ")
                group_values["wordpacks"] = cols[2].multiselect(f"Wordpacks",
                                                                key=f"wordpacks_player-{player['id']}_group{player_i}", options=list(wordpacks.keys()),
                                                                default=group["wordpacks"], label_visibility="collapsed", placeholder="Choose wordpacks...")
                groups.append(group_values)
            player["groups"] = groups

    cols = st.columns([15, 1])
    if cols[1].button("\\+"):
        st.session_state.generator_input["players"].append({
            "name": None,
            "groups": [{"wordpacks": [], "num_words": 1}],
            "id": generate_player_id()
        })
        st.rerun()

    if st.button("Generate"):
        st.session_state.generator_input["players"] = players
        st.session_state.generator_output = generate(st.session_state.generator_input)

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
