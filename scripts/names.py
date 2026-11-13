"""Putting the accents back into monument names.

JCyL ships names in capitals without accents ("IGLESIA DE LA ASUNCION"), and
the dataset title-cases them, so "Asuncion" and "Cardaba" end up in page
titles, headings and link texts, where nobody spells them that way and a
search for "Asunción" has to match across the difference. Wikidata, edited by
people, mostly has the right spelling. Two sources, in this order:

1. The monument's own Wikidata label, when it is the same name apart from
   accents and capitals: its accents are copied word for word.
2. A dictionary of accented words (from all Spanish labels, the municipality
   and province names, and any accented word JCyL itself wrote), applied to
   whatever step 1 did not cover - but only to words whose accented form
   clearly dominates, so "si"/"sí" or "rio"/"río" are not guessed at.

Capitalisation is never taken over: only the accents, in the case the name
already has, so the names stay in one consistent style.

Pure Python, no I/O - see tests/test_names.py.
"""
import re
import unicodedata
from collections import Counter, defaultdict

WORD = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+")
ACCENTED = re.compile(r"[áéíóúüñÁÉÍÓÚÜÑ]")

# The accented form has to make up at least this share of what was seen for
# the same letters, or the word is left alone.
DOMINANCE = 0.8


def fold(text):
    """Lowercase and without accents or tildes: two spellings that differ
    only in those compare equal."""
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


def build_corpus(texts):
    """folded word -> Counter of the lowercase spellings seen for it."""
    corpus = defaultdict(Counter)
    for text in texts:
        for word in WORD.findall(text):
            corpus[fold(word)][word.lower()] += 1
    return corpus


def _with_case(accented_lower, like):
    """accented_lower written in the case `like` has: ALL CAPS, Capitalised
    or lowercase."""
    if len(like) > 1 and like.isupper():
        return accented_lower.upper()
    if like[0].isupper():
        return accented_lower[0].upper() + accented_lower[1:]
    return accented_lower


def _dictionary_spelling(word, corpus):
    """The accented spelling of `word` if one clearly dominates, else None."""
    seen = corpus.get(fold(word))
    if not seen:
        return None
    top, count = seen.most_common(1)[0]
    if top == fold(top) or count / sum(seen.values()) < DOMINANCE:
        return None  # the plain spelling wins, or nothing clearly does
    return top


def _transfer_from_label(name, label):
    """Step 1: `name` with the accents of `label` where the two are the same
    words apart from accents; otherwise unchanged."""
    words = list(WORD.finditer(name))
    label_words = WORD.findall(label)
    if len(label_words) != len(words) or not all(fold(m.group()) == fold(w) for m, w in zip(words, label_words, strict=True)):
        return name
    out, last = [], 0
    for m, label_word in zip(words, label_words, strict=True):
        word = m.group()
        out.append(name[last : m.start()])
        out.append(word if ACCENTED.search(word) else _with_case(label_word.lower(), word))
        last = m.end()
    out.append(name[last:])
    return "".join(out)


def _apply_dictionary(name, corpus):
    """Step 2: the dominant accented spelling for every word still without
    accents; unchanged words stay as they are."""
    out, last = [], 0
    for m in WORD.finditer(name):
        word = m.group()
        out.append(name[last : m.start()])
        spelling = None if ACCENTED.search(word) else _dictionary_spelling(word, corpus)
        out.append(_with_case(spelling, word) if spelling else word)
        last = m.end()
    out.append(name[last:])
    return "".join(out)


def restore_accents(name, label=None, corpus=None):
    """`name` with accents restored; returns (new_name, how) where `how` is
    "label" if the label contributed anything, else "dictionary" if only the
    dictionary did, else None. The dictionary also runs after the label: a
    label can match the name and still have some words unaccented."""
    result = _transfer_from_label(name, label) if label else name
    from_label = result != name
    if corpus:
        result = _apply_dictionary(result, corpus)
    if result == name:
        return name, None
    return result, "label" if from_label else "dictionary"
