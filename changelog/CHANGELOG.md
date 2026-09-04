# Changelog

Every change to Pink Slips, by the day it landed. Dates are commit dates, newest first. Each line ends with the commit that made the change, so anything here can be traced in the history. A phase entry names its phase from `BUILD_PLAN.md`; the commit that marks a phase done is listed with it. Every commit adds a line here under its day.

## 2026-09-04

- Undo during the mod step: a mod played this turn can be taken back until the step ends or the player advances, in CPU, hotseat, and online play. (the commit that added this line)
- Phase 17, the player name filter: blocked words are refused in any dressing, a few names are reserved for the game, the reason shows before the button, and names stored before the filter are masked. (the commit that added this line)
- The phone music start is confirmed fixed and its backlog entry closed. (the commit that added this line)
- Music starts on the tap: tracks stream through media elements routed into the audio engine instead of being fetched whole and decoded first, the first ramp is 80 ms, and a readout behind `?sound=debug` shows the time from tap to sound. (the commit that added this line)
- The start screen gets the neon road background, washed dark for readable text. (the commit that added this line)
- On the board, each garage shows its staged car first, so the two cars in the race lead their rows. The dev server no longer watches the source image and music folders, so a locked file there cannot stop it. (the commit that added this line)
- This changelog, in its own directory, with a pointer from the README. (the commit that added this file)
- The music shuffles: all six tracks in an order that never repeats one back to back, a new track on every change of screen, and each track playing to its end. The intermittent start on phones is noted in the backlog with what to check. (428a718)
- Music plays on phones: a looping silent clip keeps iPhones in playback mode while the ringer switch is on, and the unlock listens on every kind of gesture until the audio engine runs. (c7d418b)
- Music starts from memory on the first tap, plays lower during a race than on the menus, and dips under every sound effect. (8ca2cc9)
- Phase 16, sound: six original tracks by the owner, effects synthesized in the browser for every moment of a race and a pack opening, and a speaker button with Music and Effects switches that are remembered. (8847fb6, 3902484)
- The backlog is ordered by value to the player in three tiers, and ten new entries join it: a turn timer with forfeit, a concede button, a guided first match, race animation, rematch in the same room, match history and car records, a daily first-win pack, challenging a friend by name, an installable app, and a card detail view. (306f532)
- Backlog entries for sound and for deleting a player. (2e2fba1, efeed9e)
- Instant players replace the GitHub sign-in: a name makes a player at once, a recovery code carries it to another device, the code can be rotated from the profile, and sessions last a year of use. A smoke script makes two players, pairs them, plays a match, and checks both ratings moved, against any deployment. (1bad706, 74f5bc1)
- Sign-in fixes while it still used GitHub: the callback names GitHub's reason when it fails, the login route narrows the client ID, and sign-in is reported only when both secrets exist. (d931ee6, 96358a8, 379d45e)
- Phase 15, accounts and matchmaking: accounts with a synced collection and garages, a ranked queue that pairs the two longest-waiting players, Elo ratings with K of 32, packs awarded by the server, a profile page, and a top-50 leaderboard. (7f08ebe, 58f23df, f7e3d9a)
- Phase 14, online play: the engine moves behind a room service that holds each match and sends every player only what they may see, rooms by link or six-character code, reconnection by token, and a Play online screen. (0c7176d, 2138f1e)

## 2026-09-03

- 48 of the 50 new cars get illustrated card art; two stay on the placeholder until a licensed photo appears. (71cc457)
- The roster grows from 52 to 102 cars, 17 per type, with balance targets still met. (4250993)
- The Pro CPU is described on the start screen by what it does. (a66f27e)
- Phase 13, CPU difficulty levels: Rookie, Street, and Pro, picked on the start screen. (ffc297b, d853dd9)
- An optional stakes mode is noted in the backlog; pink slips stay match prizes and the collection never shrinks. (ac9b050)
- The pack pop-up scrolls on small screens. (aa57233)
- Packs earned in a match are offered for opening right after the winner banner. (50f8ac1)
- Phase 12, foil and holo finishes on pack cards, shown wherever the player's own cards appear. (da7c6c2, 7631c11)
- Phase 11, the collection and packs: every card owned in color with counts, packs earned per match, and a builder that respects what is owned. (a2b459d, dbfc5b3)
- How to play is rewritten for readers from about age nine up, with tests on sentence length and word count. (e588095)
- How to play is rewritten as a walkthrough in the order a first match asks for things. (6d4bc7b)
- The race-end banner stays up until the player presses Continue. (cf01902)

## 2026-09-02

- The board holds at the finish line and shows who won the race, the captured car, and the slip tally. (0253025)
- The matches-played counter's storage id is recorded. (228e7fc)
- In-game rules in a dialog, and a quiet matches-played counter on the start screen. (6eb7905)
- Phase 10, card art: a pipeline proven on five cars, then illustrations for all 52. (8071296, 7c2dbac, 3bf3af4)
- The post-v1 backlog is planned as phases 10 to 15. (5827581)
- Phase 9, polish for release: the phone layout, focus styles, accessibility, and the README. Tagged v1.0.0. (8619114, 334386a)
- Phase 8, the deck builder with saved garages. (6fbc20f, b410dbd)
- Phase 7, CPU play with paced turns, and the final starter decklists. (ebd7797, 292150c)
- Phase 6, the UI and hotseat play. (9c23c85, b2aed83)
- Phase 5, the simulator, and the numbers tuned against it. (a298e64, d91f9c6)
- Phase 4, the CPU opponent. (54b5613, 0cbdc1b)
- Phase 3, every mod effect, type identity, and play limit in the engine. (bb3d90c, cee33db)
- Phase 2, the engine core: tunables, the seeded random source, and the match state machine. (c8febad, bb4000c)
- Phase 1, the card data: 52 verified cars, 30 mods, the starter garages, and the roster report. (4de5699, b2d665b)

## 2026-09-01

- Phase 0, the project set up with Vite, React, TypeScript, Vitest, ESLint, Prettier, and the Pages deploy workflow. (578e048, 2f784a2)
