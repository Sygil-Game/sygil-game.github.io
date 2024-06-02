"""
This website generates random word-sets for use with the magic system Sygil.
It loads in one or more wordpacks, allows you to select which ones to include, and then draws a given number of words.
"""

import os
import random
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
                wordpacks[f"{wordpack}+"] = lines[:lines.index('===')] + lines[lines.index('===')+1:]
            else:
                wordpacks[wordpack] = lines

st.title("Sygil Word Generator")
st.write("Select which wordpacks to include and the number of words to generate:")

if "generated_words" not in st.session_state:
    st.session_state.generated_words = []

def generate_words():
    choices = [(word, wordpack) for wordpack in selected_wordpacks for word in wordpacks[wordpack]]
    try:
        st.session_state.generated_words = random.sample(choices, num_words)
    except ValueError:
        st.error(f"Cannot generate {num_words} unique words from the selected wordpacks. Please reduce the number of words or add more wordpacks.")
    
with st.form(key="my_form"):
    selected_wordpacks = st.multiselect("Wordpacks:", list(wordpacks.keys()), default=["Basic"])
    num_words = st.number_input("Number of words to generate:", min_value=1, value=10)
    if st.form_submit_button("Generate Words"):
        generate_words()

col1, col2 = st.columns(2)
alphabetize = col1.checkbox("Alphabetize")
do_group = col2.checkbox("Group")

display_words = st.session_state.generated_words[:]
if alphabetize:
    display_words.sort()
if do_group:
    grouped_words = [(wordlist, [word for word, wordlist in display_words if wordlist == wordlist]) for wordlist, _ in sorted(wordpacks.items())]
    grouped_words = defaultdict(list)
    for word, wordlist in display_words:
        grouped_words[wordlist].append(word)
    st.markdown("\n".join(f"* {wordlist}:\n  * {', '.join(words)}" for wordlist, words in sorted(grouped_words.items())))
else:
    st.markdown("\n".join(f"* {word}" for word, _ in display_words))
