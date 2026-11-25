// =====================================================================
// MODO DEMONSTRAÇÃO (npm run dev:demo)
// Dados de exemplo para validar telas e permissões sem banco.
// Configuração (cargos, matriz, etapas, serviços, preços, checklist)
// espelha supabase/migrations/20261119000100_dados_iniciais.sql.
// =====================================================================
import type { Profile } from './types'
import type { Tables } from '../data/types'

export const DEMO_USER_ID = 'demo-voce'

export const demoProfile = (role: string): Profile => ({
  id: DEMO_USER_ID, name: 'Você (demonstração)', role, link: 'Efetivo', active: true,
})

const MODULES = [
  ['dashboard', 'Início'], ['crm', 'Comercial'], ['clientes', 'Clientes'], ['contratos', 'Contratos'],
  ['financeiro', 'Financeiro'], ['projetos', 'Projetos e tarefas'], ['producao', 'Conteúdo'],
  ['estrategia', 'Estratégia'], ['equipe', 'Equipe'], ['configuracoes', 'Configurações'],
] as const


const day = (offset: number) => { const x = new Date(); x.setDate(x.getDate() + offset); return x.toLocaleDateString('sv-SE') }
const monthStart = (offset: number) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() + offset); return x.toLocaleDateString('sv-SE') }
const now = () => new Date().toISOString()

type Store = { [K in keyof Tables]: Tables[K][] }

