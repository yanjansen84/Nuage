import type { Contract, ContractItem, ContractStatus, Payment } from '../data/types'
import { addMonths, today } from '../ui/kit'

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
