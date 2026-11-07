import random

SNARK_FOUND = [
    "yeah it's right there, you just forgot you made it",
    "found it. classic.",
    "it was here the whole time, champ",
    "oh look who showed up",
    "yep, you built this. probably at 3am.",
]

SNARK_VAGUE = [
    "that's a loose query but sure, let's go fishing",
    "casting a wide net with that one",
    "you know you could be more specific, right? anyway —",
    "broad strokes. i respect it.",
]

SNARK_NOTHING = [
    "doesn't exist. yet. (or you named it something unhinged)",
    "nope. either you didn't build it or you called it something else entirely",
    "clean miss. check your spelling or your life choices",
    "not found. the database is not gaslighting you.",
]

def get_snark(pool):
    return random.choice(pool)

if __name__ == "__main__":
    print(get_snark(SNARK_FOUND))
