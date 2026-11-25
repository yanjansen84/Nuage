import { ChevronLeft, ChevronRight, FileDown } from 'lucide-react'
import { statementPdf } from '../lib/pdf'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../data/db'
import { useRun, useTable } from '../data/hooks'
import type { Bill, Payment } from '../data/types'
import { useAuth } from '../lib/auth'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { addDays, addMonths, Empty, Field, fd, fdFull, Kpi, Loading, maskMoney, money, nn, parseMoney, PageHead, Seg, Select, Tabs, Tag, today } from '../ui/kit'
import { Pagination } from '../ui/Pagination'
import { ContasPagar } from './ContasPagar'
import { contractMonthly, contractOneTime, minEnd, PAY_METHOD, payState } from './contratosUtil'

const PAY_STATUS: Record<string, { label: string; color: string }> = {
  previsto: { label: 'Previsto', color: '#2f80ed' }, pago: { label: 'Pago', color: '#2e9e6a' },
  atrasado: { label: 'Atrasado', color: '#c0392b' }, cancelado: { label: 'Cancelado', color: '#55555f' },
}

const monthOf = (d: string) => d.slice(0, 7)
const lastDay = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()

export default function Financeiro() {
  const { can } = useAuth()
  const run = useRun()
  const { confirm, toast } = useFeedback()
  const payments = useTable('payments', { order: { column: 'due_date' } })
  const contracts = useTable('contracts')
  const items = useTable('contract_items')
  const clients = useTable('clients')
  const [ym, setYm] = useState(today().slice(0, 7))
  const [editing, setEditing] = useState<Payment | 'new' | null>(null)
  // a aba pode vir pelo link (ex.: notificação de contas → /financeiro?aba=pagar)
  const [sp] = useSearchParams()
  const [tab, setTab] = useState<'mes' | 'historico' | 'pagar'>(() => (sp.get('aba') === 'pagar' ? 'pagar' : sp.get('aba') === 'historico' ? 'historico' : 'mes'))
  const [billEditing, setBillEditing] = useState<Bill | 'new' | null>(null)

  const P = payments.data ?? []
  const K = contracts.data ?? []
  const its = (id: string) => (items.data ?? []).filter((i) => i.contract_id === id)
  const clientOf = (contractId: string) => {
    const k = K.find((x) => x.id === contractId)
    return clients.data?.find((c) => c.id === k?.client_id)
  }
  const active = K.filter((k) => k.status === 'ativo')
  const contratado = active.reduce((a, k) => a + contractMonthly(its(k.id)), 0)
  const inMonth = P.filter((p) => monthOf(p.due_date) === ym && p.status !== 'cancelado')
  const recebido = P.filter((p) => p.status === 'pago' && p.paid_at && monthOf(p.paid_at) === ym).reduce((a, p) => a + p.amount, 0)
  const previsto = inMonth.reduce((a, p) => a + p.amount, 0)
  const late = P.filter((p) => payState(p) === 'atrasado')
  const lateSum = late.reduce((a, p) => a + p.amount, 0)
  const soon = addDays(today(), 45)
  const ending = active.filter((k) => { const e = minEnd(k); return e && e <= soon })

  async function generate() {
    const toCreate: Partial<Payment>[] = []
    for (const k of active) {
      if (k.start_date && monthOf(k.start_date) > ym) continue
      const mine = P.filter((p) => p.contract_id === k.id)
      const monthly = contractMonthly(its(k.id))
      const day = String(Math.min(k.due_day ?? 10, lastDay(ym))).padStart(2, '0')
      // a primeira cobrança nunca vence antes do início do contrato
      const first = k.start_date && `${ym}-${day}` < k.start_date ? k.start_date : `${ym}-${day}`
      // já existe lançamento do contrato neste mês (que não seja parcela de pacote)? não duplica
      const hasMonthly = mine.some((p) => monthOf(p.due_date) === ym && p.status !== 'cancelado' && !p.notes?.startsWith('Pacote'))
      if (monthly > 0 && !hasMonthly)
        toCreate.push({ contract_id: k.id, due_date: first, amount: monthly, status: 'previsto', method: k.payment_method, notes: `Mensalidade ${ym.slice(5)}/${ym.slice(0, 4)}` })
      const once = contractOneTime(its(k.id))
      if (once > 0 && k.start_date && monthOf(k.start_date) === ym && !mine.some((p) => p.notes?.startsWith('Pacote'))) {
        const n = Math.max(1, k.installments ?? 1)
        for (let i = 0; i < n; i++)
          toCreate.push({ contract_id: k.id, due_date: addMonths(first, i), amount: Math.round((once / n) * 100) / 100, status: 'previsto', method: k.payment_method, notes: `Pacote/avulso · parcela ${i + 1}/${n}` })
      }
    }
    if (!toCreate.length) return toast('Nada a gerar: os vencimentos deste mês já existem.')
    if (!(await confirm(`Gerar ${toCreate.length} vencimento(s) a partir dos contratos ativos?`, { confirmLabel: 'Gerar' }))) return
    await run(() => db.insertMany('payments', toCreate), `${toCreate.length} vencimento(s) gerado(s)`)
  }

  async function markPaid(p: Payment) {
    await run(() => db.update('payments', { id: p.id }, { status: 'pago', paid_at: today() }), 'Pagamento registrado')
  }

  const monthName = new Date(ym + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const label = monthName.charAt(0).toUpperCase() + monthName.slice(1)

  return (
    <>
      <PageHead title="Financeiro" sub="Recebimentos dos contratos e contas a pagar da agência"
        actions={can('financeiro', 'write') && (tab === 'pagar'
          ? <button className="btn primary" onClick={() => setBillEditing('new')}>Nova conta a pagar</button>
          : <>
            <button className="btn" onClick={generate}>Gerar vencimentos do mês</button>
            <button className="btn primary" onClick={() => setEditing('new')}>Novo lançamento</button>
          </>)} />

      <Tabs value={tab} onChange={setTab} items={[
        { key: 'mes', label: 'Mês a mês' }, { key: 'pagar', label: 'Contas a pagar' }, { key: 'historico', label: 'Histórico' },
      ]} />

      {tab === 'historico' ? (
        <Historico payments={P} clientName={(id) => clientOf(id)?.name ?? '—'} clientIdOf={(id) => clientOf(id)?.id}
          onOpen={setEditing} onGoMonth={(m) => { setYm(m); setTab('mes') }} />
      ) : (<>

      <div className="toolbar">
        <button className="btn icon" aria-label="Mês anterior" onClick={() => setYm(addMonths(ym + '-15', -1).slice(0, 7))}><ChevronLeft aria-hidden /></button>
        <input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} aria-label="Mês" />
        <button className="btn icon" aria-label="Próximo mês" onClick={() => setYm(addMonths(ym + '-15', 1).slice(0, 7))}><ChevronRight aria-hidden /></button>
        <span className="mu">{label}</span>
      </div>

      {tab === 'pagar' ? (
        <ContasPagar ym={ym} recebidoMes={recebido} editing={billEditing} setEditing={setBillEditing} />
      ) : (<>

      <div className="kpis">
        <Kpi value={money(contratado)} label="faturamento contratado" hint="Soma mensal dos contratos vigentes (recorrentes)" />
        <Kpi value={money(recebido)} label="recebido no mês" hint="Pagamentos marcados como pagos neste mês" />
        <Kpi value={money(previsto)} label="previsto no mês" hint="Vencimentos cadastrados para este mês" />
        <Kpi value={money(lateSum)} label={`em atraso (${late.length})`} hint="Vencimentos passados sem pagamento" />
      </div>
      <p className="money-note">Os três indicadores medem coisas diferentes e não devem ser somados</p>

      <h2>Vencimentos de {monthName}</h2>
      {payments.isLoading ? <Loading /> : !inMonth.length ? (
        <Empty action={can('financeiro', 'write') && active.length > 0 && <button className="btn" onClick={generate}>Gerar a partir dos contratos</button>}>
          Nenhum vencimento neste mês.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Vencimento</th><th>Cliente</th><th>Descrição</th><th className="num">Valor</th><th>Situação</th><th>Pago em</th><th /></tr></thead>
            <tbody>
              {inMonth.map((p) => {
                const s = PAY_STATUS[payState(p)]
                return (
                  <tr key={p.id} className="click" onClick={() => setEditing(p)}>
                    <td>{fd(p.due_date)}</td>
                    <td>{clientOf(p.contract_id)?.name ?? '—'}</td>
                    <td>{p.notes ?? '—'}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td><Tag color={s.color}>{s.label}</Tag></td>
                    <td>{p.paid_at ? fd(p.paid_at) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {can('financeiro', 'write') && p.status !== 'pago' && p.status !== 'cancelado' &&
                        <button className="btn sm" onClick={() => markPaid(p)}>Marcar pago</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {late.filter((p) => monthOf(p.due_date) !== ym).length > 0 && (
        <>
          <h2>Atrasados de outros meses</h2>
          {late.filter((p) => monthOf(p.due_date) !== ym).map((p) => (
            <button key={p.id} type="button" className="row" onClick={() => setEditing(p)} style={{ borderLeft: '5px solid var(--er)' }}>
              <div><b>{clientOf(p.contract_id)?.name ?? '—'}</b><br /><small>{p.notes ?? ''} · venceu {fdFull(p.due_date)}</small></div>
              <span className="tag late">{money(p.amount)}</span>
            </button>
          ))}
        </>
      )}

      <h2>Contratos perto do fim do prazo mínimo</h2>
      {ending.length ? ending.map((k) => (
        <Link key={k.id} to={`/contratos/${k.id}`} className="row">
          <div><b>{clients.data?.find((c) => c.id === k.client_id)?.name}</b><br />
            <small>prazo mínimo até {fdFull(minEnd(k))} · {k.renewal === 'automatica' ? 'renovação automática' : 'renovação manual'}{k.notice_days ? ` · aviso prévio de ${k.notice_days} dias` : ''}</small></div>
          <span className="tag">{money(contractMonthly(its(k.id)))}/mês</span>
        </Link>
      )) : <p className="mu">Nenhum contrato vence nos próximos 45 dias</p>}

      </>)}
      </>)}

      {editing && <PaymentForm payment={editing === 'new' ? null : editing} defaultMonth={ym} onClose={() => setEditing(null)} />}
    </>
  )
}

function PaymentForm({ payment, defaultMonth, onClose }: { payment: Payment | null; defaultMonth: string; onClose: () => void }) {
  const { can } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const contracts = useTable('contracts')
  const clients = useTable('clients')
  const canEdit = can('financeiro', 'write')
  const [f, setF] = useState({
    contract_id: payment?.contract_id ?? '', due_date: payment?.due_date ?? `${defaultMonth}-10`, amount: payment?.amount != null ? maskMoney(payment.amount) : '',
    status: payment?.status ?? 'previsto', paid_at: payment?.paid_at ?? '', method: payment?.method ?? '', notes: payment?.notes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const valid = f.contract_id && f.due_date && parseMoney(f.amount) != null && (parseMoney(f.amount) ?? 0) >= 0

  async function save() {
    if (!valid) return
    const p = {
      contract_id: f.contract_id, due_date: f.due_date, amount: parseMoney(f.amount) ?? 0, status: f.status as Payment['status'],
      paid_at: f.status === 'pago' ? (f.paid_at || today()) : null, method: (f.method || null) as Payment['method'], notes: nn(f.notes),
    }
    const ok = await run(async () => { if (payment) await db.update('payments', { id: payment.id }, p); else await db.insert('payments', p) }, 'Lançamento salvo')
    if (ok) onClose()
  }
  async function remove() {
    if (!payment || !(await confirm('Excluir este lançamento?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('payments', { id: payment.id }), 'Lançamento excluído')) onClose()
  }
  const options = (contracts.data ?? []).filter((k) => k.status !== 'rascunho' || k.id === f.contract_id).map((k) => ({
    value: k.id, label: `${clients.data?.find((c) => c.id === k.client_id)?.name ?? '—'} · desde ${fdFull(k.start_date)}`,
  }))

  return (
    <Modal open onClose={onClose} title={payment ? 'Lançamento' : 'Novo lançamento'}
      footer={<>
        {canEdit && <button className="btn primary" onClick={save} disabled={!valid}>Salvar</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        {payment && can('financeiro', 'delete') && <button className="btn danger push" onClick={remove}>Excluir</button>}
      </>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Contrato *" full><Select value={f.contract_id} onChange={set('contract_id')} placeholder="Selecione" options={options} /></Field>
          <Field label="Vencimento *"><input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
          <Field label="Valor (R$) *"><input type="text" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: maskMoney(e.target.value) })} placeholder="0,00" /></Field>
          <Field label="Situação"><Select value={f.status} onChange={set('status')} options={['previsto', 'pago', 'cancelado'].map((s) => ({ value: s, label: PAY_STATUS[s].label }))} /></Field>
          {f.status === 'pago' && <Field label="Pago em"><input type="date" value={f.paid_at || today()} onChange={set('paid_at')} /></Field>}
          <Field label="Método"><Select value={f.method} onChange={set('method')} placeholder="A definir" options={Object.entries(PAY_METHOD).map(([v, l]) => ({ value: v, label: l }))} /></Field>
          <Field label="Descrição / observações" full><input value={f.notes} onChange={set('notes')} placeholder="Ex.: Mensalidade 11/2026" /></Field>
        </div>
      </fieldset>
    </Modal>
  )
}

// ======================================================================
// Histórico: resumo mês a mês + todos os lançamentos com filtros
// ======================================================================
function Historico({ payments, clientName, clientIdOf, onOpen, onGoMonth }: {
  payments: Payment[]
  clientName: (contractId: string) => string
  clientIdOf: (contractId: string) => string | undefined
  onOpen: (p: Payment) => void
  onGoMonth: (ym: string) => void
}) {
  const clients = useTable('clients', { order: { column: 'name' } })
  const [period, setPeriod] = useState<'6' | '12' | 'all'>('12')
  const [client, setClient] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)

  const cur = today().slice(0, 7)
  const startYm = period === 'all' ? '0000-00' : addMonths(cur + '-15', -(Number(period) - 1)).slice(0, 7)
  const L = payments
    .filter((p) => monthOf(p.due_date) >= startYm && (!client || clientIdOf(p.contract_id) === client) && (!state || payState(p) === state))
    .sort((a, b) => b.due_date.localeCompare(a.due_date))

  // resumo por mês de vencimento (recebido pelo mês do pagamento)
  const months = Array.from(new Set([
    ...L.map((p) => monthOf(p.due_date)),
    ...L.filter((p) => p.paid_at).map((p) => monthOf(p.paid_at!)),
  ])).filter((m) => m >= startYm).sort().reverse()
  const sum = (list: Payment[]) => list.reduce((a, p) => a + p.amount, 0)
  const summary = months.map((m) => {
    const due = L.filter((p) => monthOf(p.due_date) === m && p.status !== 'cancelado')
    const previsto = sum(due)
    const recebido = sum(L.filter((p) => p.status === 'pago' && p.paid_at && monthOf(p.paid_at) === m))
    const atraso = sum(due.filter((p) => payState(p) === 'atrasado'))
    const pct = previsto ? Math.min(100, Math.round((recebido / previsto) * 100)) : 0
    return { m, previsto, recebido, atraso, pct }
  })
  const totals = summary.reduce((a, s) => ({ previsto: a.previsto + s.previsto, recebido: a.recebido + s.recebido, atraso: a.atraso + s.atraso }), { previsto: 0, recebido: 0, atraso: 0 })
  const mLabel = (m: string) => { const x = new Date(m + '-15').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', ''); return x.charAt(0).toUpperCase() + x.slice(1) }
  const pageRows = L.slice((page - 1) * size, page * size)
  const reset = () => setPage(1)
  const { toast } = useFeedback()
  const [pdfBusy, setPdfBusy] = useState(false)

  async function exportPdf() {
    const c = clients.data?.find((x) => x.id === client)
    if (!c) return
    setPdfBusy(true)
    try {
      const periodLabel = period === 'all' ? 'Todo o período' : `Últimos ${period} meses`
      await statementPdf({
        client: c,
        period: state ? `${periodLabel} · ${PAY_STATUS[state].label.toLowerCase()}` : periodLabel,
        rows: [...L].reverse().map((p) => ({
          due: p.due_date, description: p.notes ?? '—', amount: p.amount, status: PAY_STATUS[payState(p)].label,
          paidAt: p.paid_at, method: p.method ? PAY_METHOD[p.method] : null,
        })),
        totals,
      })
    } catch {
      toast('Não foi possível gerar o PDF. Tente de novo', true)
    } finally { setPdfBusy(false) }
  }

  return (
    <>
      <div className="toolbar">
        <Seg value={period} onChange={(v) => { setPeriod(v); reset() }} items={[['6', '6 meses'], ['12', '12 meses'], ['all', 'Tudo']]} />
        <Select value={client} onChange={(e) => { setClient(e.target.value); reset() }} placeholder="Todos os clientes" aria-label="Cliente"
          options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <Select value={state} onChange={(e) => { setState(e.target.value); reset() }} placeholder="Todas as situações" aria-label="Situação"
          options={Object.entries(PAY_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />
        <span className="spacer" />
        <button className="btn" onClick={exportPdf} disabled={!client || !L.length || pdfBusy}
          title={!client ? 'Escolha um cliente para gerar o extrato' : 'Baixar o extrato deste cliente em PDF'}>
          <FileDown aria-hidden />{pdfBusy ? 'Gerando…' : 'PDF do cliente'}
        </button>
      </div>
      {!client && <p className="money-note" style={{ marginTop: -8 }}>Escolha um cliente para gerar o extrato em PDF</p>}

      <h2>Resumo por mês</h2>
      {!summary.length ? <Empty>Nenhum lançamento no período</Empty> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Mês</th><th className="num">Previsto</th><th className="num">Recebido</th><th className="num">Em atraso</th><th>Recebido do previsto</th></tr></thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.m} className="click" onClick={() => onGoMonth(s.m)} title="Abrir este mês">
                  <td><b>{mLabel(s.m)}</b></td>
                  <td className="num">{money(s.previsto)}</td>
                  <td className="num">{money(s.recebido)}</td>
                  <td className="num" style={s.atraso ? { color: 'var(--er)' } : undefined}>{s.atraso ? money(s.atraso) : '—'}</td>
                  <td>
                    <div className="hist-bar"><div className="prog sm"><i style={{ width: `${s.pct}%` }} /></div><span>{s.previsto ? `${s.pct}%` : '—'}</span></div>
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td><b>Total do período</b></td>
                <td className="num"><b>{money(totals.previsto)}</b></td>
                <td className="num"><b>{money(totals.recebido)}</b></td>
                <td className="num"><b>{totals.atraso ? money(totals.atraso) : '—'}</b></td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <h2>Lançamentos</h2>
      {!L.length ? <Empty>Nenhum lançamento com esses filtros</Empty> : (
        <>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Vencimento</th><th>Cliente</th><th>Descrição</th><th className="num">Valor</th><th>Situação</th><th>Pago em</th><th>Método</th></tr></thead>
              <tbody>
                {pageRows.map((p) => {
                  const s = PAY_STATUS[payState(p)]
                  return (
                    <tr key={p.id} className="click" onClick={() => onOpen(p)}>
                      <td>{fdFull(p.due_date)}</td>
                      <td>{clientName(p.contract_id)}</td>
                      <td>{p.notes ?? '—'}</td>
                      <td className="num">{money(p.amount)}</td>
                      <td><Tag color={s.color}>{s.label}</Tag></td>
                      <td>{p.paid_at ? fdFull(p.paid_at) : '—'}</td>
                      <td>{p.method ? PAY_METHOD[p.method] : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={size} total={L.length} onPage={setPage} onPageSize={setSize} />
        </>
      )}
    </>
  )
}
