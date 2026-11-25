// Financeiro → aba "Contas a pagar": despesas da agência com vencimento,
// situação, categoria editável e criação em série (mensal ou parcelada).
import { useState } from 'react'
import { db } from '../data/db'
import { useOptions, useRun, useTable } from '../data/hooks'
import type { Bill, BillMethod, BillStatus } from '../data/types'
import { useAuth } from '../lib/auth'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { Empty, Field, fd, fdFull, Kpi, Loading, maskMoney, money, nn, parseMoney, Seg, Select, Tag, today } from '../ui/kit'

const BILL_STATUS: Record<string, { label: string; color: string }> = {
  aberto: { label: 'A pagar', color: '#2f80ed' }, atrasado: { label: 'Atrasada', color: '#c0392b' },
  pago: { label: 'Paga', color: '#2e9e6a' }, cancelado: { label: 'Cancelada', color: '#55555f' },
}
const BILL_METHOD: Record<BillMethod, string> = {
  pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão de crédito', transferencia: 'Transferência', debito: 'Débito automático', dinheiro: 'Dinheiro',
}

/** "Atrasada" não é gravada: é uma conta em aberto com vencimento passado. */
const billState = (b: Bill) => (b.status === 'aberto' && b.due_date < today() ? 'atrasado' : b.status)

