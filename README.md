# Na.Nu

Sistema de gestão da Nuage. React + Vite + TypeScript no front, Supabase (Postgres + Auth) no back, deploy na Vercel.

## Estrutura

```
src/
  lib/supabase.ts      cliente Supabase ("Lembrar meu acesso" troca localStorage/sessionStorage)
  lib/auth.tsx         sessão, perfil e permissões do usuário (can / scope)
  components/AppShell  cabeçalho, faixa e menu filtrado por permissão
  pages/               Login, DefinirSenha (senha provisória/recuperação), Início, estados
  routes.tsx           módulos do menu
  styles/              tokens e componentes visuais (portados do protótipo do cliente)
supabase/
  migrations/          schema, RLS e dados iniciais (rodar em ordem)
  functions/create-user  criação de usuários com cargo e senha provisória
  tests/rls.test.mjs   testa schema e permissões num Postgres em memória
```

## Segurança (resumo)

- Toda permissão é aplicada no **banco** via RLS. O menu só esconde o que o banco já nega.
- Matriz de acesso em `role_permissions` (cargo × módulo) com ajuste por pessoa em `user_permissions`.
  Escopo: `none` (restrito), `own` (só registros atribuídos), `all`.
- Valores financeiros ficam em tabelas próprias (`offer_prices`, `lead_values`, `contract_items`, `payments`),
  legíveis apenas por quem tem o módulo Financeiro.
- Contrato guarda cópia do preço negociado: mudar o catálogo não altera contratos firmados.
- Auditoria automática (`audit_log`) em criação, edição e exclusão. Só administradores leem.
- O cargo de um usuário só pode ser definido pelo servidor (app_metadata) ou por um administrador.

## Configuração (uma vez)

### 1. Supabase

1. **SQL Editor** → rode, nesta ordem, o conteúdo de:
   - `supabase/migrations/20261119000000_fundacao.sql`
   - `supabase/migrations/20261119000100_dados_iniciais.sql`
   - `supabase/migrations/20261119000200_cargos_editaveis.sql`
   - `supabase/migrations/20261119000300_conteudos.sql`

   (ou, com a CLI: `npx supabase link --project-ref <ref>` e `npx supabase db push`)
2. **Authentication → Sign In / Providers**: desative *Allow new users to sign up*
   (só entra quem for cadastrado por um administrador).
3. **Authentication → URL Configuration**: em *Site URL* coloque a URL da Vercel e, em
   *Redirect URLs*, adicione a URL da Vercel e `http://localhost:5173`.
4. **Primeiro usuário (CEO)**: *Authentication → Users → Add user → Create new user*, com e-mail e senha,
   marcando *Auto Confirm User*. O primeiro usuário criado vira CEO automaticamente.
5. **Função de criação de usuários** (o admin cria a conta e recebe uma senha provisória;
   a pessoa troca a senha no primeiro acesso). Defina as origens do app e publique:
   ```
   npx supabase secrets set ALLOWED_ORIGIN=https://seu-dominio --project-ref <ref>
   npx supabase functions deploy create-user --project-ref <ref>
   ```

### 2. Local

```
cp .env.example .env.local   # preencha URL e chave anon (Project Settings → API)
npm install
npm run dev
```

`npm run dev:demo` abre as telas sem banco (só visual).
`npm run test:db` valida o schema e as permissões.

### 3. Vercel

1. Importe o repositório na Vercel (a raiz do repositório já é o projeto). O `vercel.json` configura build e rotas.
2. Em *Settings → Environment Variables*, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   para Production e Preview.
3. Deploy.

> Nunca coloque a chave `service_role` no front nem na Vercel. Ela só existe dentro das funções do Supabase.

## Roadmap da Fase 1

- [x] Fundação: schema, RLS, auditoria, catálogo, login, menu por permissão
- [x] Início: indicadores, saúde financeira, pendências, entregas da semana, carga da equipe
- [x] Comercial (CRM): funil kanban/lista, valor estimado protegido, conversão em cliente
- [x] Clientes: cartões e página central (visão geral, contratos, projetos, comentários)
- [x] Contratos: itens do catálogo com preço negociado, condições, ativação (gera onboarding)
- [x] Financeiro: contratado / recebido / previsto separados, vencimentos, atrasos, fim de prazo
- [x] Projetos e tarefas: lista e kanban, checklist, subtarefas, colaboradores, dependências, comentários
- [x] Equipe: crachás, contatos protegidos, carga x capacidade
- [x] Configurações: usuários (criação com senha provisória), permissões por cargo e por pessoa, serviços e preços,
      etapas e status, checklists de onboarding, auditoria

Fica para a Fase 2 (especificação seção 12): produção de conteúdo e aprovação por link, estratégia,
notificações automáticas, tarefas recorrentes automáticas, busca global, exportação CSV.

## Modo demonstração

`npm run dev:demo` abre o sistema sem banco, com dados de exemplo e o seletor **Ver como** para trocar de cargo.
O demo aplica as mesmas regras de acesso do banco (src/data/demoDb.ts) e guarda as alterações só na aba aberta.
