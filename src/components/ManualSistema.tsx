import { BookOpen, Briefcase, CalendarDays, CheckCircle2, Clapperboard, Compass, Contact, FileText, House, KanbanSquare, Layers, Search, Settings, ShieldCheck, Users, Wallet } from 'lucide-react'
import { useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { canAccess, NAV } from '../routes'

interface ManualSection {
  id: string
  title: string
  route?: string
  icon: ComponentType<{ 'aria-hidden'?: boolean }>
  category: 'Visão geral' | 'Relacionamento' | 'Operação' | 'Gestão' | 'Configurações na prática' | 'Recursos do sistema'
  summary: string
  whatItDoes: string[]
  howToFeed: string[]
  howToUse: string[]
  whereUsed?: string
  tip?: string
}

const SETUP_FLOW = [
  {
    step: '1. Configure o motor da agência',
    place: 'Configurações + Equipe',
    detail: 'Cadastre Serviços e opções/preços, personalize Etapas e status das colunas do sistema, monte Checklists de onboarding, ajuste Permissões por cargo e cadastre os acessos em Equipe.',
  },
  {
    step: '2. Prospecte e feche vendas',
    place: 'Comercial',
    detail: 'Registre novos leads usando as Origens e Serviços configurados, defina data de retorno e arraste no Kanban até Fechado para converter o lead em Cliente.',
  },
  {
    step: '3. Complete a ficha jurídica do cliente',
    place: 'Clientes',
    detail: 'Preencha contatos e os dados contratuais obrigatórios: Razão social/nome completo, CPF ou CNPJ, Endereço completo, Representante legal (quando PJ) e o Briefing criativo.',
  },
  {
    step: '4. Monte, gere PDF e ative o contrato',
    place: 'Contratos',
    detail: 'Escolha o serviço (puxa Opções, valores sugeridos e entregáveis de Serviços e preços), selecione o modelo jurídico, baixe o PDF fiel ao documento da agência e clique em Ativar contrato.',
  },
  {
    step: '5. Execute a operação automática',
    place: 'Projetos · Conteúdo · Estratégia · Agenda',
    detail: 'Ativar o contrato cria automaticamente o projeto de Onboarding com base nos Checklists configurados. Acompanhe tarefas/recorrências, envie links públicos de aprovação em Conteúdo e veja tudo na Agenda.',
  },
  {
    step: '6. Fature e controle despesas',
    place: 'Financeiro · Auditoria',
    detail: 'Gere os recebimentos mensais dos contratos ativos, lance Contas a pagar usando as categorias configuradas, emita extratos PDF e audite alterações no histórico imutável.',
  },
]

const CONFIG_CONNECTIONS = [
  {
    aba: 'Permissões',
    paraQueServe: 'Define quem pode ler (Sem acesso, Só os próprios ou Todos), criar/editar e excluir em cada módulo, por cargo ou por pessoa específica.',
    ondeUsado: 'Controla o menu lateral, o bloqueio de páginas e a visibilidade no banco: ex.: quem não tem Financeiro não vê preços de Serviços, valores em Contratos, orçamentos em Campanhas nem valor estimado de Leads.',
  },
  {
    aba: 'Serviços e preços',
    paraQueServe: 'Cadastra os serviços da agência, tipo de cobrança, prazo mínimo, prazo de entrega, entregáveis e as Opções/pacotes com preços de tabela.',
    ondeUsado: 'Alimenta o campo "Serviço de interesse" em Comercial, preenche os dropdowns de Serviço e Opção + Valor sugerido em Contratos, imprime os Entregáveis no PDF do contrato e identifica automaticamente os modelos jurídicos (Agência, Social Media, Studio).',
  },
  {
    aba: 'Etapas e status',
    paraQueServe: 'Permite editar nomes, cores, ordem (setas) e marcar qual etapa é considerada final (concluída/encerrada) em todas as listas do sistema.',
    ondeUsado: 'Alimenta as colunas do Kanban de Comercial e Projetos, os dropdowns de Origem do lead, Status de cliente, Status de projeto/tarefa/conteúdo/campanha, Formatos de conteúdo e Categorias de Contas a pagar.',
  },
  {
    aba: 'Checklists',
    paraQueServe: 'Define sequências padronizadas de tarefas de entrada ("Todo contrato" ou vinculadas a um serviço específico, como "Onboarding · Studio").',
    ondeUsado: 'Disparado automaticamente ao clicar em "Ativar contrato": cria o projeto "Onboarding · Cliente" em Projetos e gera todas as tarefas do checklist global + do checklist de cada serviço contratado com prazos calculados.',
  },
  {
    aba: 'Auditoria',
    paraQueServe: 'Registra de forma imutável quem criou, editou ou excluiu registros no sistema e permite exportar para CSV.',
    ondeUsado: 'Usada pelo administrador para rastrear alterações em contratos firmados ("Corrigir contrato"), lançamentos financeiros, permissões, clientes e tarefas.',
  },
]

const ETAPAS_SETS = [
  { grupo: 'Etapas do funil comercial', onde: 'Colunas do Kanban na tela Comercial e conversão de lead ao fechar.' },
  { grupo: 'Origens de lead', onde: 'Campo "Origem" ao criar/editar leads na tela Comercial (ex.: Instagram, Indicação).' },
  { grupo: 'Status de cliente', onde: 'Cartões/filtros em Clientes (ao ativar contrato muda para Ativo; marcar "Cliente encerrado" indica término).' },
  { grupo: 'Status de projeto', onde: 'Etiqueta de andamento em Projetos e na aba Projetos e tarefas do Cliente.' },
  { grupo: 'Status de tarefa', onde: 'Colunas do Kanban em Projetos (marcar "Conclui a tarefa" grava data de conclusão e cria próxima ocorrência recorrente).' },
  { grupo: 'Status de conteúdo', onde: 'Fluxo em Conteúdo ("Marca como postado" grava data de postagem; Aprovado/Ajustes são usados pelo link público).' },
  { grupo: 'Formatos de conteúdo', onde: 'Campo "Formato" em Conteúdo (ex.: Reels, Carrossel, Stories).' },
  { grupo: 'Status de campanha', onde: 'Aba Campanhas dentro da ficha do Cliente.' },
  { grupo: 'Categorias de contas a pagar', onde: 'Campo "Categoria" e filtro de despesas em Financeiro > Contas a pagar.' },
]

const SECTIONS: ManualSection[] = [
  {
    id: 'cfg-servicos',
    title: 'Configurações · Serviços e preços',
    route: '/configuracoes?aba=servicos',
    icon: Layers,
    category: 'Configurações na prática',
    summary: 'É o catálogo oficial da agência. Tudo o que você vende e negocia em propostas/contratos nasce aqui.',
    whatItDoes: [
      'Cadastra cada serviço prestado (ex.: Agência, Social Media, Studio), sua cobrança padrão (Recorrente, Pacote ou Avulso), prazo mínimo sugerido (em meses) e prazo de execução.',
      'Armazena os Entregáveis (um por linha) e as Opções de contratação (pacotes/planos internos daquele serviço, cada um com seu Preço de tabela visível apenas para quem tem acesso ao Financeiro).',
    ],
    howToFeed: [
      '1) Clique em Novo serviço, preencha nome, tipo de cobrança, contrato mínimo (ex.: 6 meses), observação de prazo (ex.: 48h após captação) e liste os entregáveis um por linha.',
      '2) Dentro do serviço criado, adicione as Opções/pacotes (ex.: para Studio -> "Pacote 5 vídeos", "Pacote 10 vídeos"; para Agência -> "Plano Mensal Completo") e defina o preço sugerido de cada opção.',
    ],
    howToUse: [
      'Sempre que criar um novo plano ou reajustar preços de tabela, atualize aqui — contratos já firmados não mudam (ficam congelados), apenas contratos novos puxam a tabela nova.',
    ],
    whereUsed: 'Tela Comercial (campo Serviço de interesse do lead) · Tela Contratos (dropdown Adicionar serviço, dropdown Opção do item, Valor negociado sugerido, Prazo mínimo sugerido) · PDF do Contrato (seção Escopo dos serviços contratados e seleção automática de cláusulas).',
    tip: 'Se o campo "Opção" aparecer vazio em um contrato, significa que o serviço adicionado ainda não tem nenhuma opção/pacote cadastrado nesta aba.',
  },
  {
    id: 'cfg-etapas',
    title: 'Configurações · Etapas e status',
    route: '/configuracoes?aba=etapas',
    icon: Settings,
    category: 'Configurações na prática',
    summary: 'Personaliza todas as colunas de Kanban, listas suspensas, cores e gatilhos de conclusão do sistema sem mexer no código.',
    whatItDoes: [
      'Reúne 9 grupos de listas editáveis do sistema: etapas comerciais, origens de lead, status de cliente/projeto/tarefa/conteúdo/campanha, formatos de conteúdo e categorias de contas a pagar.',
      'Permite reordenar (setas ↑/↓), renomear, escolher cor da etiqueta, desativar opções antigas sem perder histórico e marcar qual etapa é final.',
    ],
    howToFeed: [
      'Selecione o cadastro desejado no dropdown "Cadastro", adicione ou edite as opções, escolha cores que facilitem a leitura visual e marque o checkbox final (ex.: "Conclui a tarefa", "Marca como postado") apenas nas etapas que realmente encerram o trabalho.',
    ],
    howToUse: [
      'Prefira desativar uma opção antiga (desmarcar "Ativa") em vez de excluir quando ela já estiver vinculada a clientes, tarefas ou contas a pagar.',
    ],
    whereUsed: 'Colunas do Kanban em Comercial e Projetos · Dropdowns de Origem, Status e Formatos em Clientes, Conteúdo, Estratégia e Financeiro (Contas a pagar) · Gatilho de tarefas recorrentes ao mover para status final.',
  },
  {
    id: 'cfg-checklists',
    title: 'Configurações · Checklists',
    route: '/configuracoes?aba=checklists',
    icon: CheckCircle2,
    category: 'Configurações na prática',
    summary: 'Automação de entrada de novos clientes: transforma a ativação de um contrato em um projeto pronto com todas as tarefas iniciais.',
    whatItDoes: [
      'Permite manter um checklist geral ("Todo contrato", aplicado sempre) e checklists específicos vinculados a cada serviço cadastrado em Serviços e preços.',
      'Cada item do checklist define o título da tarefa, em quantos dias após a ativação ela vence e qual cargo costuma assumir.',
    ],
    howToFeed: [
      'Selecione um checklist existente (ou crie um vínculo para um serviço no seletor inferior) e adicione passo a passo tudo o que a equipe precisa fazer quando entra um cliente novo (ex.: "Coletar acessos", "Reunião de briefing", "Criar pasta no Drive").',
    ],
    howToUse: [
      'Revise os passos periodicamente para garantir que nenhum novo cliente entre sem o padrão de onboarding da agência.',
    ],
    whereUsed: 'Disparado automaticamente ao clicar em "Ativar contrato" na tela de Contratos -> cria o projeto "Onboarding · Cliente" em Projetos e tarefas com toda a lista de tarefas já aberta e atribuída.',
  },
  {
    id: 'cfg-permissoes',
    title: 'Configurações · Permissões e Auditoria',
    route: '/configuracoes?aba=permissoes',
    icon: ShieldCheck,
    category: 'Configurações na prática',
    summary: 'Define com segurança real de banco de dados o que cada cargo ou usuário enxerga e registra toda alteração crítica.',
    whatItDoes: [
      'Permissões: cria/renomeia/exclui cargos e configura, módulo por módulo, leitura (Sem acesso, Só os próprios, Todos), Criar/editar e Excluir — além de permitir ajuste individual por pessoa.',
      'Auditoria: guarda histórico imutável de inserções, alterações e exclusões em todas as tabelas principais, com exportação CSV.',
    ],
    howToFeed: [
      'Em Permissões > Por cargo, selecione um cargo (ou crie um novo) e ajuste as linhas dos 10 módulos. Use "Ajuste por pessoa" apenas para exceções pontuais.',
    ],
    howToUse: [
      'Lembre-se que a permissão "Financeiro" libera também valores ocultos em Leads (Comercial), Itens/valores em Contratos e Verba em Campanhas de Clientes.',
      'Use a aba Auditoria para conferir quem alterou um vencimento, corrigiu um contrato firmado ou excluiu um registro.',
    ],
    whereUsed: 'Aplicado em todo o sistema (menu lateral, rotas de telas, busca global Ctrl+K, notificações e políticas RLS do Supabase).',
  },
  {
    id: 'inicio',
    title: 'Início',
    route: '/',
    icon: House,
    category: 'Visão geral',
    summary: 'Painel inicial personalizado com as prioridades do dia conforme suas permissões.',
    whatItDoes: [
      'Reúne indicadores rápidos do dia: tarefas com vencimento hoje, tarefas em atraso, compromissos da agenda, retornos comerciais e resumo financeiro (visível apenas para quem tem Financeiro).',
    ],
    howToFeed: [
      'Não precisa preencher nada diretamente aqui: o painel consolida em tempo real o que foi lançado em Projetos, Agenda, Comercial, Conteúdo e Financeiro.',
    ],
    howToUse: [
      'Abra no começo do dia para resolver pendências vencidas primeiro. Clicar em um item abre diretamente a tela correspondente.',
    ],
  },
  {
    id: 'agenda',
    title: 'Agenda',
    route: '/agenda',
    icon: CalendarDays,
    category: 'Visão geral',
    summary: 'Calendário unificado com reuniões manuais + datas vindas de todos os outros módulos.',
    whatItDoes: [
      'Agrupa em uma visão única: Compromissos/reuniões, Conteúdos previstos, Tarefas, Entregas de projeto, Vencimentos financeiros, Contratos e Retornos comerciais.',
    ],
    howToFeed: [
      'Clique em Novo compromisso para lançar reuniões de alinhamento, brainstorm ou gravações/captações (informando participante da equipe e cliente).',
      'Demais eventos entram sozinhos conforme recebem datas nos módulos de Projetos, Conteúdo, Comercial e Financeiro.',
    ],
    howToUse: [
      'Use o filtro de Cliente no topo antes de reuniões de alinhamento para enxergar todas as entregas e datas daquela conta.',
    ],
  },
  {
    id: 'comercial',
    title: 'Comercial (CRM)',
    route: '/comercial',
    icon: Briefcase,
    category: 'Relacionamento',
    summary: 'Funil Kanban para acompanhar negociações até virarem clientes e contratos.',
    whatItDoes: [
      'Organiza leads nas etapas definidas em Configurações > Etapas e status.',
      'Guarda valor estimado em área restrita ao Financeiro, permite exportar CSV e converter lead fechado diretamente em Cliente.',
    ],
    howToFeed: [
      'Ao criar um lead, preencha Origem e Serviço de interesse (vindos de Configurações), Responsável comercial, Próxima ação e Data de retorno (follow-up).',
    ],
    howToUse: [
      'Arraste cards entre as colunas do Kanban. Quando o cliente fechar, abra o card e converta em Cliente; o sistema já oferece abrir o Novo Contrato com o serviço escolhido.',
    ],
    tip: 'Leads com retorno marcado para hoje ou vencido disparam lembretes no sino de Notificações.',
  },
  {
    id: 'clientes',
    title: 'Clientes',
    route: '/clientes',
    icon: Users,
    category: 'Relacionamento',
    summary: 'Carteira oficial da agência e ficha 360° com histórico completo da conta.',
    whatItDoes: [
      'Reúne todos os dados de contato, dados jurídicos de contrato e 9 abas na ficha do cliente: Visão geral, Briefing, Estratégia, Contratos, Projetos e tarefas, Produções, Campanhas, Reuniões e Comentários.',
    ],
    howToFeed: [
      'Sempre preencha os campos jurídicos no cadastro/edição do cliente: Razão social/nome completo, CPF ou CNPJ, Endereço completo e Representante legal (quando PJ) — eles alimentam automaticamente a qualificação e assinatura do PDF do contrato.',
      'Após o alinhamento inicial, preencha a aba Briefing (público-alvo, tom de voz, diferenciais, links de referência) e lance Campanhas de tráfego na aba Campanhas.',
    ],
    howToUse: [
      'Consulte a ficha antes de produzir conteúdo ou montar contratos. Exportação CSV disponível na listagem principal.',
    ],
  },
  {
    id: 'contratos',
    title: 'Contratos',
    route: '/contratos',
    icon: FileText,
    category: 'Relacionamento',
    summary: 'Montagem comercial, geração de PDF fiel aos contratos da Nuage e disparo do onboarding.',
    whatItDoes: [
      'Puxa serviços, opções e entregáveis de Configurações > Serviços e preços e os dados jurídicos de Clientes.',
      'Gera PDF com o texto integral e fiel dos modelos Agência Nuage, Social Media, Studio Nuage ou unificado (com valores por extenso, foro e testemunhas em branco).',
      'Ativar contrato congela valores, torna o cliente Ativo e cria automaticamente o projeto de Onboarding pelos Checklists configurados.',
    ],
    howToFeed: [
      '1) Selecione o Cliente e adicione os serviços em Serviços contratados (escolha a Opção e ajuste o valor negociado se houver desconto).',
      '2) Em Condições, confira os modelos sugeridos, preencha Plataformas, Responsável pela publicação (Social Media), Quantidade de vídeos e Local de captação (Studio), Data do 1º pagamento, Periodicidade, Portfólio e Foro (padrão São Luís - MA).',
    ],
    howToUse: [
      'Enquanto estiver em Rascunho, baixe o PDF para enviar ao cliente. Quando assinado, clique em Ativar contrato. Para ajustar contratos já ativos, quem tem Financeiro edita condições e o administrador pode usar "Corrigir contrato".',
    ],
  },
  {
    id: 'projetos',
    title: 'Projetos e tarefas',
    route: '/projetos',
    icon: KanbanSquare,
    category: 'Operação',
    summary: 'Execução de demandas da equipe com Kanban, checklists, dependências e recorrência automática.',
    whatItDoes: [
      'Gerencia projetos (incluindo os Onboardings criados ao ativar contratos) e tarefas em Kanban ou lista, com subtarefas, dependências, colaboradores e esforço em horas.',
      'Tarefas com Recorrência (Diária, Semanal ou Mensal) criam automaticamente a próxima ocorrência ao serem concluídas.',
    ],
    howToFeed: [
      'Defina Cliente, Projeto, Responsável, Prazo e Status (as colunas vêm de Configurações > Etapas e status). Para rotinas repetitivas, escolha a frequência no campo Recorrência.',
    ],
    howToUse: [
      'Conclua itens do checklist interno e mova o card para o status final quando terminar. Se houver tarefa dependente bloqueando, o card avisa antes da conclusão.',
    ],
  },
  {
    id: 'conteudo',
    title: 'Conteúdo (Calendário editorial)',
    route: '/conteudo',
    icon: Clapperboard,
    category: 'Operação',
    summary: 'Fluxo de produção editorial com histórico automático e aprovação externa por link.',
    whatItDoes: [
      'Controla cada peça por Cliente, Formato (de Configurações), Data prevista, Responsável, Revisor, legenda/roteiro e links dos arquivos.',
      'Gera Link público de aprovação (/aprovar/:token) para o cliente aprovar ou pedir ajustes sem login.',
    ],
    howToFeed: [
      'Preencha Cliente, Formato, Data prevista, Responsável, Revisor, texto/legenda e os links do material (Drive/preview).',
    ],
    howToUse: [
      'Copie o link público dentro do conteúdo e envie ao cliente. Se ele aprovar ou pedir ajustes, o status muda automaticamente e o responsável recebe uma notificação.',
    ],
  },
  {
    id: 'estrategia',
    title: 'Estratégia',
    route: '/estrategia',
    icon: Compass,
    category: 'Operação',
    summary: 'Planejamentos estratégicos, pilares editoriais e KPIs por cliente.',
    whatItDoes: [
      'Centraliza documentos de estratégia por cliente (objetivo, pilares de conteúdo, canais, métricas/KPIs, links de referência, status e comentários).',
    ],
    howToFeed: [
      'Crie um planejamento para o cliente informando Responsável, período de vigência, pilares e links das apresentações.',
    ],
    howToUse: [
      'Consulte aqui ou pela aba Estratégia dentro do Cliente para alinhar equipe criativa e tráfego antes de planejar o mês.',
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    route: '/financeiro',
    icon: Wallet,
    category: 'Gestão',
    summary: 'Entradas dos contratos, contas a pagar da agência, histórico CSV e extrato PDF.',
    whatItDoes: [
      'Aba Mês a mês: gera os recebimentos mensais dos contratos ativos, registra baixas e emite Extrato PDF do cliente.',
      'Aba Contas a pagar: controla despesas categorizadas (de Configurações > Etapas e status > Categorias de contas a pagar), com opção de repetição mensal.',
      'Aba Histórico: consolida movimentações pagas e exporta CSV.',
    ],
    howToFeed: [
      'No início do mês, clique em Gerar recebimentos do mês em Mês a mês para lançar as mensalidades previstas dos contratos ativos.',
      'Lance contas fixas/variáveis em Contas a pagar informando categoria, vencimento e valor; informe a data de pagamento somente quando for efetivamente pago.',
    ],
    howToUse: [
      'Use o seletor de mês e os filtros por status/categoria para acompanhar saldo efetivo, recebidos e títulos em atraso.',
    ],
    tip: 'Pagamentos ou contas com situação "Pago" exigem data de pagamento; títulos em aberto ficam sem data de pagamento.',
  },
  {
    id: 'equipe',
    title: 'Equipe',
    route: '/equipe',
    icon: Contact,
    category: 'Gestão',
    summary: 'Cadastro de pessoas, definição de cargos de acesso e capacidade semanal.',
    whatItDoes: [
      'Lista contatos, cargos e horas semanais dos membros e permite ao administrador criar acessos reais (e-mail, senha/convite e cargo) ou desativar usuários.',
    ],
    howToFeed: [
      'Administradores criam o integrante escolhendo o Cargo (configurado em Configurações > Permissões) e a capacidade em horas por semana.',
    ],
    howToUse: [
      'Mantenha cargos e status ativo atualizados: desativar alguém aqui bloqueia o acesso no sistema imediatamente.',
    ],
    whereUsed: 'Seletores de Responsável, Revisor, Participante e Colaboradores em Comercial, Projetos, Conteúdo, Estratégia e Agenda.',
  },
  {
    id: 'atalhos',
    title: 'Busca global, Notificações e PWA',
    icon: Search,
    category: 'Recursos do sistema',
    summary: 'Recursos presentes no topo de todas as telas para agilizar a rotina.',
    whatItDoes: [
      'Busca global (Ctrl+K ou ⌘K): localiza clientes, leads, projetos, tarefas, conteúdos, estratégias e contratos respeitando suas permissões.',
      'Notificações (Sino): avisa novas atribuições, comentários, respostas de aprovação pública, vencimentos do dia, contas a pagar e fim do prazo mínimo de contratos (suporta Push no aparelho).',
      'Tema claro/escuro no rodapé do menu lateral.',
    ],
    howToFeed: [
      'Alimentados automaticamente pelo uso normal dos módulos.',
    ],
    howToUse: [
      'Use Ctrl+K para navegar sem mouse; no sino, filtre não lidas ou ative notificações push do aparelho.',
    ],
  },
]

const CATEGORIES = ['Todas', 'Configurações na prática', 'Visão geral', 'Relacionamento', 'Operação', 'Gestão', 'Recursos do sistema'] as const

export default function ManualSistema() {
  const { can } = useAuth()
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('Todas')

  const q = query.trim().toLowerCase()
  const visibleSections = useMemo(() => SECTIONS.filter((s) => {
    if (cat !== 'Todas' && s.category !== cat) return false
    if (!q) return true
    const blob = [s.title, s.category, s.summary, ...s.whatItDoes, ...s.howToFeed, ...s.howToUse, s.whereUsed ?? '', s.tip ?? ''].join(' ').toLowerCase()
    return blob.includes(q)
  }), [cat, q])

  const accessiblePaths = useMemo(
    () => new Set(NAV.filter((n) => canAccess(n, can)).map((n) => n.path)),
    [can],
  )

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="panel" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <BookOpen size={20} style={{ color: 'var(--ac)' }} aria-hidden />
          <div>
            <h3 style={{ margin: 0 }}>Manual completo do Na.Nu</h3>
            <p className="mu" style={{ margin: '2px 0 0', fontSize: 13 }}>
              Entenda para que serve cada tela, como configurar corretamente e em qual parte do sistema cada cadastro é usado.
            </p>
          </div>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no manual (ex.: serviços, opção, etapas, checklist, contrato, contas a pagar)…"
            aria-label="Buscar no manual"
            style={{ maxWidth: 460 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={`btn sm ${cat === c ? 'primary' : ''}`} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!q && cat === 'Todas' && (
        <>
          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Layers size={18} style={{ color: 'var(--ac)' }} aria-hidden />
              <h3 style={{ margin: 0 }}>Onde cada aba de Configurações é usada no sistema</h3>
            </div>
            <p className="mu" style={{ margin: '0 0 12px', fontSize: 13 }}>
              As abas de <b>Configurações</b> alimentam os campos, listas e automações de todo o restante do Na.Nu:
            </p>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Aba em Configurações</th>
                    <th>Para que serve</th>
                    <th>Onde aparece / é usada depois</th>
                  </tr>
                </thead>
                <tbody>
                  {CONFIG_CONNECTIONS.map((row) => (
                    <tr key={row.aba}>
                      <td style={{ whiteSpace: 'nowrap' }}><b>{row.aba}</b></td>
                      <td style={{ fontSize: 13 }}>{row.paraQueServe}</td>
                      <td style={{ fontSize: 13 }}>{row.ondeUsado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ac)' }}>
                Ver onde cada uma das 9 listas de "Etapas e status" aparece no sistema
              </summary>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="t">
                  <thead><tr><th>Cadastro em Etapas e status</th><th>Onde aparece na prática</th></tr></thead>
                  <tbody>
                    {ETAPAS_SETS.map((item) => (
                      <tr key={item.grupo}>
                        <td><b>{item.grupo}</b></td>
                        <td style={{ fontSize: 13 }}>{item.onde}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CheckCircle2 size={18} style={{ color: 'var(--ok)' }} aria-hidden />
              <h3 style={{ margin: 0 }}>Ordem recomendada de alimentação do sistema</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
              {SETUP_FLOW.map((item) => (
                <div key={item.step} className="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: 14 }}>
                  <span className="tag soft">{item.place}</span>
                  <b>{item.step}</b>
                  <span className="mu" style={{ fontSize: 13, lineHeight: 1.45 }}>{item.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <ShieldCheck size={20} style={{ color: 'var(--ac)', flexShrink: 0, marginTop: 2 }} aria-hidden />
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <b>Regra de segurança e permissões (RLS):</b> Tudo o que você configura em <b>Configurações &gt; Permissões</b> é validado pelo banco de dados. Quem não tem acesso ao <b>Financeiro</b>, por exemplo, não enxerga valores nem em telas ligadas a ele (preços em Serviços, valores e itens em Contratos, valor estimado em Leads e orçamentos em Campanhas).
            </div>
          </div>
        </>
      )}

      {!visibleSections.length ? (
        <div className="panel">
          <p className="mu" style={{ margin: 0 }}>Nenhum tópico encontrado para "{query}". Tente outro termo ou limpe o filtro.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {visibleSections.map((sec) => {
            const Icon = sec.icon
            const basePath = sec.route?.split('?')[0]
            const canOpen = basePath && accessiblePaths.has(basePath)
            return (
              <section key={sec.id} className="panel" style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="tag soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon aria-hidden />
                      {sec.category}
                    </span>
                    <h3 style={{ margin: 0 }}>{sec.title}</h3>
                  </div>
                  {canOpen && sec.route && (
                    <Link to={sec.route} className="btn sm">Abrir {sec.title.replace('Configurações · ', '')}</Link>
                  )}
                </div>

                <p style={{ margin: 0, fontSize: 14 }}>{sec.summary}</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                  <div>
                    <b style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Para que serve</b>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }} className="mu">
                      {sec.whatItDoes.map((x, idx) => <li key={idx}>{x}</li>)}
                    </ul>
                  </div>
                  <div>
                    <b style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Como alimentar corretamente</b>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }} className="mu">
                      {sec.howToFeed.map((x, idx) => <li key={idx}>{x}</li>)}
                    </ul>
                  </div>
                  <div>
                    <b style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Como usar no dia a dia</b>
                    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }} className="mu">
                      {sec.howToUse.map((x, idx) => <li key={idx}>{x}</li>)}
                    </ul>
                  </div>
                </div>

                {sec.whereUsed && (
                  <p className="money-note" style={{ margin: 0 }}>
                    <b>Onde isso aparece depois:</b> {sec.whereUsed}
                  </p>
                )}

                {sec.tip && (
                  <p className="money-note" style={{ margin: 0 }}>
                    <b>Dica importante:</b> {sec.tip}
                  </p>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