const monthOf = (d: string) => d.slice(0, 7)
/** Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 mês = 28 ou 29/02). */
function addMonthsClamped(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(y, m - 1 + n, 1)
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export function ContasPagar({ ym, recebidoMes, editing, setEditing }: {
  ym: string
  /** Recebimentos pagos no mês (aba Mês a mês), para o saldo. */
  recebidoMes: number
  editing: Bill | 'new' | null
  setEditing: (b: Bill | 'new' | null) => void
}) {
  const { can } = useAuth()
  const run = useRun()
  const bills = useTable('bills', { order: { column: 'due_date' } })
  const cats = useOptions('bill_category', true)
  const [state, setState] = useState<'todas' | 'abertas' | 'pagas'>('todas')
  const [cat, setCat] = useState('')

  const B = bills.data ?? []
  const inMonth = B.filter((b) => monthOf(b.due_date) === ym && b.status !== 'cancelado')
  const aPagar = inMonth.filter((b) => b.status === 'aberto').reduce((a, b) => a + b.amount, 0)
  const pagoMes = B.filter((b) => b.status === 'pago' && b.paid_at && monthOf(b.paid_at) === ym).reduce((a, b) => a + b.amount, 0)
  const late = B.filter((b) => billState(b) === 'atrasado')
  const lateSum = late.reduce((a, b) => a + b.amount, 0)
  const saldo = recebidoMes - pagoMes

  const L = B.filter((b) => monthOf(b.due_date) === ym)
    .filter((b) => state === 'todas' ? true : state === 'abertas' ? b.status === 'aberto' : b.status === 'pago')
    .filter((b) => !cat || b.category_id === cat)
  const total = L.filter((b) => b.status !== 'cancelado').reduce((a, b) => a + b.amount, 0)
  const lateOther = late.filter((b) => monthOf(b.due_date) !== ym)
  const monthName = new Date(ym + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  async function markPaid(b: Bill) {
    await run(() => db.update('bills', { id: b.id }, { status: 'pago', paid_at: today() }), 'Conta marcada como paga')
  }

  const catTag = (id: string | null) => {
    const c = cats.byId(id)
    return c ? <Tag color={c.color} solid={false}>{c.label}</Tag> : <span className="mu">—</span>
  }

  return (
    <>
      <div className="kpis">
        <Kpi value={money(aPagar)} label="a pagar no mês" hint="Contas em aberto com vencimento neste mês" />
        <Kpi value={money(pagoMes)} label="pago no mês" hint="Contas marcadas como pagas neste mês" />
        <Kpi value={money(lateSum)} label={`em atraso (${late.length})`} hint="Contas em aberto com vencimento passado, de qualquer mês" />
        <Kpi value={money(saldo)} label="saldo do mês" hint="Recebido no mês (aba Mês a mês) menos o pago no mês" />
      </div>
      <p className="money-note">O saldo considera só o que já entrou e saiu de fato neste mês</p>

      <div className="toolbar">
        <Seg value={state} onChange={setState} items={[['todas', 'Todas'], ['abertas', 'A pagar'], ['pagas', 'Pagas']]} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Todas as categorias" aria-label="Categoria"
          options={cats.list.map((c) => ({ value: c.id, label: c.label }))} />
      </div>

      <h2>Contas de {monthName}</h2>
      {bills.isLoading ? <Loading /> : !L.length ? (
        <Empty action={can('financeiro', 'write') && !B.some((b) => monthOf(b.due_date) === ym) &&
          <button className="btn" onClick={() => setEditing('new')}>Cadastrar conta</button>}>
          {B.some((b) => monthOf(b.due_date) === ym) ? 'Nenhuma conta com esses filtros.' : 'Nenhuma conta a pagar neste mês.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th className="num">Valor</th><th>Situação</th><th>Pago em</th><th /></tr></thead>
            <tbody>
              {L.map((b) => {
                const s = BILL_STATUS[billState(b)]
                return (
                  <tr key={b.id} className="click" onClick={() => setEditing(b)}>
                    <td>{fd(b.due_date)}</td>
                    <td>
                      {b.description}
                      {b.installments && b.installments > 1 && <span className="mu"> · {b.installment}/{b.installments}</span>}
                      {b.supplier && <><br /><small className="mu">{b.supplier}</small></>}
                    </td>
                    <td>{catTag(b.category_id)}</td>
                    <td className="num">{money(b.amount)}</td>
                    <td><Tag color={s.color}>{s.label}</Tag></td>
                    <td>{b.paid_at ? fd(b.paid_at) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {can('financeiro', 'write') && b.status === 'aberto' && <button className="btn sm" onClick={() => markPaid(b)}>Marcar paga</button>}
                    </td>
                  </tr>
                )
              })}
              <tr className="total-row">
                <td colSpan={3}><b>Total ({L.filter((b) => b.status !== 'cancelado').length})</b></td>
                <td className="num"><b>{money(total)}</b></td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {lateOther.length > 0 && (
        <>
          <h2>Atrasadas de outros meses</h2>
          {lateOther.map((b) => (
            <button key={b.id} type="button" className="row" onClick={() => setEditing(b)} style={{ borderLeft: '5px solid var(--er)' }}>
              <div><b>{b.description}</b><br /><small>{b.supplier ? `${b.supplier} · ` : ''}venceu {fdFull(b.due_date)}</small></div>
              <span className="tag late">{money(b.amount)}</span>
            </button>
          ))}
        </>
      )}

      {editing && <BillForm bill={editing === 'new' ? null : editing} defaultMonth={ym} all={B} onClose={() => setEditing(null)} />}
    </>
  )
}

type Repeat = 'unica' | 'mensal' | 'parcelada'

function BillForm({ bill, defaultMonth, all, onClose }: { bill: Bill | null; defaultMonth: string; all: Bill[]; onClose: () => void }) {
  const { can } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const cats = useOptions('bill_category')
  const canEdit = can('financeiro', 'write')
  const thisMonth = today().slice(0, 7) === defaultMonth
  const [f, setF] = useState({
    description: bill?.description ?? '', supplier: bill?.supplier ?? '', category_id: bill?.category_id ?? '',
    amount: bill?.amount != null ? maskMoney(bill.amount) : '', due_date: bill?.due_date ?? (thisMonth ? today() : `${defaultMonth}-10`),
    status: (bill?.status ?? 'aberto') as BillStatus, paid_at: bill?.paid_at ?? '', method: bill?.method ?? '', notes: bill?.notes ?? '',
  })
  const [repeat, setRepeat] = useState<Repeat>('unica')
  const [times, setTimes] = useState('12')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const amount = parseMoney(f.amount)
  const n = Math.min(60, Math.max(2, Number(times) || 0))
  const valid = f.description.trim() && f.due_date && amount != null && amount >= 0 && (repeat === 'unica' || Number(times) >= 2)
  // contas futuras da mesma série que ainda estão em aberto (para "excluir esta e as próximas")
  const nextInSeries = bill?.series_id ? all.filter((b) => b.series_id === bill.series_id && b.due_date >= bill.due_date && b.status === 'aberto') : []

  async function save() {
    if (!valid || amount == null) return
    const base = {
      description: f.description.trim(), supplier: nn(f.supplier), category_id: f.category_id || null,
      status: f.status, paid_at: f.status === 'pago' ? (f.paid_at || today()) : null,
      method: (f.method || null) as BillMethod | null, notes: nn(f.notes),
    }
    const ok = await run(async () => {
      if (bill) return db.update('bills', { id: bill.id }, { ...base, amount, due_date: f.due_date })
      if (repeat === 'unica') return db.insert('bills', { ...base, amount, due_date: f.due_date })
      // série: mesma data a cada mês; na parcelada o total é dividido e a diferença de centavos vai na última
      const series_id = crypto.randomUUID()
      const cents = Math.round(amount * 100)
      const part = repeat === 'parcelada' ? Math.floor(cents / n) : cents
      const rows: Partial<Bill>[] = Array.from({ length: n }, (_, i) => ({
        ...base,
        // só a primeira pode nascer paga; as seguintes começam em aberto
        status: i === 0 ? base.status : 'aberto', paid_at: i === 0 ? base.paid_at : null,
        amount: (repeat === 'parcelada' && i === n - 1 ? cents - part * (n - 1) : part) / 100,
        due_date: addMonthsClamped(f.due_date, i), series_id, installment: i + 1, installments: n,
      }))
      return db.insertMany('bills', rows)
    }, bill ? 'Conta salva' : repeat === 'unica' ? 'Conta cadastrada' : `${n} contas cadastradas`)
    if (ok) onClose()
  }

  async function remove(scope: 'uma' | 'proximas') {
    if (!bill) return
    const msg = scope === 'uma' ? 'Excluir esta conta?' : `Excluir esta e as próximas ${nextInSeries.length - 1} conta(s) em aberto da série?`
    if (!(await confirm(msg, { danger: true, confirmLabel: 'Excluir' }))) return
    const ok = await run(async () => {
      if (scope === 'uma') return db.remove('bills', { id: bill.id })
      for (const b of nextInSeries) await db.remove('bills', { id: b.id })
    }, scope === 'uma' ? 'Conta excluída' : 'Contas excluídas')
    if (ok) onClose()
  }

  const preview = amount != null && repeat !== 'unica' && Number(times) >= 2
    ? repeat === 'mensal' ? `${n} contas de ${money(amount)}, uma por mês` : `${n} parcelas de ${money(Math.floor(Math.round(amount * 100) / n) / 100)} (total ${money(amount)})`
    : null

  return (
    <Modal open onClose={onClose} title={bill ? 'Conta a pagar' : 'Nova conta a pagar'}
      footer={<>
        {canEdit && <button className="btn primary" onClick={save} disabled={!valid}>Salvar</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        {bill && can('financeiro', 'delete') && <>
          <button className="btn danger push" onClick={() => remove('uma')}>Excluir</button>
          {nextInSeries.length > 1 && <button className="btn danger" onClick={() => remove('proximas')}>Excluir esta e as próximas</button>}
        </>}
      </>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Descrição *" full><input value={f.description} onChange={set('description')} maxLength={200} autoFocus placeholder="Ex.: Aluguel do escritório" /></Field>
          <Field label="Fornecedor / favorecido"><input value={f.supplier} onChange={set('supplier')} maxLength={200} placeholder="Ex.: Imobiliária" /></Field>
          <Field label="Categoria"><Select value={f.category_id} onChange={set('category_id')} placeholder="Sem categoria" options={cats.list.map((c) => ({ value: c.id, label: c.label }))} /></Field>
          <Field label={repeat === 'parcelada' ? 'Valor total (R$) *' : 'Valor (R$) *'}><input type="text" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: maskMoney(e.target.value) })} placeholder="0,00" /></Field>
          <Field label={repeat === 'unica' ? 'Vencimento *' : '1º vencimento *'}><input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
          <Field label="Situação"><Select value={f.status} onChange={set('status')} options={(['aberto', 'pago', 'cancelado'] as const).map((s) => ({ value: s, label: BILL_STATUS[s].label }))} /></Field>
          {f.status === 'pago' && <Field label="Pago em"><input type="date" value={f.paid_at || today()} onChange={set('paid_at')} /></Field>}
          <Field label="Forma de pagamento"><Select value={f.method} onChange={set('method')} placeholder="A definir" options={Object.entries(BILL_METHOD).map(([v, l]) => ({ value: v, label: l }))} /></Field>
          <Field label="Observações" full><input value={f.notes} onChange={set('notes')} maxLength={2000} placeholder="Ex.: código de barras, nota fiscal, centro de custo" /></Field>
          {!bill && (
            <Field label="Repetição" full hint={preview ?? 'Para contas fixas (aluguel, assinaturas) ou compras parceladas'}>
              <div className="toolbar" style={{ margin: 0 }}>
                <Seg value={repeat} onChange={setRepeat} items={[['unica', 'Única'], ['mensal', 'Todo mês'], ['parcelada', 'Parcelada']]} />
                {repeat !== 'unica' && (
                  <label className="mu" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {repeat === 'mensal' ? 'por' : 'em'}
                    <input type="number" min={2} max={60} value={times} onChange={(e) => setTimes(e.target.value)} style={{ width: 72 }} aria-label="Quantidade" />
                    {repeat === 'mensal' ? 'meses' : 'vezes'}
                  </label>
                )}
              </div>
            </Field>
          )}
          {bill?.series_id && bill.installments && (
            <p className="money-note" style={{ gridColumn: '1 / -1', margin: 0 }}>
              Conta {bill.installment} de {bill.installments} de uma série. As alterações valem só para esta conta.
            </p>
          )}
        </div>
      </fieldset>
    </Modal>
  )
}
