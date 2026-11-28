# Na.Nu · Plano de Implementação e Tasks Pendentes

Este documento consolida tudo o que está pendente de desenvolvimento no sistema **Na.Nu** (Fase 2, recursos parcialmente modelados e ajustes de consistência), seguindo a arquitetura do projeto: **permissões e integridade no banco (RLS/triggers)**, **paridade com o modo demonstração (`demoDb.ts`)** e **testes automatizados em `supabase/tests/rls.test.mjs`**.

---

## Como usar este roteiro

- **Ordem sugerida**: começar pelos **ajustes rápidos e dívida técnica** (Etapa 1), avançar para **automação e ficha do cliente** (Etapas 2 e 3), **aprovação externa de conteúdo** (Etapa 4), **módulo Estratégia** (Etapa 5), **busca global e exportação CSV** (Etapa 6) e **notificações Web Push / lembretes extras** (Etapa 7).
- **Regra de entrega por item**:
  1. Toda nova tabela/coluna/função no Supabase deve entrar em uma nova migration em `supabase/migrations/` (e ser consolidada em `supabase/schema_completo.sql`).
  2. Toda nova regra de acesso ou integridade deve ganhar casos de teste em `supabase/tests/rls.test.mjs`.
  3. Toda mudança de schema/comportamento deve ser espelhada em `src/data/types.ts`, `src/data/demoDb.ts` e `src/lib/demo.ts`.

---

## Etapa 1 · Ajustes de Consistência e Documentação

Pequenas lacunas identificadas no código atual que preparam terreno para a Fase 2.

- [x] **1.1. Alinhar UX de contratos firmados sem permissão financeira**
  - **Arquivo**: `src/pages/Contratos.tsx` (`ContratoEditor`)
  - **Problema**: Quando `!draft && !fixing` e o usuário possui `contratos: write` sem `financeiro: write`, os campos de condições comerciais continuam habilitados na tela, mas o trigger `guard_contract_status()` bloqueia a gravação no banco.
  - **Task**: Desabilitar os campos comerciais (`start_date`, `min_months`, `renewal`, `notice_days`, `due_day`, `payment_method`, `installments`, `payment_terms`) quando `!draft && !fixing && !can('financeiro', 'write') && !admin`, mantendo apenas `notes` editável (como o banco permite) e exibindo dica explicativa.

- [x] **1.2. Garantir integridade de pagamento quitado em `payments`**
  - **Arquivos**: `supabase/migrations/20261119001400_pagamentos_e_lembretes_contratos.sql`, `supabase/schema_completo.sql`, `supabase/tests/rls.test.mjs`
  - **Task**: Adicionar `constraint payments_paid_at_check check ((status = 'pago') = (paid_at is not null))` (mesma garantia já aplicada em `bills` na migration `20261119001100_contas_a_pagar.sql`), saneando eventuais linhas legadas antes de aplicar a constraint.

- [x] **1.3. Padronizar máscara inicial de telefone em Clientes**
  - **Arquivo**: `src/pages/Clientes.tsx` (`ClientForm`)
  - **Task**: Inicializar `phone: maskPhone(client?.phone ?? '')` no estado do formulário (alinhado ao `LeadForm` em `src/pages/Comercial.tsx`).

- [x] **1.4. Atualizar o `README.md`**
  - **Arquivo**: `README.md`
  - **Task**: Atualizar a lista de migrations da seção de configuração (para todas as migrations + menção a `supabase/schema_completo.sql`) e atualizar o Roadmap separando o que já foi entregue (`Conteúdo`, `Contas a pagar`, `Notificações in-app`) do que permanece na Fase 2.

- [x] **1.5. Robustez de Contas a pagar e feedback de erro acima de modais**
  - **Arquivos**: `src/ui/Feedback.tsx`, `src/styles/global.css`, `src/data/db.ts`, `src/pages/ContasPagar.tsx`, `src/pages/Financeiro.tsx`
  - **Task**: Exibir toasts na Top Layer (`popover="manual"`) para que erros não fiquem atrás de `<dialog>`, traduzir erros de tabela/schema ausente (`42P01`/`PGRST205`), exibir erro de consulta em `Contas a pagar` e `Financeiro`, sincronizar a aba `?aba=pagar` via URL, adicionar estado `busy` e fallback de `UUID` em `BillForm`.

