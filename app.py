"""
This website generates random word-sets for use with the magic system Sygil.
It loads in one or more wordpacks, allows you to select which ones to include, and then draws a given number of words.
"""

import os
import random
import textwrap
from collections import defaultdict
import streamlit as st

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

st.title("Sygil Word Generator")
st.write("Select which wordpacks to include and the number of words to generate:")

if "generated_words" not in st.session_state:
    st.session_state.generated_words = [[]]


def generate_words(groups):
    generated_words = [[] for _ in range(num_players)]
    for i in range(num_players):
        for group in groups:
            choices = []
            words = set()  # For deduplication
            for wordpack in group["wordpacks"]:
                for word in wordpacks[wordpack]:
                    if word in words:
                        continue
                    choices.append((word, wordpack))
                    words.add(word)
            try:
                generated_words[i] += random.sample(choices, group["num_words"])
            except ValueError:
                st.error(f"Cannot generate {group['num_words']} unique words from wordpacks {group['wordpacks']}. Please reduce the number of words or add more wordpacks.")
                return
    st.session_state.generated_words = generated_words


with st.container(border=True):
    cols = st.columns([1, 2, 3, 1, 2])
    cols[0].write("Players:")
    num_players = cols[1].number_input("Number of players", min_value=1, value=1, label_visibility="collapsed")
    cols[3].write("Groups:")
    num_groups = cols[4].number_input("Number of groups", min_value=1, value=1, label_visibility="collapsed")

    groups = []
    for i in range(num_groups):
        group = {}
        cols = st.columns([2, 1, 6])
        group["num_words"] = cols[0].number_input(f"Number of words", key=f"num_words_{i}", min_value=1, value=10, label_visibility="collapsed")
        cols[1].write(" from ")
        group["wordpacks"] = cols[2].multiselect(f"Wordpacks", key=f"wordpacks_{i}", options=list(wordpacks.keys()), default=["Basic"] if i == 0 else [], label_visibility="collapsed")
        groups.append(group)

    if st.button("Generate Words"):
        generate_words(groups)

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


for i in range(len(st.session_state.generated_words)):
    display_words = st.session_state.generated_words[i]
    if alphabetize:
        display_words = sorted(display_words)
    if len(st.session_state.generated_words) > 1:
        st.markdown(f"### Player {i + 1}")
    if do_group:
        grouped_words = [(wordpack, [word for word, wpack in display_words if wpack == wordpack]) for wordpack, _ in sorted(wordpacks.items())]
        grouped_words = defaultdict(list)
        for word, wordpack in display_words:
            grouped_words[wordpack].append(word)
        st.markdown("\n".join(f"* {wordpack}:\n" + textwrap.indent(render_list(words, pre=True), "  ") for wordpack, words in sorted(grouped_words.items())))
    else:
        st.markdown(render_list([word for word, _ in display_words]))
