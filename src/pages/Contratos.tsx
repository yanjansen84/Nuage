import { ChevronLeft, FileDown, Lock, ShieldAlert, Trash2, Wrench } from 'lucide-react'
import { contractPdf } from '../lib/pdf'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db } from '../data/db'
import { usePeople, useRun, useTable } from '../data/hooks'
import type { BillingType, Contract, ContractItem, ContractTemplateKey } from '../data/types'
import { useAuth } from '../lib/auth'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { addDays, addMonths, Empty, Field, fdFull, Loading, maskDay, maskInteger, maskMoney, money, nn, num, parseMoney, PageHead, Select, Tag, today } from '../ui/kit'
import { CONTRACT_STATUS, CONTRACT_TEMPLATES, contractMonthly, contractOneTime, inferTemplatesFromServices, minEnd, PAY_METHOD } from './contratosUtil'

export default function Contratos() {
  const { can } = useAuth()
  const contracts = useTable('contracts', { order: { column: 'created_at', ascending: false } })
  const clients = useTable('clients')
  const items = useTable('contract_items', { enabled: can('financeiro') })
  const [st, setSt] = useState('')
  const navigate = useNavigate()
  const L = (contracts.data ?? []).filter((k) => !st || k.status === st)
  const cname = (id: string) => clients.data?.find((c) => c.id === id)?.name ?? '—'
  const its = (id: string) => (items.data ?? []).filter((i) => i.contract_id === id)
  const soon = addDays(today(), 30)
  const active = (contracts.data ?? []).filter((k) => k.status === 'ativo')
  const mrr = active.reduce((a, k) => a + contractMonthly(its(k.id)), 0)

  return (
    <>
      <PageHead title="Contratos"
        sub={<>{active.length} ativos{can('financeiro') && <> · {money(mrr)}/mês contratado</>}</>}
        actions={can('contratos', 'write') && <Link className="btn primary" to="/contratos/novo">Novo contrato</Link>} />
      <div className="toolbar">
        <Select value={st} onChange={(e) => setSt(e.target.value)} placeholder="Todos os status" aria-label="Filtrar status"
          options={Object.entries(CONTRACT_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />
      </div>
      {contracts.isLoading ? <Loading /> : !L.length ? (
        <Empty action={can('contratos', 'write') && <Link className="btn primary" to="/contratos/novo">Criar contrato</Link>}>Nenhum contrato{st ? ' com esse status' : ' cadastrado'}.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Cliente</th><th>Status</th><th>Início</th><th>Fim do prazo mínimo</th><th>Renovação</th>
              {can('financeiro') && <><th className="num">Mensal</th><th className="num">Pacotes/avulsos</th></>}</tr></thead>
            <tbody>
              {L.map((k) => {
                const end = minEnd(k)
                const near = k.status === 'ativo' && end && end <= soon
                return (
                  <tr key={k.id} className="click" onClick={() => navigate(`/contratos/${k.id}`)}>
                    <td><b>{cname(k.client_id)}</b></td>
                    <td><Tag color={CONTRACT_STATUS[k.status].color}>{CONTRACT_STATUS[k.status].label}</Tag></td>
                    <td>{fdFull(k.start_date)}</td>
                    <td>{end ? <span style={near ? { color: 'var(--er)', fontWeight: 700 } : undefined}>{fdFull(end)}{near ? ' · próximo' : ''}</span> : '—'}</td>
                    <td>{k.renewal === 'automatica' ? 'Automática' : 'Manual'}{k.notice_days ? ` · aviso ${k.notice_days}d` : ''}</td>
                    {can('financeiro') && <><td className="num">{money(contractMonthly(its(k.id)))}</td><td className="num">{money(contractOneTime(its(k.id)))}</td></>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

type DraftItem = Omit<ContractItem, 'id' | 'contract_id'> & { id?: string; key: string }

export function ContratoEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const [sp] = useSearchParams()
  const { can } = useAuth()
  const navigate = useNavigate()
  const run = useRun()
  const { confirm, toast } = useFeedback()
  const contracts = useTable('contracts', { match: { id: id ?? '' }, enabled: !isNew })
  const clients = useTable('clients', { order: { column: 'name' } })
  const services = useTable('services', { order: { column: 'sort' } })
  const offers = useTable('service_offers', { order: { column: 'sort' } })
  const prices = useTable('offer_prices', { enabled: can('financeiro') })
  const savedItems = useTable('contract_items', { match: { contract_id: id ?? '' }, enabled: !isNew && can('financeiro') })
  const k = contracts.data?.[0]
  const finance = can('financeiro')
  const canWrite = can('contratos', 'write')
  const draft = isNew || k?.status === 'rascunho'
  // administrador pode abrir o "modo de correção" de um contrato já firmado (banco também permite só a ele)
  const admin = can('configuracoes', 'write')
  const [fixing, setFixing] = useState(false)
  const itemsEditable = (draft && canWrite && can('financeiro', 'write')) || (fixing && admin)
  // fora do rascunho, condições comerciais exigem permissão financeira (ou modo correção do admin)
  const termsLocked = !draft && !fixing && !can('financeiro', 'write') && !admin

  const [f, setF] = useState({
    client_id: sp.get('cliente') ?? '', start_date: '', min_months: '', renewal: 'automatica', notice_days: '30',
    due_day: '10', payment_method: 'pix', installments: '1', payment_terms: '', notes: '',
    templates: ['agencia'] as ContractTemplateKey[], platforms: '', publisher: 'contratada',
    video_quantity: '', shooting_location: '', first_payment_date: '', billing_periodicity: 'Mensal',
    portfolio_authorized: true, forum_city: 'São Luís - MA',
  })
  const [templatesTouched, setTemplatesTouched] = useState(!isNew)
  const [items, setItems] = useState<DraftItem[]>([])
  const [loaded, setLoaded] = useState(isNew)
  const [activating, setActivating] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  // carrega o contrato existente no formulário
  useEffect(() => {
    if (isNew || loaded || !k || (finance && !savedItems.data)) return
    const loadedItems = (savedItems.data ?? []).map((i) => ({ ...i, key: i.id }))
    const fallbackTemplates = k.templates?.length
      ? k.templates
      : inferTemplatesFromServices(loadedItems.map((i) => ({ name: services.data?.find((s) => s.id === i.service_id)?.name })))
    setF({
      client_id: k.client_id, start_date: k.start_date ?? '', min_months: k.min_months?.toString() ?? '', renewal: k.renewal,
      notice_days: k.notice_days?.toString() ?? '30', due_day: k.due_day?.toString() ?? '', payment_method: k.payment_method ?? '',
      installments: k.installments?.toString() ?? '1', payment_terms: k.payment_terms ?? '', notes: k.notes ?? '',
      templates: fallbackTemplates, platforms: k.platforms ?? '', publisher: k.publisher ?? 'contratada',
      video_quantity: k.video_quantity?.toString() ?? '', shooting_location: k.shooting_location ?? '',
      first_payment_date: k.first_payment_date ?? '', billing_periodicity: k.billing_periodicity ?? '',
      portfolio_authorized: k.portfolio_authorized ?? true, forum_city: k.forum_city || 'São Luís - MA',
    })
    setTemplatesTouched(true)
    setItems(loadedItems)
    setLoaded(true)
  }, [isNew, loaded, k, finance, savedItems.data, services.data])

  const priceOf = (offerId: string | null) => prices.data?.find((p) => p.offer_id === offerId)?.price ?? null

  // novo contrato vindo de um lead: já sugere o serviço de interesse
  const presetService = sp.get('servico')
  useEffect(() => {
    if (!isNew || !presetService || items.length || !offers.data || !services.data || (finance && !prices.data)) return
    addItem(presetService)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, presetService, offers.data, services.data, prices.data])

  function suggestFromItems(nextItems: DraftItem[], cur: typeof f) {
    const svcList = nextItems.map((i) => services.data?.find((x) => x.id === i.service_id)).filter(Boolean)
    const suggested = templatesTouched ? cur.templates : inferTemplatesFromServices(svcList.map((s) => ({ name: s?.name })))
    const hasRec = nextItems.some((i) => i.billing_type === 'recorrente')
    const hasOne = nextItems.some((i) => i.billing_type !== 'recorrente')
    const period = hasRec && hasOne ? 'Mensal + Pacote/Avulso' : hasRec ? 'Mensal' : hasOne ? 'Pacote / Avulso' : cur.billing_periodicity
    let vidQty = cur.video_quantity
    if (!vidQty && suggested.includes('studio')) {
      for (const it of nextItems) {
        const lbl = offers.data?.find((o) => o.id === it.offer_id)?.label ?? ''
        const m = lbl.match(/(\d+)\s*v[ií]deo/i)
        if (m) { vidQty = String(Number(m[1]) * it.quantity); break }
      }
    }
    return { ...cur, templates: suggested, billing_periodicity: cur.billing_periodicity || period, video_quantity: vidQty }
  }

  function addItem(serviceId: string) {
    const s = services.data?.find((x) => x.id === serviceId)
    if (!s) return
    const o = offers.data?.find((x) => x.service_id === s.id && x.active)
    const lp = priceOf(o?.id ?? null)
    const nextItems = [...items, {
      key: crypto.randomUUID?.() ?? String(Math.random()), service_id: s.id, offer_id: o?.id ?? null, description: null, quantity: 1,
      list_price: lp, negotiated_price: lp ?? 0, billing_type: s.billing_type,
    }]
    setItems(nextItems)
    setF((x) => {
      const next = suggestFromItems(nextItems, x)
      return !next.min_months && s.min_months ? { ...next, min_months: String(s.min_months) } : next
    })
  }
  const updItem = (key: string, patch: Partial<DraftItem>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  function toggleTemplate(key: ContractTemplateKey) {
    if (termsLocked) return
    setTemplatesTouched(true)
    setF((prev) => {
      const has = prev.templates.includes(key)
      if (has && prev.templates.length === 1) return prev
      return { ...prev, templates: has ? prev.templates.filter((t) => t !== key) : [...prev.templates, key] }
    })
  }

  const monthly = useMemo(() => contractMonthly(items), [items])
  const oneTime = useMemo(() => contractOneTime(items), [items])
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value })

  async function save(): Promise<string | null> {
    if (!f.client_id) return null
    const header = {
      client_id: f.client_id, lead_id: isNew ? sp.get('lead') : k?.lead_id ?? null, start_date: f.start_date || null,
      min_months: num(f.min_months), renewal: f.renewal as Contract['renewal'], notice_days: num(f.notice_days),
      due_day: num(f.due_day), payment_method: (f.payment_method || null) as Contract['payment_method'],
      installments: num(f.installments), payment_terms: nn(f.payment_terms), notes: nn(f.notes),
      templates: f.templates,
      platforms: f.templates.includes('agencia') || f.templates.includes('social_media') ? nn(f.platforms) : null,
      publisher: (f.templates.includes('social_media') ? (f.publisher || 'contratada') : null) as Contract['publisher'],
      video_quantity: f.templates.includes('studio') ? num(f.video_quantity) : null,
      shooting_location: f.templates.includes('studio') ? nn(f.shooting_location) : null,
      first_payment_date: f.first_payment_date || null,
      billing_periodicity: nn(f.billing_periodicity),
      portfolio_authorized: f.portfolio_authorized,
      forum_city: f.forum_city.trim() || 'São Luís - MA',
    }
    const r = await run(async () => {
      const cid = isNew ? (await db.insert('contracts', header)).id : (await db.update('contracts', { id: k!.id }, header), k!.id)
      if (itemsEditable) {
        const keep = new Set(items.filter((i) => i.id).map((i) => i.id))
        for (const old of savedItems.data ?? []) if (!keep.has(old.id)) await db.remove('contract_items', { id: old.id })
        for (const i of items) {
          const row = {
            contract_id: cid, service_id: i.service_id, offer_id: i.offer_id, description: i.description,
            quantity: i.quantity, list_price: i.list_price, negotiated_price: i.negotiated_price, billing_type: i.billing_type
          }
          if (i.id) await db.update('contract_items', { id: i.id }, row)
          else await db.insert('contract_items', row)
        }
      }
      return cid
    }, 'Contrato salvo')
    if (!r || r === true) return null
    if (isNew) navigate(`/contratos/${r}`, { replace: true })
    else { setLoaded(false); setFixing(false) }
    return r
  }
  // sai da correção sem salvar: recarrega o que está gravado
  const cancelFix = () => { setFixing(false); setLoaded(false) }

  async function setStatus(status: Contract['status'], msg: string) {
    if (!k || !(await confirm(msg, { danger: status !== 'ativo' }))) return
    await run(() => db.update('contracts', { id: k.id }, { status, end_date: status === 'encerrado' ? today() : k.end_date }), 'Contrato atualizado')
  }
  async function remove() {
    if (!k || !(await confirm('Excluir este rascunho de contrato?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('contracts', { id: k.id }), 'Contrato excluído')) navigate('/contratos')
  }

  async function generatePdf(onlyTemplate?: ContractTemplateKey) {
    const c = clients.data?.find((x) => x.id === f.client_id)
    if (!c) return
    const selectedTemplates = onlyTemplate ? [onlyTemplate] : (f.templates.length ? f.templates : (['agencia'] as ContractTemplateKey[]))
    setPdfBusy(true)
    try {
      const billingLabel = { recorrente: 'Mensal', pacote: 'Pacote', avulso: 'Avulso' } as const
      await contractPdf({
        client: c,
        status: k ? CONTRACT_STATUS[k.status].label : 'Rascunho',
        templates: selectedTemplates,
        items: items.map((i) => {
          const s = services.data?.find((x) => x.id === i.service_id)
          return {
            service: s?.name ?? 'Serviço', option: offers.data?.find((o) => o.id === i.offer_id)?.label ?? null,
            quantity: i.quantity, billing: billingLabel[i.billing_type], listPrice: i.list_price, price: i.negotiated_price,
            deliverables: s?.deliverables ?? [], deliveryNote: s?.delivery_note,
          }
        }),
        monthly, oneTime,
        terms: {
          start: f.start_date || null, minMonths: num(f.min_months), minEnd: f.start_date && f.min_months ? addMonths(f.start_date, Number(f.min_months)) : null,
          renewal: f.renewal === 'automatica' ? 'Automática' : 'Manual', noticeDays: num(f.notice_days), dueDay: num(f.due_day),
          paymentMethod: f.payment_method ? PAY_METHOD[f.payment_method] : null, installments: num(f.installments),
          paymentTerms: nn(f.payment_terms), notes: nn(f.notes),
          firstPaymentDate: f.first_payment_date || null,
          billingPeriodicity: nn(f.billing_periodicity),
          platforms: nn(f.platforms),
          publisher: selectedTemplates.includes('social_media') ? ((f.publisher || 'contratada') as 'contratada' | 'contratante') : null,
          videoQuantity: selectedTemplates.includes('studio') ? num(f.video_quantity) : null,
          shootingLocation: selectedTemplates.includes('studio') ? nn(f.shooting_location) : null,
          portfolioAuthorized: f.portfolio_authorized,
          forumCity: f.forum_city.trim() || 'São Luís - MA',
        },
      })
    } catch {
      toast('Não foi possível gerar o PDF. Tente de novo', true)
    } finally { setPdfBusy(false) }
  }

  if (!isNew && contracts.isLoading) return <Loading />
  if (!isNew && !k) return <Empty action={<Link className="btn" to="/contratos">Voltar</Link>}>Contrato não encontrado ou sem permissão</Empty>

  const client = clients.data?.find((c) => c.id === f.client_id)
  const end = f.start_date && f.min_months ? addMonths(f.start_date, Number(f.min_months)) : null
  const st = k ? CONTRACT_STATUS[k.status] : CONTRACT_STATUS.rascunho

  return (
    <>
      <Link to="/contratos" className="back"><ChevronLeft aria-hidden />Contratos</Link>
      <PageHead title={isNew ? 'Novo contrato' : `Contrato · ${client?.name ?? ''}`}
        sub={<><Tag color={st.color}>{st.label}</Tag>{k?.activated_at && <span className="mu"> · ativado em {fdFull(k.activated_at)}</span>}</>}
        actions={<>
          {finance && (
            <button className="btn" onClick={() => generatePdf()} disabled={!f.client_id || !items.length || pdfBusy}
              title={!items.length ? 'Adicione ao menos um serviço' : 'Baixar PDF completo para assinatura do cliente'}>
              <FileDown aria-hidden />{pdfBusy ? 'Gerando…' : f.templates.length > 1 ? 'Gerar PDF (unificado)' : 'Gerar PDF'}
            </button>
          )}
          {!draft && admin && !fixing && <button className="btn" onClick={() => setFixing(true)} title="Corrigir dados de um contrato já firmado"><Wrench aria-hidden />Corrigir contrato</button>}
          {(canWrite || fixing) && <button className="btn primary" onClick={save} disabled={!f.client_id}>{fixing ? 'Salvar correção' : 'Salvar'}</button>}
          {fixing && <button className="btn" onClick={cancelFix}>Cancelar correção</button>}
          {k?.status === 'rascunho' && canWrite && finance && <button className="btn" onClick={() => setActivating(true)} disabled={!items.length}>Ativar contrato</button>}
          {k?.status === 'ativo' && canWrite && <button className="btn" onClick={() => setStatus('encerrado', 'Encerrar este contrato hoje?')}>Encerrar</button>}
          {k?.status === 'rascunho' && can('contratos', 'delete') && <button className="btn danger" onClick={remove}>Excluir</button>}
        </>} />

      {fixing && (
        <div className="fix-note" role="note">
          <ShieldAlert aria-hidden />
          <div>
            <b>Modo de correção do administrador</b>
            <span>Você pode alterar cliente, serviços, valores e condições deste contrato firmado. Tudo fica registrado na auditoria.
              Vencimentos já gerados no Financeiro não mudam sozinhos: ajuste-os lá, se for o caso.</span>
          </div>
        </div>
      )}

      <fieldset disabled={!canWrite && !fixing} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="split">
          <div className="panel">
            <h3>Serviços contratados</h3>
            {!finance ? (
              <div className="lock"><Lock aria-hidden />Os serviços e valores do contrato são visíveis apenas para quem acessa o Financeiro</div>
            ) : (
              <>
                {!items.length && <p className="mu">Nenhum serviço adicionado</p>}
                {items.map((i) => {
                  const s = services.data?.find((x) => x.id === i.service_id)
                  const offs = (offers.data ?? []).filter((o) => o.service_id === i.service_id)
                  return (
                    <div key={i.key} className="row item-card">
                      <div className="item-head">
                        <b>{s?.name}</b>
                        <span className="tag soft">{i.billing_type === 'recorrente' ? 'mensal' : i.billing_type}</span>
                        <span className="item-sub">{money(i.negotiated_price * i.quantity)}{i.billing_type === 'recorrente' ? '/mês' : ''}</span>
                        {itemsEditable && (
                          <button className="btn ghost sm icon danger" type="button" aria-label={`Remover ${s?.name ?? 'serviço'} do contrato`} title="Remover serviço"
                            onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}><Trash2 aria-hidden /></button>
                        )}
                      </div>
                      <div className="form-grid">
                        <Field label="Opção">
                          <Select value={i.offer_id ?? ''} disabled={!itemsEditable}
                            onChange={(e) => { const lp = priceOf(e.target.value); updItem(i.key, { offer_id: e.target.value || null, list_price: lp, negotiated_price: lp ?? i.negotiated_price }) }}
                            options={offs.map((o) => ({ value: o.id, label: `${o.label}${priceOf(o.id) != null ? ` · ${money(priceOf(o.id))}` : ''}` }))} />
                        </Field>
                        <Field label="Quantidade"><input type="text" inputMode="numeric" value={i.quantity} disabled={!itemsEditable} onChange={(e) => updItem(i.key, { quantity: Math.max(1, Number(maskInteger(e.target.value)) || 1) })} /></Field>
                        <Field label="Valor negociado (R$)" hint={i.list_price != null && i.list_price !== i.negotiated_price ? `Tabela: ${money(i.list_price)}` : 'Preço de tabela sugerido'}>
                          <input type="text" inputMode="numeric" value={maskMoney(i.negotiated_price)} disabled={!itemsEditable} onChange={(e) => updItem(i.key, { negotiated_price: parseMoney(e.target.value) || 0 })} placeholder="0,00" />
                        </Field>
                        <Field label="Cobrança">
                          <Select value={i.billing_type} disabled={!itemsEditable} onChange={(e) => updItem(i.key, { billing_type: e.target.value as BillingType })}
                            options={[{ value: 'recorrente', label: 'Recorrente (mensal)' }, { value: 'pacote', label: 'Pacote' }, { value: 'avulso', label: 'Avulso' }]} />
                        </Field>
                      </div>
                    </div>
                  )
                })}
                {itemsEditable && (
                  <Select value="" onChange={(e) => e.target.value && addItem(e.target.value)} placeholder="Adicionar serviço…"
                    options={(services.data ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))} aria-label="Adicionar serviço" />
                )}
                {!draft && !fixing && <p className="money-note">Contrato firmado: os itens ficam congelados. Mudanças no catálogo não alteram este contrato.{admin ? ' Para corrigir um erro, use "Corrigir contrato".' : ''}</p>}
                <dl className="kv totals">
                  <dt>Total mensal</dt><dd><b>{money(monthly)}</b></dd>
                  <dt>Pacotes e avulsos</dt><dd><b>{money(oneTime)}</b></dd>
                </dl>
                <p className="money-note">Calculado automaticamente: soma de valor negociado × quantidade. O total mensal considera os serviços com cobrança recorrente; pacotes e avulsos são cobrados uma vez.</p>
              </>
            )}
          </div>

          <div className="panel">
            <h3>Condições</h3>
            <Field label="Cliente *" hint={client && (!client.document || !client.address)
              ? <>Falta CPF/CNPJ ou endereço para a qualificação jurídica — <Link to={`/clientes/${client.id}`}>completar cadastro</Link></>
              : undefined}>
              <Select value={f.client_id} onChange={set('client_id')} placeholder="Selecione" disabled={!isNew && !fixing}
                options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </Field>

            <Field label="Modelo(s) de cláusulas no PDF" hint={f.templates.length > 1
              ? 'Mais de um modelo selecionado: o botão principal gera o contrato unificado, ou baixe por modelo abaixo.'
              : 'Sugerido automaticamente pelos serviços contratados'}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {CONTRACT_TEMPLATES.map((tpl) => {
                  const active = f.templates.includes(tpl.key)
                  return (
                    <button key={tpl.key} type="button" disabled={termsLocked}
                      className={`btn sm ${active ? 'primary' : ''}`}
                      aria-pressed={active} title={tpl.hint}
                      onClick={() => toggleTemplate(tpl.key)}>
                      {tpl.label}
                    </button>
                  )
                })}
              </div>
              {finance && f.templates.length > 1 && items.length > 0 && f.client_id && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {f.templates.map((tk) => {
                    const label = CONTRACT_TEMPLATES.find((t) => t.key === tk)?.label ?? tk
                    return (
                      <button key={tk} type="button" className="btn ghost sm" disabled={pdfBusy}
                        onClick={() => generatePdf(tk)}>
                        <FileDown aria-hidden />Só {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </Field>

            {(f.templates.includes('agencia') || f.templates.includes('social_media')) && (
              <div className="form-grid">
                <Field label="Plataformas contratadas">
                  <input value={f.platforms} onChange={set('platforms')} disabled={termsLocked} placeholder="Ex.: Instagram, TikTok, Meta Ads" />
                </Field>
                {f.templates.includes('social_media') && (
                  <Field label="Responsável pela publicação (2.13)">
                    <Select value={f.publisher} onChange={set('publisher')} disabled={termsLocked}
                      options={[
                        { value: 'contratada', label: 'CONTRATADA (Nuage)' },
                        { value: 'contratante', label: 'CONTRATANTE (Cliente)' },
                      ]} />
                  </Field>
                )}
              </div>
            )}

            {f.templates.includes('studio') && (
              <div className="form-grid">
                <Field label="Quantidade de vídeos (Studio)">
                  <input type="text" inputMode="numeric" value={f.video_quantity} disabled={termsLocked}
                    onChange={(e) => setF({ ...f, video_quantity: maskInteger(e.target.value) })} placeholder="Ex.: 5" />
                </Field>
                <Field label="Local de captação">
                  <input value={f.shooting_location} onChange={set('shooting_location')} disabled={termsLocked} placeholder="Ex.: Estúdio Nuage / Sede do cliente" />
                </Field>
              </div>
            )}

            <div className="form-grid">
              <Field label="Início"><input type="date" value={f.start_date} onChange={set('start_date')} disabled={termsLocked} /></Field>
              <Field label="Prazo mínimo (meses)"><input type="text" inputMode="numeric" value={f.min_months} onChange={(e) => setF({ ...f, min_months: maskInteger(e.target.value) })} placeholder="Ex.: 6" disabled={termsLocked} /></Field>
              <Field label="Renovação"><Select value={f.renewal} onChange={set('renewal')} disabled={termsLocked} options={[{ value: 'automatica', label: 'Automática' }, { value: 'manual', label: 'Manual' }]} /></Field>
              <Field label="Aviso prévio"><Select value={f.notice_days} onChange={set('notice_days')} disabled={termsLocked} placeholder="A definir" options={[5, 10, 15, 20, 30].map((d) => ({ value: String(d), label: `${d} dias` }))} /></Field>
              <Field label="Dia de vencimento"><input type="text" inputMode="numeric" value={f.due_day} onChange={(e) => setF({ ...f, due_day: maskDay(e.target.value) })} placeholder="Ex.: 10" disabled={termsLocked} /></Field>
              <Field label="Pagamento"><Select value={f.payment_method} onChange={set('payment_method')} disabled={termsLocked} placeholder="A definir" options={Object.entries(PAY_METHOD).map(([v, l]) => ({ value: v, label: l }))} /></Field>
              <Field label="Parcelas"><input type="text" inputMode="numeric" value={f.installments} onChange={(e) => setF({ ...f, installments: maskInteger(e.target.value) })} placeholder="1" disabled={termsLocked} /></Field>
              <Field label="Data do 1º pagamento"><input type="date" value={f.first_payment_date} onChange={set('first_payment_date')} disabled={termsLocked} /></Field>
              <Field label="Periodicidade"><input value={f.billing_periodicity} onChange={set('billing_periodicity')} disabled={termsLocked} placeholder="Ex.: Mensal, Pacote único" /></Field>
              <Field label="Uso em portfólio Nuage">
                <Select value={f.portfolio_authorized ? 'sim' : 'nao'} disabled={termsLocked}
                  onChange={(e) => setF({ ...f, portfolio_authorized: e.target.value === 'sim' })}
                  options={[{ value: 'sim', label: 'AUTORIZO' }, { value: 'nao', label: 'NÃO AUTORIZO' }]} />
              </Field>
              <Field label="Foro (Cidade / UF)"><input value={f.forum_city} onChange={set('forum_city')} disabled={termsLocked} placeholder="São Luís - MA" /></Field>
            </div>
            {end && <p className="money-note">Prazo mínimo até {fdFull(end)}{f.renewal === 'automatica' ? ', renova automaticamente se não houver pedido de encerramento' : ''}.</p>}
            <Field label="Condições de pagamento"><input value={f.payment_terms} onChange={set('payment_terms')} placeholder="Ex.: parcelamento via Pix em 2x" disabled={termsLocked} /></Field>
            {termsLocked && <p className="money-note">Contrato firmado: apenas quem tem permissão financeira (ou o administrador) altera as condições comerciais e jurídicas. Observações continuam editáveis.</p>}
            <Field label="Observações"><textarea value={f.notes} onChange={set('notes')} placeholder="Combinados e observações do contrato" /></Field>
          </div>
        </div>
      </fieldset>

      {activating && k && <ActivateModal contractId={k.id} hasUnsaved={JSON.stringify(items.map((i) => [i.service_id, i.offer_id, i.quantity, i.negotiated_price, i.billing_type])) !== JSON.stringify((savedItems.data ?? []).map((i) => [i.service_id, i.offer_id, i.quantity, i.negotiated_price, i.billing_type]))}
        onSave={save} onClose={() => setActivating(false)} />}
    </>
  )
}

function ActivateModal({ contractId, hasUnsaved, onSave, onClose }: { contractId: string; hasUnsaved: boolean; onSave: () => Promise<string | null>; onClose: () => void }) {
  const people = usePeople()
  const run = useRun()
  const navigate = useNavigate()
  const [owner, setOwner] = useState('')
  async function go() {
    if (hasUnsaved && !(await onSave())) return
    const pid = await run(() => db.activateContract(contractId, owner || null), 'Contrato ativado · onboarding criado')
    if (pid) { onClose(); navigate(`/projetos?projeto=${pid}`) }
  }
  return (
    <Modal open onClose={onClose} title="Ativar contrato" size="sm"
      footer={<><button className="btn primary" onClick={go}>Ativar</button><button className="btn" onClick={onClose}>Cancelar</button></>}>
      <p style={{ marginTop: 0 }}>Ao ativar, o cliente passa a <b>Ativo</b>, é criado o projeto de onboarding e as tarefas do checklist.</p>
      <Field label="Responsável pelo onboarding">
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Eu mesmo" options={people.active.map((p) => ({ value: p.id, label: p.name }))} />
      </Field>
      {hasUnsaved && <p className="money-note">As alterações não salvas serão salvas antes de ativar</p>}
    </Modal>
  )
}