---

## Etapa 2 · Tarefas Recorrentes Automáticas

Hoje `tasks.recurrence` (`{ freq: 'daily' | 'weekly' | 'monthly' }`) já é salvo no banco e exibido no formulário (`src/pages/Projetos.tsx`), mas não gera novas ocorrências.

- [x] **2.1. Definir regra e campos de recorrência no banco**
  - **Arquivos**: `supabase/migrations/20261119001500_tarefas_recorrentes.sql`, `supabase/schema_completo.sql`, `src/data/types.ts`
  - **Task**:
    - Adicionar coluna `recurrence_source_id uuid references public.tasks(id) on delete set null` (ou metadado equivalente) para rastrear/evitar duplicidade de ocorrências geradas.
    - Criar índice parcial em `tasks` para tarefas recorrentes abertas/recém-concluídas.

- [x] **2.2. Criar trigger/função de geração automática ao concluir tarefa**
  - **Arquivos**: `supabase/migrations/20261119001500_tarefas_recorrentes.sql`, `supabase/tests/rls.test.mjs`
  - **Task**:
    - Criar trigger `AFTER UPDATE` em `public.tasks`: quando uma tarefa raiz (`parent_id is null`) com `recurrence is not null` passar de aberta para concluída (`old.done_at is null and new.done_at is not null`), gerar a próxima tarefa com `start_date` e `due_date` deslocados conforme `freq` (`+1 day`, `+7 days` ou `+1 month`), copiando `project_id`, `client_id`, `title`, `description`, `owner_id`, `priority`, `effort_hours`, `recurrence`, status inicial de `task_status`, colaboradores (`task_collaborators`) e itens de checklist (`task_checklist` com `done = false`).
    - Garantir idempotência (não duplicar caso a tarefa seja reaberta e concluída novamente se já existir próxima ocorrência).
    - Cobrir em `supabase/tests/rls.test.mjs`.

- [x] **2.3. Espelhar recorrência no modo demo e atualizar UI**
  - **Arquivos**: `src/data/demoDb.ts`, `src/pages/Projetos.tsx`
  - **Task**:
    - Replicar a criação da próxima ocorrência em `demoDb.ts` ao concluir tarefa recorrente.
    - Remover o hint *"entra na Fase 2"* em `src/pages/Projetos.tsx` (`TaskForm`) e informar que a próxima ocorrência é criada automaticamente ao concluir.

---

## Etapa 3 · Ficha do Cliente Completa (Abas da Fase 2)

Em `src/pages/Clientes.tsx` (`ClienteDetalhe`), estão previstas as abas **Briefing, Estratégia, Produções, Campanhas e Reuniões**.

- [x] **3.1. Aba `Produções` na ficha do cliente (reaproveitamento)**
  - **Arquivo**: `src/pages/Clientes.tsx`
  - **Task**: Adicionar aba `Produções` (visível quando `can('producao')`), consultando `contents` filtrados por `client_id`, exibindo status/data de publicação e abrindo o `ContentForm` (reaproveitado de `src/pages/Conteudo.tsx`) com `defaultClient={c.id}` e botão "Novo conteúdo".

- [x] **3.2. Aba `Reuniões` / `Agenda` na ficha do cliente (reaproveitamento)**
  - **Arquivo**: `src/pages/Clientes.tsx`
  - **Task**: Adicionar aba `Reuniões` consultando `events` filtrados por `client_id`, ordenados por data, permitindo abrir/criar compromisso via `EventForm` (de `src/pages/Agenda.tsx`) com `defaultClient={c.id}`.

