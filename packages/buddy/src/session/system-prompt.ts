import LEARNING_COMPANION from './prompts/learning-companion.txt'
import MAX_STEPS from './prompts/max-steps.txt'

export async function loadLearningPrompt() {
  return LEARNING_COMPANION
}

export async function loadMaxStepsPrompt() {
  return MAX_STEPS
}
