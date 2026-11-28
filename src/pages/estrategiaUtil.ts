import type { StrategyStatus } from '../data/types'

export const STRATEGY_STATUS: Record<StrategyStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: '#8e6bd8' },
  ativo: { label: 'Ativa', color: '#2e9e6a' },
  arquivado: { label: 'Arquivada', color: '#55555f' },
}