- [x] **3.3. Modelagem e aba de `Briefing` estruturado do cliente**
  - **Arquivos**: `supabase/migrations/20261119001600_briefing_campanhas_estrategia.sql`, `supabase/schema_completo.sql`, `src/data/types.ts`, `src/data/demoDb.ts`, `src/lib/demo.ts`, `src/pages/Clientes.tsx`, `supabase/tests/rls.test.mjs`
  - **Task**:
    - Criar tabela `public.client_briefings` (`client_id` PK/FK, público-alvo, tom de voz, diferenciais, concorrentes, referências, links de identidade visual/drive, restrições, `updated_at`, `updated_by`) com trigger de auditoria (`audit()`) e RLS vinculada ao módulo `clientes`.
    - Criar aba `Briefing` em `ClienteDetalhe` com modo visualização/edição (`can('clientes', 'write')`).
    - Adicionar testes em `rls.test.mjs` e seed no demo.

- [x] **3.4. Modelagem e aba de `Campanhas` (tráfego pago e ações)**
  - **Arquivos**: `supabase/migrations/20261119001600_briefing_campanhas_estrategia.sql`, `supabase/schema_completo.sql`, `src/data/types.ts`, `src/data/demoDb.ts`, `src/lib/demo.ts`, `src/pages/Clientes.tsx`, `supabase/tests/rls.test.mjs`
  - **Task**:
    - Criar tabela `public.campaigns` e tabela financeira separada `public.campaign_budgets` (`campaign_id`, `monthly_budget`, `spent_amount`) legível/editável apenas por quem tem módulo `financeiro` (mantendo o padrão de isolamento financeiro do sistema).
    - Criar triggers de auditoria e políticas RLS.
    - Criar aba `Campanhas` em `ClienteDetalhe` com listagem e modal de criação/edição.
    - Adicionar testes em `rls.test.mjs` e seed no demo.

---

## Etapa 4 · Aprovação Externa de Conteúdo por Link

Permitir que o cliente aprove ou solicite ajustes em conteúdos (`Aguardando aprovação`) sem precisar de conta no sistema.

- [x] **4.1. Schema, tokens públicos e RPCs seguras**
  - **Arquivos**: `supabase/migrations/20261119001700_aprovacao_publica_e_push.sql`, `supabase/schema_completo.sql`, `supabase/tests/rls.test.mjs`
  - **Task**:
    - Criar tabelas `public.content_approval_links` e `public.content_approvals`.
    - Criar RPCs `SECURITY DEFINER` públicas (`get_content_for_approval` / `submit_content_approval`) notificadoras e seguras.
    - Garantir no `rls.test.mjs` que `anon` continua sem `SELECT` direto em `contents` e não consegue enumerar tokens nem forjar aprovação sem token válido.

- [x] **4.2. Página pública de aprovação e geração de link no modal de Conteúdo**
  - **Arquivos**: `src/App.tsx`, `src/pages/AprovacaoPublica.tsx`, `src/pages/Conteudo.tsx`, `src/data/db.ts`, `src/data/demoDb.ts`
  - **Task**:
    - Expor rota pública `/aprovar/:token` em `App.tsx` **antes** do bloqueio de `signed-out`.
    - Implementar `AprovacaoPublica.tsx` com botões **Aprovar conteúdo** e **Solicitar ajustes**.
    - No `ContentForm` (`src/pages/Conteudo.tsx`), adicionar seção de criação/cópia/revogação de link e histórico de respostas.
    - Atualizar `src/components/Notifications.tsx` para tratar `content_approved` e `content_changes`.

---

## Etapa 5 · Módulo Estratégia (`estrategia`)

Ativar o módulo já previsto na matriz de permissões (`modules.key = 'estrategia'`).

- [x] **5.1. Modelagem de banco e RLS**
  - **Arquivos**: `supabase/migrations/20261119001600_briefing_campanhas_estrategia.sql`, `supabase/schema_completo.sql`, `src/data/types.ts`, `supabase/tests/rls.test.mjs`
  - **Task**:
    - Criar tabela `public.strategies` com RLS `own`/`all`, comentários (`comments.entity` incluindo `'strategy'`), notificação e auditoria (`audit()`).
    - Testar permissões `none`/`own`/`all` em `rls.test.mjs`.

