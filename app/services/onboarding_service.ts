import OllamaService from '#services/ollama_service'
import PromptTemplateService from '#services/prompt_template_service'

interface OnboardingState {
  step: 'welcome' | 'check_models' | 'recommend' | 'complete'
  modelsInstalled: string[]
  recommendations: string[]
}

export default class OnboardingService {
  private ollama: OllamaService
  private prompts: PromptTemplateService

  constructor(ollama?: OllamaService, prompts?: PromptTemplateService) {
    this.ollama = ollama ?? new OllamaService()
    this.prompts = prompts ?? new PromptTemplateService()
  }

  /**
   * Run the onboarding check and return conversational guidance.
   */
  async getOnboardingStatus(): Promise<OnboardingState> {
    const state: OnboardingState = {
      step: 'welcome',
      modelsInstalled: [],
      recommendations: [],
    }

    // Check Ollama availability
    const ollamaUp = await this.ollama.isAvailable()
    if (!ollamaUp) {
      state.recommendations.push('Ollama is not running. Start it with: ollama serve')
      return state
    }

    // Check installed models
    state.step = 'check_models'
    try {
      const models = await this.ollama.listModels()
      state.modelsInstalled = models.map((m: { name: string }) => m.name)
    } catch {
      state.modelsInstalled = []
    }

    // Recommend models
    state.step = 'recommend'
    const required = ['qwen2.5:1.5b', 'nomic-embed-text']
    for (const model of required) {
      const installed = state.modelsInstalled.some((m) => m.startsWith(model.split(':')[0]))
      if (!installed) {
        state.recommendations.push(`Pull required model: ollama pull ${model}`)
      }
    }

    if (state.recommendations.length === 0) {
      state.step = 'complete'
      state.recommendations.push('All required models are installed. You are ready to chat!')
    }

    return state
  }

  /**
   * Generate a conversational onboarding message using the LLM.
   */
  async getOnboardingMessage(): Promise<string> {
    const status = await this.getOnboardingStatus()

    if (status.step === 'complete') {
      return "Welcome to The Attic AI! Everything is set up and ready. Ask me anything — I can search your knowledge base, manage services, and help you learn."
    }

    let message = "Welcome to The Attic AI! Let me help you get set up.\n\n"
    if (status.recommendations.length > 0) {
      message += "Here's what needs attention:\n"
      for (const rec of status.recommendations) {
        message += `- ${rec}\n`
      }
    }

    return message
  }

  /**
   * Get the system prompt for onboarding conversations.
   */
  async getOnboardingPrompt(): Promise<string> {
    try {
      return await this.prompts.render('onboarding', {})
    } catch {
      return 'You are The Attic AI setup assistant. Help the user configure their offline AI system. Be friendly and guide them through model installation and service setup.'
    }
  }
}
