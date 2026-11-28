import type { Contract, ContractItem, ContractStatus, ContractTemplateKey, Payment } from '../data/types'
import { addMonths, today } from '../ui/kit'

export const CONTRACT_TEMPLATES: { key: ContractTemplateKey; label: string; hint: string }[] = [
  { key: 'agencia', label: 'Agência Nuage', hint: 'Comunicação completa e gestão de tráfego pago' },
  { key: 'social_media', label: 'Social Media', hint: 'Gestão de redes sociais e criação de conteúdo' },
  { key: 'studio', label: 'Studio Nuage', hint: 'Produção audiovisual com pacotes de vídeos' },
]

/** Sugere automaticamente os modelos de contrato a partir dos nomes dos serviços escolhidos. */
export function inferTemplatesFromServices(services: { name?: string | null }[]): ContractTemplateKey[] {
  const out = new Set<ContractTemplateKey>()
  for (const s of services) {
    const n = (s.name ?? '').toLowerCase()
    if (n.includes('agênc') || n.includes('agenc')) out.add('agencia')
    else if (n.includes('social') || n.includes('rede')) out.add('social_media')
    else if (n.includes('studio') || n.includes('áudio') || n.includes('audio') || n.includes('vídeo') || n.includes('video')) out.add('studio')
  }
  return out.size ? [...out] : ['agencia']
}

export const CONTRACT_STATUS: Record<ContractStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: '#8e6bd8' },
  ativo: { label: 'Ativo', color: '#2e9e6a' },
  encerrado: { label: 'Encerrado', color: '#55555f' },
  cancelado: { label: 'Cancelado', color: '#c0392b' },
}
export const PAY_METHOD: Record<string, string> = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão de crédito' }

/** Valor mensal recorrente de um contrato. */
type Priced = Pick<ContractItem, 'billing_type' | 'negotiated_price' | 'quantity'>
export const contractMonthly = (items: Priced[]) =>
  items.filter((i) => i.billing_type === 'recorrente').reduce((a, i) => a + i.negotiated_price * i.quantity, 0)
/** Valores únicos (pacotes e avulsos). */
export const contractOneTime = (items: Priced[]) =>
  items.filter((i) => i.billing_type !== 'recorrente').reduce((a, i) => a + i.negotiated_price * i.quantity, 0)

/** Fim do prazo mínimo (início + meses mínimos). */
export const minEnd = (k: Contract) => (k.start_date && k.min_months ? addMonths(k.start_date, k.min_months) : null)

/** Situação exibida: "previsto" vencido vira "atrasado". */
export const payState = (p: Payment) => (p.status === 'previsto' && p.due_date < today() ? 'atrasado' : p.status)
