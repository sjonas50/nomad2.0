/**
 * Curated model catalog — popular models grouped by category with size/RAM info.
 * Shared between ServicesController and AdminController.
 */
export const MODEL_CATALOG = [
  // Chat / General
  { name: 'qwen2.5:1.5b', category: 'Chat', description: 'Fast, lightweight chat model', sizeGb: 1.0, minRamGb: 8 },
  { name: 'qwen2.5:7b', category: 'Chat', description: 'Balanced performance and quality', sizeGb: 4.4, minRamGb: 16 },
  { name: 'qwen2.5:14b', category: 'Chat', description: 'High quality reasoning', sizeGb: 9.0, minRamGb: 24 },
  { name: 'qwen2.5:32b', category: 'Chat', description: 'Near-frontier quality', sizeGb: 20.0, minRamGb: 48 },
  { name: 'llama3.2:3b', category: 'Chat', description: 'Meta Llama 3.2 — fast and capable', sizeGb: 2.0, minRamGb: 8 },
  { name: 'llama3.1:8b', category: 'Chat', description: 'Meta Llama 3.1 — strong all-rounder', sizeGb: 4.7, minRamGb: 16 },
  { name: 'llama3.3:70b', category: 'Chat', description: 'Meta Llama 3.3 — top tier', sizeGb: 43.0, minRamGb: 64 },
  { name: 'gemma3:4b', category: 'Chat', description: 'Google Gemma 3 — efficient', sizeGb: 3.0, minRamGb: 8 },
  { name: 'gemma3:12b', category: 'Chat', description: 'Google Gemma 3 — balanced', sizeGb: 8.0, minRamGb: 16 },
  { name: 'gemma3:27b', category: 'Chat', description: 'Google Gemma 3 — high quality', sizeGb: 17.0, minRamGb: 32 },
  { name: 'mistral:7b', category: 'Chat', description: 'Mistral 7B — fast European model', sizeGb: 4.1, minRamGb: 16 },
  { name: 'phi4:14b', category: 'Chat', description: 'Microsoft Phi-4 — strong reasoning', sizeGb: 9.1, minRamGb: 24 },
  { name: 'deepseek-r1:8b', category: 'Reasoning', description: 'DeepSeek R1 — chain-of-thought reasoning', sizeGb: 4.9, minRamGb: 16 },
  { name: 'deepseek-r1:32b', category: 'Reasoning', description: 'DeepSeek R1 — advanced reasoning', sizeGb: 20.0, minRamGb: 48 },
  // Embedding
  { name: 'nomic-embed-text', category: 'Embedding', description: 'Required for RAG — 768-dim vectors', sizeGb: 0.3, minRamGb: 8 },
  // Code
  { name: 'qwen2.5-coder:7b', category: 'Code', description: 'Code generation and analysis', sizeGb: 4.4, minRamGb: 16 },
  { name: 'codellama:7b', category: 'Code', description: 'Meta Code Llama', sizeGb: 3.8, minRamGb: 16 },
] as const

export type CatalogModel = (typeof MODEL_CATALOG)[number]