export function demoSeed(): Store {
  let n = 0
  const id = (p: string) => `${p}-${++n}`
  const opt = (set_key: string, rows: [string, string | null, boolean?][]) =>
    rows.map(([label, color, is_final], i) => ({ id: id('opt'), set_key, label, color, sort: i + 1, is_final: !!is_final, active: true }))

  const options = [
    ...opt('lead_stage', [['Lead recebido', '#8e6bd8'], ['Primeiro contato', '#2f80ed'], ['Qualificação', '#0e9aa7'], ['Reunião', '#b97d00'], ['Diagnóstico', '#ea5c2a'], ['Proposta enviada', '#d6336c'], ['Negociação', '#5b4bdb'], ['Fechado', '#2e9e6a', true], ['Perdido', '#55555f', true]]),
    ...opt('lead_origin', [['Indicação', null], ['Instagram', null], ['Site', null], ['WhatsApp', null], ['Evento', null], ['Outro', null]]),
    ...opt('client_status', [['Em negociação', '#2f80ed'], ['Em onboarding', '#b97d00'], ['Ativo', '#2e9e6a'], ['Pausado', '#55555f'], ['Encerrado', '#55555f', true], ['Inadimplente', '#c0392b']]),
    ...opt('project_status', [['Planejado', '#2f80ed'], ['Em andamento', '#ea5c2a'], ['Pausado', '#55555f'], ['Concluído', '#2e9e6a', true], ['Cancelado', '#55555f', true]]),
    ...opt('task_status', [['Pendente', '#ea5c2a'], ['Em andamento', '#2f80ed'], ['Bloqueada', '#c0392b'], ['Concluída', '#2e9e6a', true]]),
    ...opt('content_status', [['Ideia', '#8e6bd8'], ['Planejado', '#2f80ed'], ['Em produção', '#ea5c2a'], ['Revisão interna', '#b97d00'], ['Aguardando aprovação', '#d6336c'], ['Ajustes', '#c0392b'], ['Aprovado', '#2e9e6a'], ['Agendado', '#0e9aa7'], ['Publicado', '#55555f', true]]),
    ...opt('bill_category', [['Aluguel e condomínio', '#5b4bdb'], ['Folha de pagamento', '#ea5c2a'], ['Impostos e taxas', '#c0392b'], ['Fornecedores', '#0e9aa7'], ['Software e assinaturas', '#2f80ed'], ['Marketing e anúncios', '#d6336c'], ['Equipamentos', '#b97d00'], ['Outros', '#55555f']]),
    ...opt('content_format', [['Reels', null], ['Stories', null], ['Carrossel', null], ['Estático', null], ['Fotografia', null], ['Vídeo institucional', null], ['Outro', null]]),
  ]
  const o = (set: string, label: string) => options.find((x) => x.set_key === set && x.label === label)!.id

  const services: Tables['services'][] = [
    { id: 'svc-ag', code: 'ag', name: 'Nuage Agência', description: 'Gestão estratégica da comunicação', category: 'Agência', billing_type: 'recorrente', min_months: 6, delivery_days: null, delivery_note: null, notes: null, active: true, sort: 1,
      deliverables: ['Gestão completa de redes sociais', 'Planejamento estratégico de conteúdo', 'Planejamento de Stories', 'Gestão de comunidade', 'Captação, roteirização, direção e edição de fotos e vídeos', 'Impulsionamento e gestão de tráfego pago (Meta Ads)', 'Análise de resultados e envio de relatórios', 'Posicionamento de marca', 'Avaliação e otimização do atendimento', 'Planejamento e execução de campanhas e eventos', 'Estruturação de processos de comunicação da marca', 'Criação de manuais e documentos operacionais', 'Acompanhamento estratégico e consultoria'] },
    { id: 'svc-sm', code: 'sm', name: 'Nuage Social Media', description: 'Gestão da presença digital', category: 'Social Media', billing_type: 'recorrente', min_months: 6, delivery_days: null, delivery_note: null, notes: null, active: true, sort: 2,
      deliverables: ['Gestão completa de redes sociais', 'Análise de perfil e diagnóstico de presença digital', 'Planejamento estratégico de conteúdo', 'Planejamento de Stories', 'Gestão de comunidade (responder comentários)', 'Captação, roteirização, direção e edição de fotos e vídeos'] },
    { id: 'svc-st', code: 'st', name: 'Nuage Studio', description: 'Produção audiovisual', category: 'Studio', billing_type: 'pacote', min_months: null, delivery_days: 2, delivery_note: 'Até 48 horas após a captação', notes: null, active: true, sort: 3,
      deliverables: ['Roteiros', 'Direção criativa e audiovisual', 'Captação de vídeos', 'Edição e finalização', 'Vídeos de até 1min30', 'Até uma captação por semana, conforme contratação'] },
  ]
  const offers: Tables['service_offers'][] = [
    { id: 'of-ag', service_id: 'svc-ag', label: 'Mensal', quantity: null, active: true, sort: 1 },
    { id: 'of-sm', service_id: 'svc-sm', label: 'Mensal', quantity: null, active: true, sort: 1 },
    { id: 'of-st1', service_id: 'svc-st', label: '1 vídeo', quantity: 1, active: true, sort: 1 },
    { id: 'of-st5', service_id: 'svc-st', label: '5 vídeos', quantity: 5, active: true, sort: 2 },
    { id: 'of-st8', service_id: 'svc-st', label: '8 vídeos', quantity: 8, active: true, sort: 3 },
    { id: 'of-st12', service_id: 'svc-st', label: '12 vídeos', quantity: 12, active: true, sort: 4 },
  ]
  const prices = [['of-ag', 2500], ['of-sm', 1500], ['of-st1', 350], ['of-st5', 1200], ['of-st8', 2000], ['of-st12', 3000]]
    .map(([offer_id, price]) => ({ offer_id: offer_id as string, price: price as number }))

  const tpl = { id: 'tpl-onb', service_id: null, name: 'Onboarding padrão', active: true }
  const tplItems = ([['Cadastro completo', 1], ['Contrato', 2], ['Cadastro financeiro', 2], ['Briefing', 5], ['Reunião inicial', 5], ['Coleta de identidade visual', 7], ['Acesso aos canais necessários', 7], ['Diagnóstico', 10], ['Planejamento inicial', 14], ['Aprovação do planejamento', 18], ['Início da operação', 21]] as [string, number][])
    .map(([title, d], i) => ({ id: id('ti'), template_id: tpl.id, title, due_offset_days: d, sort: i + 1 }))

  const profiles: Tables['profiles'][] = [
    { id: DEMO_USER_ID, name: 'Você (demonstração)', role: 'ceo', link: 'Efetivo', active: true, weekly_capacity_hours: 40 },
    // sem cargo: o sistema começa só com o administrador; os cargos são criados em Permissões
    { id: 'demo-ana', name: 'Ana Exemplo', role: null, link: 'Efetivo', active: true, weekly_capacity_hours: 40 },
    { id: 'demo-bruno', name: 'Bruno Exemplo', role: null, link: 'Efetivo', active: true, weekly_capacity_hours: 40 },
    { id: 'demo-carla', name: 'Carla Exemplo', role: null, link: 'Efetivo', active: true, weekly_capacity_hours: 30 },
    { id: 'demo-davi', name: 'Davi Exemplo', role: null, link: 'Estagiário', active: true, weekly_capacity_hours: 20 },
  ]
  const details = profiles.map((p) => ({ id: p.id, phone: '(00) 00000-0000', email: `${p.id.replace('demo-', '')}@exemplo.com`, insta: null, x: null }))

  // espelha os dados iniciais do banco: só o administrador, com acesso total
  const roles = [{ key: 'ceo', name: 'Administrador / CEO / Gestor', sort: 1 }]
  const modules = MODULES.map(([key, name], i) => ({ key, name, sort: i + 1 }))
  const role_permissions = modules.map((m) => ({ role: 'ceo', module: m.key, scope: 'all' as const, can_write: true, can_delete: true }))

  const clients: Tables['clients'][] = [
    { id: 'cli-a', name: 'Cliente Exemplo A', segment: 'Alimentação', contact_name: 'Contato A', phone: '(00) 0000-0001', email: 'a@exemplo.com', status_id: o('client_status', 'Ativo'), notes: null, created_by: null, created_at: now() },
    { id: 'cli-b', name: 'Cliente Exemplo B', segment: 'Moda', contact_name: 'Contato B', phone: null, email: 'b@exemplo.com', status_id: o('client_status', 'Ativo'), notes: null, created_by: null, created_at: now() },
    { id: 'cli-c', name: 'Cliente Exemplo C', segment: 'Saúde', contact_name: 'Contato C', phone: null, email: null, status_id: o('client_status', 'Em onboarding'), notes: null, created_by: null, created_at: now() },
  ]

  const lead = (name: string, company: string, stage: string, owner: string | null, follow: number | null, svc: string | null): Tables['leads'] => ({
    id: id('lead'), name, company, phone: null, email: null, segment: null, origin: 'Instagram', service_id: svc,
    owner_id: owner, stage_id: o('lead_stage', stage), next_action: 'Enviar portfólio', follow_up: follow === null ? null : day(follow),
    notes: null, client_id: null, created_by: null, created_at: now(),
  })
  const leads = [
    lead('Lead Exemplo 1', 'Empresa Exemplo 1', 'Lead recebido', 'demo-bruno', 2, 'svc-sm'),
    lead('Lead Exemplo 2', 'Empresa Exemplo 2', 'Primeiro contato', DEMO_USER_ID, -1, 'svc-ag'),
    lead('Lead Exemplo 3', 'Empresa Exemplo 3', 'Reunião', DEMO_USER_ID, 3, 'svc-st'),
    lead('Lead Exemplo 4', 'Empresa Exemplo 4', 'Proposta enviada', 'demo-bruno', 5, 'svc-ag'),
    lead('Lead Exemplo 5', 'Empresa Exemplo 5', 'Negociação', DEMO_USER_ID, 1, 'svc-sm'),
  ]
  const lead_values = leads.map((l, i) => ({ lead_id: l.id, estimated_value: [1500, 2500, 1200, 2500, 1500][i] }))

  const contract = (cid: string, client_id: string, status: Tables['contracts']['status'], startOffset: number): Tables['contracts'] => ({
    id: cid, client_id, lead_id: null, status, start_date: status === 'rascunho' ? null : monthStart(startOffset), end_date: null,
    min_months: 6, renewal: 'automatica', notice_days: 15, due_day: 10, payment_method: 'pix', installments: 1,
    payment_terms: null, notes: null, activated_at: status === 'ativo' ? now() : null, created_at: now(),
  })
  const contracts = [contract('ct-a', 'cli-a', 'ativo', -4), contract('ct-b', 'cli-b', 'ativo', -5), contract('ct-c', 'cli-c', 'rascunho', 0)]
  const contract_items: Tables['contract_items'][] = [
    { id: id('ci'), contract_id: 'ct-a', service_id: 'svc-ag', offer_id: 'of-ag', description: null, quantity: 1, list_price: 2500, negotiated_price: 2300, billing_type: 'recorrente' },
    { id: id('ci'), contract_id: 'ct-b', service_id: 'svc-sm', offer_id: 'of-sm', description: null, quantity: 1, list_price: 1500, negotiated_price: 1500, billing_type: 'recorrente' },
    { id: id('ci'), contract_id: 'ct-b', service_id: 'svc-st', offer_id: 'of-st5', description: null, quantity: 1, list_price: 1200, negotiated_price: 1200, billing_type: 'pacote' },
    { id: id('ci'), contract_id: 'ct-c', service_id: 'svc-sm', offer_id: 'of-sm', description: null, quantity: 1, list_price: 1500, negotiated_price: 1500, billing_type: 'recorrente' },
  ]
  const due = (m: number) => { const s = monthStart(m); return s.slice(0, 8) + '10' }
  // meses anteriores já quitados (para o histórico)
  const older: Tables['payments'][] = []
  for (const [cid, amount, from] of [['ct-a', 2300, -4], ['ct-b', 1500, -5]] as [string, number, number][])
    for (let m = from; m <= -2; m++)
      older.push({ id: id('pay'), contract_id: cid, due_date: due(m), amount, status: 'pago', paid_at: due(m), method: 'pix', notes: 'Mensalidade' })
  const payments: Tables['payments'][] = [
    ...older,
    { id: id('pay'), contract_id: 'ct-a', due_date: due(-1), amount: 2300, status: 'pago', paid_at: due(-1), method: 'pix', notes: 'Mensalidade' },
    { id: id('pay'), contract_id: 'ct-a', due_date: due(0), amount: 2300, status: 'previsto', paid_at: null, method: 'pix', notes: 'Mensalidade' },
    { id: id('pay'), contract_id: 'ct-b', due_date: due(-1), amount: 1500, status: 'previsto', paid_at: null, method: 'pix', notes: 'Mensalidade' },
    { id: id('pay'), contract_id: 'ct-b', due_date: due(0), amount: 1500, status: 'previsto', paid_at: null, method: 'pix', notes: 'Mensalidade' },
    { id: id('pay'), contract_id: 'ct-b', due_date: due(0), amount: 1200, status: 'pago', paid_at: day(-3), method: 'pix', notes: 'Pacote Studio 5 vídeos' },
  ]

  // contas a pagar de exemplo (uma atrasada, uma paga, uma série parcelada)
  const bill = (description: string, category: string, amount: number, dueOffset: number, paid = false, extra: Partial<Tables['bills']> = {}): Tables['bills'] => ({
    id: id('bill'), description, supplier: null, category_id: o('bill_category', category), amount, due_date: day(dueOffset),
    status: paid ? 'pago' : 'aberto', paid_at: paid ? day(dueOffset) : null, method: 'pix', notes: null,
    series_id: null, installment: null, installments: null, created_by: DEMO_USER_ID, created_at: now(), ...extra,
  })
  const serie = 'serie-notebook'
  const bills: Tables['bills'][] = [
    bill('Aluguel do escritório', 'Aluguel e condomínio', 3200, -3, false, { supplier: 'Imobiliária Exemplo', method: 'boleto' }),
    bill('Folha de pagamento', 'Folha de pagamento', 9800, -8, true, { method: 'transferencia' }),
    bill('Simples Nacional', 'Impostos e taxas', 1450, 5, false, { method: 'boleto' }),
    bill('Ferramentas de design (assinatura)', 'Software e assinaturas', 290, 2, false, { method: 'cartao' }),
    bill('Anúncios Meta (verba própria)', 'Marketing e anúncios', 600, 12),
    ...[1, 2, 3].map((n) => bill(`Notebook da edição (${n}/3)`, 'Equipamentos', 1500, -10 + (n - 1) * 30, n === 1,
      { supplier: 'Loja Exemplo', method: 'cartao', series_id: serie, installment: n, installments: 3 })),
  ]

  const proj = (pid: string, name: string, client_id: string, owner: string, status: string, dueOffset: number): Tables['projects'] => ({
    id: pid, client_id, service_id: null, contract_id: null, name, description: null, objective: null, owner_id: owner,
    status_id: o('project_status', status), priority: 'media', start_date: day(-20), due_date: day(dueOffset), created_by: null,
  })
  const projects = [
    proj('pj-1', 'Onboarding · Cliente Exemplo C', 'cli-c', DEMO_USER_ID, 'Em andamento', 14),
    proj('pj-2', 'Campanha de lançamento', 'cli-b', 'demo-ana', 'Em andamento', 10),
    proj('pj-3', 'Conteúdo mensal', 'cli-a', 'demo-bruno', 'Em andamento', 25),
    proj('pj-4', 'Vídeo institucional', 'cli-b', 'demo-davi', 'Planejado', -3),
  ]
  const project_members = [{ project_id: 'pj-2', profile_id: DEMO_USER_ID }, { project_id: 'pj-2', profile_id: 'demo-bruno' }]

  const task = (title: string, project_id: string, client_id: string, owner: string | null, dueOffset: number | null, status = 'Pendente', priority: Tables['tasks']['priority'] = 'media'): Tables['tasks'] => ({
    id: id('task'), project_id, client_id, parent_id: null, title, description: null, owner_id: owner, status_id: o('task_status', status),
    priority, start_date: day(-5), due_date: dueOffset === null ? null : day(dueOffset), effort_hours: null, recurrence: null,
    done_at: status === 'Concluída' ? now() : null, created_by: null, created_at: now(),
  })
  const tasks = [
    task('Briefing', 'pj-1', 'cli-c', DEMO_USER_ID, -2, 'Em andamento', 'alta'),
    task('Coleta de identidade visual', 'pj-1', 'cli-c', null, 1),
    task('Acesso aos canais necessários', 'pj-1', 'cli-c', null, null),
    task('Cadastro completo', 'pj-1', 'cli-c', DEMO_USER_ID, -6, 'Concluída'),
    task('Roteiro dos Reels da semana', 'pj-2', 'cli-b', 'demo-ana', -1, 'Pendente', 'urgente'),
    task('Peças do lançamento', 'pj-2', 'cli-b', 'demo-ana', 4),
    task('Relatório mensal de resultados', 'pj-3', 'cli-a', 'demo-bruno', 3),
    task('Planejamento de Stories', 'pj-3', 'cli-a', DEMO_USER_ID, 4),
    task('Edição do vídeo institucional', 'pj-4', 'cli-b', 'demo-davi', 2),
  ]
  const task_dependencies = [{ task_id: tasks[5].id, depends_on: tasks[4].id }]
  const task_checklist = [
    { id: id('chk'), task_id: tasks[0].id, title: 'Enviar formulário ao cliente', done: true, sort: 1 },
    { id: id('chk'), task_id: tasks[0].id, title: 'Revisar respostas', done: false, sort: 2 },
  ]

  const content = (title: string, client_id: string, format: string, status: string, owner: string | null, pub: number | null, dueOffset: number | null, time: string | null = null): Tables['contents'] => ({
    id: id('ct'), title, client_id, project_id: null, format_id: o('content_format', format), status_id: o('content_status', status),
    channel: 'Instagram', objective: null, briefing: null, caption: null, links: null, owner_id: owner, reviewer_id: null,
    due_date: dueOffset === null ? null : day(dueOffset), publish_date: pub === null ? null : day(pub), publish_time: time,
    posted_at: status === 'Publicado' ? now() : null, posted_url: null, created_by: null, created_at: now(),
  })
  const contents = [
    content('Bastidores da cozinha', 'cli-a', 'Reels', 'Em produção', 'demo-ana', 2, 1, '18:00'),
    content('Cardápio da semana', 'cli-a', 'Carrossel', 'Aguardando aprovação', 'demo-bruno', 3, 1, '12:00'),
    content('Lançamento coleção verão', 'cli-b', 'Reels', 'Aprovado', 'demo-ana', 1, -1, '19:00'),
    content('Look do dia', 'cli-b', 'Stories', 'Agendado', 'demo-bruno', 0, -1, '10:00'),
    content('Depoimento de paciente', 'cli-c', 'Vídeo institucional', 'Planejado', DEMO_USER_ID, 6, 4),
    content('Dicas de prevenção', 'cli-c', 'Carrossel', 'Ideia', null, null, null),
    content('Promoção de inverno', 'cli-a', 'Estático', 'Publicado', 'demo-davi', -2, -3, '09:00'),
    content('Novidades da loja', 'cli-b', 'Fotografia', 'Ajustes', 'demo-davi', 4, -1),
  ]
  const content_history = contents.map((c, i) => ({ id: i + 1, content_id: c.id, at: now(), actor: null, from_label: null, to_label: options.find((x) => x.id === c.status_id)!.label }))

  return {
    contents, content_history,
    profiles, profile_details: details, roles, modules, role_permissions, user_permissions: [],
    options, services, service_offers: offers, offer_prices: prices,
    checklist_templates: [tpl], checklist_template_items: tplItems,
    clients, leads, lead_values, contracts, contract_items, payments, bills,
    projects, project_members, tasks, task_collaborators: [], task_dependencies, task_checklist,
    comments: [], audit_log: [],
    notifications: (() => {
      const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString()
      const nt = (kind: string, title: string, body: string | null, link: string | null, min: number, read = false): Tables['notifications'] =>
        ({ id: id('ntf'), user_id: DEMO_USER_ID, kind, title, body, link, source: null, read_at: read ? ago(min - 1) : null, created_at: ago(min) })
      return [
        nt('task_assigned', 'Ana atribuiu uma tarefa a você', `${tasks[0].title} · vence ${day(-2).split('-').reverse().slice(0, 2).join('/')}`, `/projetos?tarefa=${tasks[0].id}`, 12),
        nt('comment', `Novo comentário em ${contents[1].title}`, 'Bruno: Ajustei a legenda, pode aprovar?', `/conteudo?conteudo=${contents[1].id}`, 45),
        nt('bills_due', '2 conta(s) a pagar vencendo ou vencida(s)', 'Total de R$ 4.650,00', '/financeiro?aba=pagar', 90),
        nt('lead_followup', 'Retorno de lead atrasado', `${leads[1].name} · Enviar portfólio`, `/comercial?lead=${leads[1].id}`, 60 * 20),
        nt('task_done', 'Carla concluiu uma tarefa', tasks[3].title, `/projetos?tarefa=${tasks[3].id}`, 60 * 30, true),
        nt('event', 'Compromisso da agência: Reunião geral da agência', 'Sexta às 17:00', '/agenda', 60 * 50, true),
      ]
    })(),
    events: [
      { id: id('ev'), title: 'Reunião de alinhamento mensal', date: day(1), time: '10:00', profile_id: null, client_id: 'cli-a', notes: null, created_by: null, created_at: now() },
      { id: id('ev'), title: 'Captação de vídeos', date: day(3), time: '14:00', profile_id: 'demo-davi', client_id: 'cli-b', notes: 'Levar iluminação', created_by: null, created_at: now() },
      { id: id('ev'), title: 'Reunião inicial de onboarding', date: day(2), time: '09:30', profile_id: DEMO_USER_ID, client_id: 'cli-c', notes: null, created_by: null, created_at: now() },
      { id: id('ev'), title: 'Reunião geral da agência', date: day(5), time: '17:00', profile_id: null, client_id: null, notes: null, created_by: null, created_at: now() },
    ],
  }
}
