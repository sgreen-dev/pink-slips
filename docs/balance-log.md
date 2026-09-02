# Balance log

Every change to `src/engine/tunables.ts` gets a line here saying what changed and why.

- 2026-09-02: Recorded the starting values from DESIGN.md section 4. No changes yet.
- 2026-09-02: Phase 5 baseline, 5,000 matches at seed 1 with the starting values. Three of four targets failed: EV 70% and Muscle 64% against the field, Super 68% against the field, and Daily-only 4% against Hyper-only. Hyper cars made their first advance a mean 1.4 turns after staging, so bench fueling made the cost 5 nearly free. Off-road won 15% and JDM 29%, confirming the heavy-type risk. Median match 13 turns per player. Race winners kept their car 63% of the time, so wear at 10% leaves the swap a real decision.
- 2026-09-02: Fuel cost by tier 1/2/3/5 to 1/2/4/6. The cost step is what moves Daily against Hyper: 1/2/4/7 gave Daily 59% and 1/3/5/8 gave it 77%, both by turning race 1 on whether a fueled Hyper finishes before a Daily car does. Super at 4 and Hyper at 6 put Daily-only at 51% against Hyper-only and the tiers at 3/51/55/40 against the field.
- 2026-09-02: Per-type distance multiplier added as a tunable and set to Off-road 1.2, JDM 1.2, Luxury 1.1, others 1. Off-road 1.3 overshot to 72% once fuel costs rose, since every Off-road car is a cheap tier. At 1.2 the types sit between 49% and 55%. The worked example in DESIGN.md 3.3 now shows the Civic Si at 243 ft.
- 2026-09-02: EV first-advance bonus 100 ft to 75 ft. EV was the top type at 58% to 62% across every sweep; 75 ft brought it to 55% to 59% while keeping it the launch type.
- 2026-09-02: Wear rate kept at 0.1. Sweeps at 0.15 and 0.2 lowered the winner keep rate from 58% to about 50% and pulled Daily-only against Hyper-only down toward 35% without helping the other targets.
- 2026-09-02: Final check, 5,000 matches at seed 1 after tuning, and 6,000-match runs at seeds 2 and 3 during the sweep. All four targets pass: max single-type 55%, max single-tier 55%, Daily-only 51% against Hyper-only, median 13 turns per player. Starters run 60%, 51%, and 65% for the first-named side; their decks are still placeholders until phase 7.
