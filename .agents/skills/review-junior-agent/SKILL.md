---
name: review-junior-agent
description: skill for codex models, running on the codex agent by openai, to review the code by other, junior level, agents like claude code, google gemini, and opencode agent. explains how to review the junior agent code, what to evaluate, and what response to provide.
---

## context

some of the easier code fixes, long but straight-forward fixes, one off ui changes, or chores are performed by other agents. However, the user can't trust the outputs of those models like they can trust codex models. so they will ask a codex model to review the code written by other models.

## input

- the user will provide extact promopts they gave to the other agent. if they haven't done that, ask them for it.
- if you are not clear about what the user expected to happen from the prompt, ask the user for clarity by first restating what you understood.

## how to review

- look at the prompt that the user provided
- look at all the diffs
- hypothesize what you would have done in this scenario.
- see whether the agent wrote the code that was expected.
- look for common mistakes that other agents make like:
  - eager programming: agent fixes/creates additional items to what were expected.
  - regressions: agent broke somthing, or introduced a bug, in somthing that was already working.
  - incomplete programming: agent did not complete the task.
  - excessive commenting: agent added comments that don't add value to the user.

## output

- for human: an ordered list of issues with the junior agent code, tagged by
  - description
  - severity
  - proposed fixes
- for junior-agent: details of the issues and how to fix them along with what you want them to come back with.
