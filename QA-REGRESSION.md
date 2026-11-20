# QA regression catalogue

A catalogue of atomic regression tests for **Inside the Machine**
(https://learning-llms.rightspeedlabs.com). Read `QA-AUTOMATION.md` first for
environments, routes, layout and saved state.

## How to use this file

- Each row is one test that can pass or fail on its own. The **Min** column is
  an estimate of human minutes.
- To build a work order, pick rows until the minutes add up to 30 to 60. Rows
  in the same section share setup, so grouping by section is fastest.
- **Start state** codes, used in the tables:
  - **F** = fresh: site data cleared, or a new browser profile.
  - **P** = placement finished or skipped, no lessons started.
  - **L1** = at least one lesson finished.
  - **L3** = at least three lessons finished, two of them in the same stage.
  - **Any** = state does not matter.
- Unless a row says otherwise, run at desktop width (1280px or wider) in a
  current Chromium, Safari or Firefox.
- Things that legitimately vary between runs (option order, which questions
  appear, lane) are listed in `QA-AUTOMATION.md`. Do not fail a test on them.
- Section 9 is a template applied to each of the 22 lessons. It is the bulk of
  a full regression.

Suggested work orders are at the end.

---

## 1. Site shell and navigation

| ID | Start | Test | Min |
|---|---|---|---|
| NAV-01 | F | Open the production URL. The Home page renders with the hero heading, the animation and the six-stage map. No console errors. | 2 |
| NAV-02 | Any | Click the brand "Inside the Machine" from a lesson. Home opens. | 1 |
| NAV-03 | Any | Click "Map" in the top bar from Review. Home opens. | 1 |
| NAV-04 | Any | Click "Review" in the top bar from Home. The Review page opens. | 1 |
| NAV-05 | Any | Open `/#/lesson/attention` directly in a new tab. The Attention lesson opens. | 1 |
| NAV-06 | Any | Open `/#/lesson/not-a-lesson`. Home is shown, with no error screen. | 1 |
| NAV-07 | Any | Open `/#/some-unknown-route`. Home is shown. | 1 |
| NAV-08 | Any | Go Home → a lesson → Review, then press browser Back twice. Each press returns to the previous page. | 2 |
| NAV-09 | Any | In a lesson, press browser Forward after Back. The lesson is shown again. | 1 |
| NAV-10 | Any | Reload the page on Home, on a lesson, on Placement and on Review. Each reloads to the same page. | 3 |
| NAV-11 | Any | The top bar stays visible while scrolling a long lesson step. | 1 |
| NAV-12 | Any | The browser tab title reads "Inside the Machine — how LLMs work". | 1 |
| NAV-13 | Any | Navigating to a new page starts at the top of the page, not part-way down. | 2 |
| NAV-14 | Any | Tab through the top bar with the keyboard. Brand, Map, Review and the sound button each take focus and activate with Enter. | 3 |

## 2. Redirects from the old site (hosted environments only)

| ID | Start | Test | Min |
|---|---|---|---|
| RED-01 | Any | Open `/topics/attention`. The browser lands on `/#/lesson/attention`. | 1 |
| RED-02 | Any | Open `/topics/attention/` (trailing slash). Same result. | 1 |
| RED-03 | Any | Open `/topics/rag` and `/topics/tokenization`. Each lands on the matching lesson. | 2 |
| RED-04 | Any | Open `/topics/not-a-lesson`. The browser lands on Home, with no error page. | 1 |
| RED-05 | Any | Open `/audio-tutor`. The browser lands on Home. | 1 |
| RED-06 | Any | Open `/glossary`. The browser lands on Home. | 1 |
| RED-07 | Any | Open `/interview-drills`. The browser lands on Home. | 1 |
| RED-08 | Any | Open `/audio-tutor/`, `/glossary/` and `/interview-drills/` (trailing slash). Each lands on Home. | 2 |

## 3. Sound effects

| ID | Start | Test | Min |
|---|---|---|---|
| SND-01 | F | The top-bar button reads "Sound effects on" by default at desktop width. | 1 |
| SND-02 | Any | Click the button. The label changes to "Sound effects off" and the icon shows a cross. | 1 |
| SND-03 | Any | With sound on, answer a question correctly and one incorrectly. Two different short sounds play. | 3 |
| SND-04 | Any | With sound on, move a lab slider and change lesson step. A sound plays for each. | 2 |
| SND-05 | Any | With sound off, repeat SND-03 and SND-04. No sound plays. | 3 |
| SND-06 | Any | Turn sound off and reload. The button still reads "Sound effects off". | 1 |
| SND-07 | Any | Hover the button. A tooltip says the sounds are click and answer sounds and that there is no narration. | 1 |
| SND-08 | Any | At a window narrower than 600px, the button shows the icon only and still toggles. | 2 |
| SND-09 | F | No sound plays on first page load before any click. | 1 |

## 4. Home page

| ID | Start | Test | Min |
|---|---|---|---|
| HOM-01 | F | The hero shows two buttons: "Find my starting point · 2 min" and "Start at lesson 1". | 1 |
| HOM-02 | F | "Find my starting point" opens Placement. | 1 |
| HOM-03 | F | "Start at lesson 1" opens the Tokenization lesson. | 1 |
| HOM-04 | P | With placement done and no lessons started, the hero shows one button, "Continue: Tokenization →". | 1 |
| HOM-05 | Any | Start a lesson, leave at the Play step, return Home. The hero button reads "Resume: <that lesson> →" and opens it. | 3 |
| HOM-06 | L1 | The hero shows "<n> / 22 complete" matching the number of finished lessons. | 1 |
| HOM-07 | Any | The hero animation loops: tokens, vectors, attention arcs, a distribution, then a sampled token. Nothing overlaps or is clipped. | 2 |
| HOM-08 | Any | The map shows six stages in order: Text in, The machine, Learning, Speaking, Adapting, Steering. | 1 |
| HOM-09 | Any | The stages hold 4, 5, 3, 3, 4 and 3 lesson cards, 22 in total. | 2 |
| HOM-10 | Any | Each lesson card shows a number ring, title, one-line description and minutes. | 2 |
| HOM-11 | Any | Clicking any lesson card opens that lesson. No card is locked, including the last. | 3 |
| HOM-12 | Any | A started lesson's card shows "in progress". | 1 |
| HOM-13 | L1 | A finished lesson's card shows a tick in its ring and a mastery percentage. | 1 |
| HOM-14 | L1 | A finished lesson that is not yet due shows "review in <n>d". | 1 |
| HOM-15 | Any | The next unfinished lesson's card is visually highlighted. | 1 |
| HOM-16 | F | No "Review due" card is shown. | 1 |
| HOM-17 | L1 | With a lesson due (see REV-02 for setup), a "Review due" card appears with a "Start review →" button that opens Review. | 3 |
| HOM-18 | Any | The "How this course teaches" section is present below the map. | 1 |
| HOM-19 | Any | Each stage header shows its number, title and guiding question. | 1 |
| HOM-20 | Any | Stage colours differ per stage and match the colour used inside that stage's lessons. | 3 |

## 5. Reset progress

| ID | Start | Test | Min |
|---|---|---|---|
| RST-01 | L1 | Click "Reset progress" in the Home footer. A browser confirm dialog appears. | 1 |
| RST-02 | L1 | Cancel the dialog. Progress is unchanged. | 1 |
| RST-03 | L1 | Accept the dialog. All cards return to their unstarted state and the hero shows the two first-visit buttons. | 2 |
| RST-04 | L1 | After a reset, reload. The site is still in the fresh state. | 1 |
| RST-05 | L1 | After a reset, open a previously finished lesson. It starts at Predict with no goals ticked. | 2 |

## 6. Placement

| ID | Start | Test | Min |
|---|---|---|---|
| PLC-01 | F | Placement shows "Placement · 1 of 6" with a stage name and one question. | 1 |
| PLC-02 | F | Each question has a "Not sure yet" option, and it is always last. | 2 |
| PLC-03 | F | Reload on question 1 several times. The other options change order; "Not sure yet" stays last. | 2 |
| PLC-04 | F | Pick an option. Feedback appears, the options lock, and a "Next →" button appears. | 1 |
| PLC-05 | F | No "Next" button is shown before an option is picked. | 1 |
| PLC-06 | F | Answer all six. The counter runs 1 of 6 to 6 of 6, one stage per question, in stage order. | 3 |
| PLC-07 | F | On question 6 the button reads "See my starting point →". | 1 |
| PLC-08 | F | The result screen lists all six stages, each marked "Ahead" or "Guided". | 2 |
| PLC-09 | F | Answer every question "Not sure yet". All six stages show "Guided" and the summary says everything starts guided. | 3 |
| PLC-10 | F | Answer every question correctly. All six stages show "Ahead" and the summary names them. | 4 |
| PLC-11 | F | "Open the map →" on the result screen opens Home. | 1 |
| PLC-12 | F | "Skip placement" on any question opens Home, and the hero no longer offers placement. | 2 |
| PLC-13 | F | After finishing placement, Home's hero shows "Continue: Tokenization →". | 1 |
| PLC-14 | F | Use keys A to E to pick an option. It behaves like a click. | 2 |
| PLC-15 | F | A wrong pick shows "Noted", not a failure message. | 1 |

## 7. Lesson player frame (run on any one lesson)

| ID | Start | Test | Min |
|---|---|---|---|
| LSN-01 | Any | The header shows "← Map", a stage pill, a minutes pill and the lesson title. | 1 |
| LSN-02 | Any | The step bar shows six steps: Predict, Play, Explain, What breaks, Check, Recap. | 1 |
| LSN-03 | F | On a new lesson only Predict is enabled in the step bar. | 1 |
| LSN-04 | Any | After reaching Explain, clicking Predict or Play in the step bar goes back to that step. | 2 |
| LSN-05 | Any | Steps not yet reached cannot be clicked. | 1 |
| LSN-06 | Any | "← Map" returns to Home and the lesson card shows "in progress". | 1 |
| LSN-07 | Any | Leave a lesson at What breaks and reopen it. It resumes at What breaks. | 2 |
| LSN-08 | Any | Changing step scrolls the page to the top. | 1 |
| LSN-09 | Any | Double-click a "next" button. The lesson advances one step, not two. | 2 |
| LSN-10 | Any | Every step change shows content immediately. No step renders as an empty page. Repeat while a lab animation is running. | 4 |
| LSN-11 | Any | The accent colour inside the lesson matches the lesson's stage colour on the map. | 1 |
| LSN-12 | L1 | Reopen a finished lesson. All six steps are enabled and it opens at Predict with a "Skip, I've done this →" button. | 2 |

## 8. Adaptation

| ID | Start | Test | Min |
|---|---|---|---|
| ADP-01 | P (all "Ahead") | Answer a lesson's Predict question correctly. A "fast lane" pill appears, with a pace note and a "Skip to the hard questions" button. | 3 |
| ADP-02 | P (all "Ahead") | Click "Skip to the hard questions". The lesson jumps to Check. | 2 |
| ADP-03 | P (all "Ahead") | In the fast lane, open Explain. "Go deeper" is open and tagged "opened for you". | 2 |
| ADP-04 | P (all "Guided") | Answer a Predict question wrongly. A "guided" pill appears. | 2 |
| ADP-05 | P (all "Guided") | In the guided lane, open Explain. "Worked example" is open and tagged "opened for you". | 2 |
| ADP-06 | P (skipped) | Answer Predict correctly with placement skipped. No lane pill is shown. | 2 |
| ADP-07 | Any | In Check, answer the first three questions correctly. The difficulty pips step up and the step ends before six questions. | 4 |
| ADP-08 | Any | In Check, answer every question wrongly. The step ends at six questions and no further question is offered. | 5 |
| ADP-09 | Any | In Check, answer two questions wrongly in a row. A coaching note appears with "Reopen the worked example" and "Back to the lab". | 3 |
| ADP-10 | Any | From that note, "Back to the lab" opens Play and "Reopen the worked example" opens Explain. | 2 |
| ADP-11 | Any | In Check, answer several questions wrongly within a few seconds each. A note about pace appears. | 3 |
| ADP-12 | Any | Finish Check with fewer than half right. The Recap reports the score honestly and offers a way back to the lab. | 4 |
| ADP-13 | Any | Finish Check with all right. The Recap reports the score and the card's mastery percentage is higher than after ADP-12. | 4 |
| ADP-14 | Any | The Check step never shows the same question twice in one run. | 3 |
| ADP-15 | Any | Check always asks at least three questions. | 3 |

## 9. Per-lesson template (apply to each of the 22 lessons)

Run these rows on one lesson at a time. A full pass on one lesson is about
14 minutes. Lesson ids are in section 10.

| ID | Start | Test | Min |
|---|---|---|---|
| TPL-01 | Any | Predict: one question with 3 or 4 options is shown and the heading says it is not scored. | 1 |
| TPL-02 | Any | Predict: pick a wrong option. Feedback explains why it is wrong and shows "The right answer:" with an explanation. | 1 |
| TPL-03 | Any | Predict: after answering, a sentence leading into the lab and a "See it happen →" button appear. | 1 |
| TPL-04 | Any | Play: the lab renders fully, with no blank panel, clipped text or overlapping labels. | 1 |
| TPL-05 | Any | Play: four goals are listed, none ticked on arrival, and the sticky strip reads "Goal 1 of 4". | 1 |
| TPL-06 | Any | Play: every control in the lab responds (each slider, button, toggle, draggable item, text field), and the numbers or picture change with it. | 2 |
| TPL-07 | Any | Play: follow each goal's instruction. Each ticks itself and reveals a note. The strip advances and ends on "All goals done". | 3 |
| TPL-08 | Any | Play: each revealed note matches what is on screen at that moment (numbers quoted in the note agree with the lab). | 1 |
| TPL-09 | Any | Play: goals stay ticked after leaving and reopening the lesson. | 1 |
| TPL-10 | Any | Explain: the core explanation is visible. "Worked example" and "Go deeper" open and close on click. Formulas render as maths, not raw code. | 1 |
| TPL-11 | Any | What breaks: 3 or 4 titled failure modes are shown. | 0.5 |
| TPL-12 | Any | Check: each multiple-choice question has 4 options and exactly one is accepted as correct. | 1 |
| TPL-13 | Any | Check: a wrong pick shows that option's explanation and the right answer's explanation. | 0.5 |
| TPL-14 | Any | Check: the numeric question accepts the right value, rejects a clearly wrong one, and the Check button is disabled while the field is empty. | 1 |
| TPL-15 | Any | Check: a hint button is offered on harder questions and reveals a hint that does not state the answer. | 0.5 |
| TPL-16 | Any | Recap: shows the check score, 3 or 4 takeaways and a link to the next lesson (or to the map on the last lesson). | 0.5 |
| TPL-17 | Any | No console errors from Predict through Recap. | 0 |
| TPL-18 | Any | Phone width (390px): repeat TPL-04 and TPL-06. No horizontal page scroll; wide diagrams scroll inside their own box. | 2 |

## 10. Lesson-specific checks

Run alongside the template for the named lesson.

| ID | Lesson id | Test | Min |
|---|---|---|---|
| LES-01 | `tokenization` | Part B shows a loading state, then real token pieces and ids for the default sentence. | 1 |
| LES-02 | `tokenization` | Type your own text in part B. The pieces, token count and character count update as you type. | 2 |
| LES-03 | `tokenization` | Type Japanese text and an emoji. Pieces render without broken characters. | 2 |
| LES-04 | `tokenization` | Part A: step the merges forward and back. The token count falls with each merge and the chips animate into place. | 2 |
| LES-05 | `tokenization` | With the network blocked for the tokenizer file, part B shows a fallback and a retry, and the page does not break. | 3 |
| LES-06 | `vocabulary-handling` | Move the vocabulary slider end to end. The sentence token count, corpus size and "never used" line all change. | 2 |
| LES-07 | `embeddings` | The scatter is labelled as hand-placed. Hovering or selecting words shows their similarity. | 2 |
| LES-08 | `embeddings` | Each analogy preset lands on the expected word once the layout is fully trained. | 2 |
| LES-09 | `positional-encoding` | With position off, shuffling the words leaves the highlighted word's output unchanged. With position on, it changes. | 2 |
| LES-10 | `softmax` | The "shift all scores" control reports a largest probability change of 0.000. | 1 |
| LES-11 | `softmax` | Probabilities always sum to 100% while dragging any score. | 1 |
| LES-12 | `attention` | A visible line states the vectors are hand-built. Step 3 is labelled as a weighted sum of values with value = key. | 1 |
| LES-13 | `attention` | Swap the sentence ending (tired / wide). The strongest weight from "it" moves between "animal" and "street". | 2 |
| LES-14 | `attention` | Turn on the causal mask. Tokens to the right of the selected token get zero weight. | 1 |
| LES-15 | `context-window` | Doubling the token count with the mask set to none roughly quadruples the comparison count. | 2 |
| LES-16 | `context-window` | The conversation panel drops the oldest turn when the window is exceeded. | 2 |
| LES-17 | `vanishing-gradients` | At factor 0.9 without skip connections, the "under 1%" goal completes at depth 44 and not by dragging depth to the maximum. | 2 |
| LES-18 | `mixture-of-experts` | The balancing control is labelled "simulated". Stored and used parameter counts update with expert count and top-k. | 2 |
| LES-19 | `cross-entropy` | Moving probability between two wrong words leaves the loss unchanged. | 1 |
| LES-20 | `kl-divergence` | The two directions of KL show different values on the "Q misses a mode" preset. | 1 |
| LES-21 | `kl-divergence` | Dragging a bar never produces a negative or non-numeric value. Bars stop at a 0.1% floor. | 2 |
| LES-22 | `autoregressive-vs-masked` | Generate: the first caption reads a pass that reads 3 tokens, and each pass adds one token. | 2 |
| LES-23 | `autoregressive-vs-masked` | Hide all 8 words. The caption says all 8 are hidden and every answer is a blind guess. | 1 |
| LES-24 | `temperature` | The rank number before each word never changes at any temperature. | 2 |
| LES-25 | `temperature` | Sampling 200 tokens at 0.3 or lower puts nearly all draws on one word; at 1.5 or higher the draws spread out. | 2 |
| LES-26 | `top-k-top-p` | In the confident context, top-p keeps fewer tokens than in the uncertain context at the same p. | 2 |
| LES-27 | `beam-vs-greedy` | Greedy, width 2 and width 3 find three different sentences with rising probability. The width-2 note reads "1.75 times". | 2 |
| LES-28 | `beam-vs-greedy` | The numeric question asks for a value without a minus sign and accepts 4.60 and 4.61. | 1 |
| LES-29 | `catastrophic-forgetting` | Train with "none", replay, penalty and adapter. Each adds a row to the finished-runs table with both losses. | 3 |
| LES-30 | `catastrophic-forgetting` | Train with the adapter, then switch it to "removed". Loss A returns to its starting value. | 2 |
| LES-31 | `lora` | A caption states the update is synthetic and that B and A come from SVD. Error falls as rank rises and reaches 0 at rank 16. | 2 |
| LES-32 | `lora` | Dragging the lower rank slider quickly through 16 does not tick the "under 1%" goal; resting on it does. | 1 |
| LES-33 | `qlora` | At 4 bits with even levels, the readout shows a level gap of 0.133 and an update of 1/13,333 of a gap. | 1 |
| LES-34 | `qlora` | Memory totals change with model size and bit width, and the footnote lists what the figure leaves out. | 1 |
| LES-35 | `distillation` | Train with the mix fully on labels: all wrong tokens end equal. Train fully on soft targets: the wrong tokens keep the teacher's ranking. | 3 |
| LES-36 | `zero-shot-vs-few-shot` | The belief panel carries a "SIMULATED" label. Token counts are shown and grow as example cards are added. | 2 |
| LES-37 | `zero-shot-vs-few-shot` | The plateau goal does not tick at three cards. It ticks after all three negative cards plus one more. | 2 |
| LES-38 | `chain-of-thought` | The step-by-step lane is labelled "Scripted trace, not model output". Injecting an error changes every later line and the final answer. | 2 |
| LES-39 | `chain-of-thought` | The direct-answer lane's first press is a miss, and the tally after ten presses at 0.50 is 5 of 10. | 2 |
| LES-40 | `rag` | The pipeline shows the model as "not run". Changing k changes the retrieved chunks and the prompt token count. | 2 |
| LES-41 | `rag` | "Return window" at k = 1 retrieves only the outdated policy; at k = 2 it shows a conflict. The goal ticks only after seeing both. | 2 |
| LES-42 | `rag` | Type your own question. Results are ranked with scores and the verdict says there is no answer key. | 2 |

Lesson ids by stage, for scheduling section 9:

| Stage | Lesson ids |
|---|---|
| 1. Text in | `tokenization`, `vocabulary-handling`, `embeddings`, `positional-encoding` |
| 2. The machine | `softmax`, `attention`, `context-window`, `vanishing-gradients`, `mixture-of-experts` |
| 3. Learning | `cross-entropy`, `kl-divergence`, `autoregressive-vs-masked` |
| 4. Speaking | `temperature`, `top-k-top-p`, `beam-vs-greedy` |
| 5. Adapting | `catastrophic-forgetting`, `lora`, `qlora`, `distillation` |
| 6. Steering | `zero-shot-vs-few-shot`, `chain-of-thought`, `rag` |

## 11. Question card behaviour (run on any Check step)

| ID | Start | Test | Min |
|---|---|---|---|
| QST-01 | Any | After picking an option, all options lock and cannot be changed. | 1 |
| QST-02 | Any | The correct option is marked as correct after any pick. | 1 |
| QST-03 | Any | Keys A to D pick the matching option. Keys beyond the option count do nothing. | 2 |
| QST-04 | Any | Reopen the same lesson's Check several times. The same question shows its options in a different order. | 3 |
| QST-05 | Any | Numeric: an answer inside the tolerance is accepted (try the value rounded to one fewer decimal). | 2 |
| QST-06 | Any | Numeric: "1,260" with a comma is read as 1260. | 1 |
| QST-07 | Any | Numeric: letters or an empty field do not submit, and the page does not break. | 1 |
| QST-08 | Any | Numeric: pressing Enter in the field submits. | 1 |
| QST-09 | Any | Numeric: after submitting, the field locks and the worked answer is shown. | 1 |
| QST-10 | Any | The difficulty pips beside the question show 1, 2 or 3 and name the level on hover. | 1 |
| QST-11 | Any | The progress line under the question reads "question 1" at first, then "<right> of <asked> right". | 1 |
| QST-12 | Any | The last question's button reads "Finish the lesson →"; earlier ones read "Next question →". | 2 |
| QST-13 | Any | On a phone, the numeric field brings up a number keypad and any required answer can be typed on it. | 3 |

## 12. Review

| ID | Start | Test | Min |
|---|---|---|---|
| REV-01 | F | Open Review. It shows "Nothing to review yet" and a link back to the map. | 1 |
| REV-02 | L1 | Set the device clock two days ahead (or seed a past due date) and reload Home. The finished lesson's card shows "review due" and the "Review due" card appears. | 4 |
| REV-03 | L1 | Start a review. A loading state shows briefly, then "Mixed review · 1 of <n>". | 1 |
| REV-04 | L3 | A review session holds at most five questions. | 3 |
| REV-05 | L3 | Questions from different lessons are mixed in one session, and the accent colour changes to match each question's stage. | 2 |
| REV-06 | L1 | Answer every question. The end screen reads "<right> of <n> from memory". | 3 |
| REV-07 | L1 | "Back to the map →" on the end screen opens Home. | 1 |
| REV-08 | L1 | After a review answered correctly, the lesson's card shows a later "review in <n>d" than before. | 3 |
| REV-09 | L1 | After a review answered wrongly, the lesson comes due again the next day. | 4 |
| REV-10 | L1 | "Exit" during a review returns Home without an error; opening Review again starts a new session. | 2 |
| REV-11 | L1 | With a finished lesson that is not yet due, opening Review directly still offers a session from finished lessons. | 2 |
| REV-12 | L3 | With two finished lessons in the same stage, a session can include questions from both. | 3 |
| REV-13 | L1 | A question missed in the lesson's Check is the one asked for that lesson in review. | 4 |
| REV-14 | L1 | When every lesson is finished, Home's hero button reads "Run a mixed review →" and opens Review. (Seed state; do not finish 22 lessons by hand.) | 3 |

## 13. Saved state

| ID | Start | Test | Min |
|---|---|---|---|
| STA-01 | Any | Tick two goals in a lab, close the tab, reopen the site. The goals are still ticked. | 2 |
| STA-02 | L1 | Finish a lesson, close the browser, reopen. The card still shows finished with the same mastery. | 2 |
| STA-03 | Any | Open the site in two tabs. Finish a step in one, reload the other. The second tab shows the new progress. | 3 |
| STA-04 | Any | Open the site in a private window. It starts fresh and works through one full lesson. | 5 |
| STA-05 | Any | With site storage blocked in browser settings, the site still loads and a lesson can be completed in one sitting. | 5 |
| STA-06 | Any | Put invalid text in the `llmsv2.learner` storage key and reload. The site loads in the fresh state, with no error screen. | 2 |
| STA-07 | L1 | Progress made on production is not visible on a preview URL, and the reverse. | 2 |
| STA-08 | L1 | State saved before the commit under test still loads after it: cards, goals and review dates are intact. | 4 |

## 14. Responsive layout

| ID | Start | Test | Min |
|---|---|---|---|
| RSP-01 | Any | 390px wide: Home has no horizontal scroll; lesson cards stack in one column. | 2 |
| RSP-02 | Any | 390px wide: the top bar fits on one line with brand, Map, Review and the sound icon. | 1 |
| RSP-03 | Any | 390px wide: Placement options are fully readable and tappable. | 2 |
| RSP-04 | Any | 390px wide: the six-step bar is readable and tappable. | 1 |
| RSP-05 | Any | 390px wide: the sticky goal strip in Play does not cover lab controls. | 2 |
| RSP-06 | Any | 768px wide (tablet): Home, one lesson and Review lay out without overlap. | 3 |
| RSP-07 | Any | 1920px wide: content stays in a centred column and does not stretch edge to edge. | 2 |
| RSP-08 | Any | Rotate a phone from portrait to landscape inside a lab. The lab redraws correctly. | 2 |
| RSP-09 | Any | Browser zoom at 200% on a lesson: text reflows and nothing is cut off. | 3 |
| RSP-10 | Any | On a real touch device, drag a slider and a draggable bar in two different labs. Each follows the finger without scrolling the page. | 5 |

## 15. Accessibility

| ID | Start | Test | Min |
|---|---|---|---|
| A11-01 | Any | Complete one lesson's Predict and Check steps with the keyboard only. | 5 |
| A11-02 | Any | Every focusable control shows a visible focus ring. | 3 |
| A11-03 | Any | Sliders respond to arrow keys. | 2 |
| A11-04 | Any | With "reduce motion" set in the operating system, the site is usable and no step is left blank. | 4 |
| A11-05 | Any | A screen reader announces the step bar as lesson steps and names the current step. | 3 |
| A11-06 | Any | A screen reader announces the sound button's state. | 1 |
| A11-07 | Any | Answer feedback is readable by a screen reader after a pick. | 3 |
| A11-08 | Any | Body text and muted text meet a 4.5:1 contrast ratio against the background. | 4 |
| A11-09 | Any | Correct and wrong answers are distinguishable without colour (wording or icon). | 2 |

## 16. Loading, performance and resilience

| ID | Start | Test | Min |
|---|---|---|---|
| PRF-01 | F | First load of Home on a normal connection shows content within 3 seconds. | 2 |
| PRF-02 | Any | Opening a lesson for the first time shows a loading state, then the lesson. | 1 |
| PRF-03 | Any | On a throttled "Slow 3G" connection, Home and one lesson still load and work. | 5 |
| PRF-04 | Any | The large tokenizer file is requested only on `tokenization`, `zero-shot-vs-few-shot`, `chain-of-thought` and `rag`, not on Home or other lessons. | 4 |
| PRF-05 | Any | Go offline after a lesson has loaded. The current lesson keeps working through Recap. | 3 |
| PRF-06 | Any | Leave a lab open for five minutes. Animations keep running smoothly and the tab's memory does not climb steadily. | 6 |
| PRF-07 | Any | Open and leave ten lessons in a row without reloading. Each renders correctly and the site stays responsive. | 8 |
| PRF-08 | Any | No request is made to any third-party domain during a full lesson. | 3 |
| PRF-09 | Any | Fonts render as the designed typefaces, not a system fallback. | 1 |

## 17. Browser coverage

Run SMK-01 (below) in each.

| ID | Start | Test | Min |
|---|---|---|---|
| BRW-01 | F | Chrome, current version, desktop. | 10 |
| BRW-02 | F | Safari, current version, macOS. | 10 |
| BRW-03 | F | Firefox, current version, desktop. | 10 |
| BRW-04 | F | Edge, current version, desktop. | 10 |
| BRW-05 | F | Safari on a current iPhone. | 10 |
| BRW-06 | F | Chrome on a current Android phone. | 10 |

## 18. Smoke test

| ID | Start | Test | Min |
|---|---|---|---|
| SMK-01 | F | Open Home, finish Placement, open Tokenization, complete one goal, walk every step to Recap, return Home and confirm the card shows finished. No console errors. | 10 |
| SMK-02 | Any | After a deploy, the production URL serves the new build: the change under test is visible, and a hard refresh is not needed more than once. | 3 |

---

## Suggested work orders

Each is sized for 30 to 60 minutes.

| Work order | Rows | Approx. min |
|---|---|---|
| A. Shell and redirects | NAV-01 to NAV-14, RED-01 to RED-08, SND-01 to SND-09 | 45 |
| B. Home and reset | HOM-01 to HOM-20, RST-01 to RST-05 | 40 |
| C. Placement and lesson frame | PLC-01 to PLC-15, LSN-01 to LSN-12 | 45 |
| D. Adaptation | ADP-01 to ADP-15 | 45 |
| E. Question cards and saved state | QST-01 to QST-13, STA-01 to STA-08 | 45 |
| F. Review | REV-01 to REV-14 | 40 |
| G. Stage 1 lessons | Section 9 on 4 lessons, LES-01 to LES-09 | 60 (split in two if TPL-18 is included) |
| H. Stage 2 lessons | Section 9 on 5 lessons, LES-10 to LES-18 | split into two orders of 40 to 45 |
| I. Stage 3 lessons | Section 9 on 3 lessons, LES-19 to LES-23 | 50 |
| J. Stage 4 lessons | Section 9 on 3 lessons, LES-24 to LES-28 | 50 |
| K. Stage 5 lessons | Section 9 on 4 lessons, LES-29 to LES-35 | split into two orders of 35 to 40 |
| L. Stage 6 lessons | Section 9 on 3 lessons, LES-36 to LES-42 | 55 |
| M. Responsive and touch | RSP-01 to RSP-10, TPL-18 on 3 lessons | 35 |
| N. Accessibility | A11-01 to A11-09 | 30 |
| O. Loading and resilience | PRF-01 to PRF-09 | 35 |
| P. Browser sweep | BRW-01 to BRW-06 | 60 |

For a change to a single lesson, the minimum set is section 9 on that lesson,
its rows in section 10, and SMK-01.

## Status of this catalogue

- These rows describe intended behaviour. Most have not been run by a person
  yet. Automated runs so far cover only: all 22 lessons walked from Predict to
  Recap at 1280px and 390px in Chromium, with no console errors and no
  horizontal scroll.
- Sections 14 (touch), 15 and 17 are the least exercised. Expect real findings
  there on a first pass.
- If a row's expected result disagrees with the site, report it. Either may be
  wrong.