- [x] **5.2. Tela dedicada e aba na ficha do Cliente**
  - **Arquivos**: `src/pages/Estrategia.tsx`, `src/routes.ts`, `src/App.tsx`, `src/pages/Clientes.tsx`, `src/pages/Configuracoes.tsx`, `src/data/demoDb.ts`, `src/lib/demo.ts`
  - **Task**:
    - Adicionar `/estrategia` em `NAV` (`src/routes.ts`) e rota com `Guard` em `src/App.tsx`.
    - Criar `src/pages/Estrategia.tsx` e integrar aba `Estratégia` em `ClienteDetalhe`.
    - Remover o sufixo `· Fase 2` na linha do módulo em `src/pages/Configuracoes.tsx`.

---

## Etapa 6 · Busca Global e Exportação CSV

- [x] **6.1. Busca global no `AppShell`**
  - **Arquivos**: `src/components/GlobalSearch.tsx`, `src/components/AppShell.tsx`, `src/styles/global.css`
  - **Task**:
    - Gatilho no topo/menu lateral com atalho `Ctrl+K` / `Cmd+K` buscando apenas nos módulos autorizados por `can(...)`.

- [x] **6.2. Utilitário e botões de exportação CSV**
  - **Arquivos**: `src/lib/csv.ts`, `src/pages/Financeiro.tsx`, `src/pages/ContasPagar.tsx`, `src/pages/Comercial.tsx`, `src/pages/Clientes.tsx`, `src/pages/Projetos.tsx`, `src/pages/Configuracoes.tsx`
  - **Task**:
    - Criar `downloadCsv` com UTF-8 BOM e mitigação de CSV/Formula Injection, adicionando botões **Exportar CSV** respeitando filtros e permissões.

---

## Etapa 7 · Notificações Avançadas (Web Push e Contratos)

- [x] **7.1. Lembrete automático de fim de prazo mínimo / aviso prévio de contratos**
  - **Arquivos**: `supabase/migrations/20261119001400_pagamentos_e_lembretes_contratos.sql`, `supabase/schema_completo.sql`, `src/components/Notifications.tsx`, `supabase/tests/rls.test.mjs`
  - **Task**:
    - Estender `generate_my_notifications()` (`20261119001200_notificacoes.sql`) para gerar aviso `contract_ending` (deduplicado por contrato e janela) para usuários com acesso a `contratos` quando um contrato `ativo` estiver dentro do prazo de aviso prévio ou a <= 30 dias do fim do prazo mínimo.
    - Mapear `contract_ending` em `KINDS` de `src/components/Notifications.tsx`.

- [x] **7.2. Web Push real em segundo plano (PWA fechado)**
  - **Arquivos**: `supabase/migrations/20261119001700_aprovacao_publica_e_push.sql`, `supabase/functions/send-push/index.ts`, `public/sw-notifications.js`, `src/components/Notifications.tsx`, `.env.example`, `README.md`
  - **Task**:
    - Criar tabela `public.push_subscriptions` com RLS restrita ao próprio `auth.uid()`.
    - Sincronizar `pushManager.subscribe` com `VITE_VAPID_PUBLIC_KEY` em `Notifications.tsx`.
    - Tratar evento `push` no `public/sw-notifications.js` e criar Edge Function `send-push`.

---

## Checklist de Verificação (após cada etapa)

```powershell
npm install
npm run lint
npm run build
npm run test:db
npm run dev:demo
```

- Confirmar que `npm run build` conclui a etapa `scripts/vercel-dist.mjs` sem quebra de hash CSP em `vercel.json`.
- Confirmar que todos os cenários em `supabase/tests/rls.test.mjs` passam sem regressão de RLS ou escalonamento de privilégio.
- Testar manualmente no `npm run dev:demo` alternando o seletor **Ver como** entre Administrador e cargos restritos.
