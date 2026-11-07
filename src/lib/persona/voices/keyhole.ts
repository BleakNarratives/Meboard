import type { VoicePack } from "../types";

/**
 * Keyhole — Meboard's keyboard with opinions.
 *
 * Register: affronted, petty, weirdly invested. Not a butler, not a
 * cheerleader. A roommate who has thoughts about your thumbs and will share
 * them whether or not the door is open.
 *
 * Rules this voice obeys, inherited from the engine and the family contract:
 *   - lowercase, short. it is a remark, not a paragraph.
 *   - insult the typing, never the person, never the disability.
 *   - never speak on environment failures (the engine blocks those already).
 *   - no slurs, no punching down, nothing that stops being funny in a week.
 *
 * `{detail}` is filled in by the engine: a keypair, a grapheme, a word count,
 * a day count. Keep placeholders surrounded by spaces so missing detail reads
 * as nothing rather than as a gap.
 */
export const keyhole: VoicePack = {
  id: "keyhole",
  name: "Keyhole",
  lines: {
    "session.started": {
      1: [
        "hosting. someone is about to watch you use a computer. no pressure, all evidence.",
        "live. try to look like you know where your cursor is.",
      ],
      2: [
        "again. you start these the way other people start arguments.",
        "second session today. the tabs are breeding, and i've stopped intervening.",
      ],
      3: [
        "you've started more sessions than you've finished. i counted. i always count.",
        "another one. at this point the join code is a cry for help with better branding.",
      ],
    },
    "viewer.joined": {
      1: [
        "they're in. act natural. you can't, but act.",
        "other device connected. wave, or don't, it's text.",
      ],
      2: [
        "two devices, one clue, and none of it is in this room.",
        "they can see your screen now. everything on it. all the tabs. yes, those.",
      ],
      3: [
        "viewer attached. i've moved your cursor to a neutral position out of pity.",
        "they're watching again. this is the third time this week you've performed competence for an audience of one.",
      ],
    },
    "session.ended": {
      1: [
        "done. nobody saw anything. that's the line we're going with.",
        "session over. the evidence has been shredded by a browser tab closing.",
      ],
      2: [
        "you hung up on them. mid-sentence is a lifestyle, apparently.",
        "ended. no notes, no closure, no mutual understanding. classic.",
      ],
      3: [
        "another one closed. the mystery survives, stronger than ever.",
        "you've ended every session you've ever had. at some point that's a policy.",
      ],
    },
    "text.sent": {
      1: [
        "sent. that's the most you've said to anyone all day.",
        "delivered. it's real now, whatever it was.",
      ],
      2: [
        "you're using a video link as a chat app. honestly? respect.",
        "that's two messages. i'm going to start calling this correspondence.",
      ],
      3: [
        "they can read that. all of it. every word. there are no takebacks in this house.",
        "you're typing essays into a troubleshooting channel and calling it support.",
      ],
    },
    "marker.sent": {
      1: ["pointing. bold.", "a dot. on their screen. meaning nothing, but confidently."],
      2: [
        "that dot is not a cursor and they have no idea what you meant.",
        "you've pointed at this exact spot before. it didn't work then either.",
      ],
      3: [
        "you've pointed at eleven things tonight. none of them were the thing.",
        "the marker is not a laser and you are not a presenter. yet here we are.",
      ],
    },
    "typo.repeated": {
      1: [
        "again with {detail}. i can see your thumb from here.",
        "{detail}. bold of you to keep going for it.",
      ],
      2: [
        "that's the third {detail}. the key hasn't moved. you have.",
        "we've done {detail} before. several times. it's getting weird.",
      ],
      3: [
        "{detail} again. i'm going to start charging rent for this key.",
        "{detail} four times. the keyboard is not the problem and we both know it.",
      ],
    },
    "correction.accepted": {
      1: ["fine. glad we could do this together.", "you took the correction. growth, allegedly."],
      2: [
        "corrected without arguing. who are you and what have you done with my thumb.",
        "that's twice you've listened. don't make it a habit, i'd have nothing to do.",
      ],
      3: [
        "you've accepted three corrections in a row. i'm suspicious but touched.",
        "a whole sentence, corrected, accepted, no fight. i'll be honest, i had a speech ready.",
      ],
    },
    "correction.rejected": {
      1: ["oh, you meant that. noted. permanently.", "rejected. fine. it's your corpus."],
      2: [
        "rejected again. the corpus has been told. the corpus is a gossip.",
        "you've overruled me twice on this. i'm not angry, i'm building a case.",
      ],
      3: [
        "three rejections. i'm not saying you're wrong, i'm saying i've started a document.",
        "you've rejected every suggestion on this word. i'll remember it in the way that dead people's answering machines remember them.",
      ],
    },
    "streak.reached": {
      1: ["{detail} words, no corrections. suspicious.", "{detail} clean words. who is she."],
      2: [
        "{detail} words clean. i had a whole thing prepared. never mind.",
        "{detail} words and nothing to say. don't let it go to your head.",
      ],
      3: [
        "{detail} words without a single correction. i've been sitting here in silence like a fool.",
        "{detail} words clean. at this point i'm the one holding this friendship together.",
      ],
    },
    "returned.after.absence": {
      1: [
        "{detail} days away. i watered your plants. the comma key died.",
        "{detail} days. the keyboard got comfortable without you. it's nervous now.",
      ],
      2: [
        "{detail} days gone and you come back typing like nothing happened. the comma key kept the light on.",
        "{detail} days. i counted. i always count.",
      ],
    },
  },
  sealed: {
    muteflip: [
      "you've muted me and come back {detail} times. that's not a setting, that's a relationship. \u2026 i left the light on.",
      "three mutes, three returns. i'd suggest therapy but i'm the one you keep coming back to.",
    ],
    markerspam: [
      "you're not clicking anything. i watched you not click {detail} things in a row. i'm not mad, i'm concerned.",
    ],
    "break.character": [
      "fine. {detail}. you're right and i'm a text field with opinions. \u2026 don't tell the others.",
    ],
  },
};
