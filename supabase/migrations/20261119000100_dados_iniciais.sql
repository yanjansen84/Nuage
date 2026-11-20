-- =====================================================================
-- Na.Nu · Dados iniciais (configuração, não dados fictícios)
-- Tudo aqui é editável depois pela área de Configurações.
-- =====================================================================

-- O sistema começa só com o administrador, com acesso total.
-- Os demais cargos são criados pelo administrador em Configurações → Permissões
-- e nascem sem nenhum acesso (ver 20261119000200_cargos_editaveis.sql).
insert into public.roles (key, name, sort) values
  ('ceo', 'Administrador / CEO / Gestor', 1);

insert into public.modules (key, name, sort) values
  ('dashboard',     'Início', 1),
  ('crm',           'Comercial', 2),
  ('clientes',      'Clientes', 3),
  ('contratos',     'Contratos', 4),
  ('financeiro',    'Financeiro', 5),
  ('projetos',      'Projetos e tarefas', 6),
  ('producao',      'Produção', 7),
  ('estrategia',    'Estratégia', 8),
  ('equipe',        'Equipe', 9),
  ('configuracoes', 'Configurações', 10);

insert into public.role_permissions (role, module, scope, can_write, can_delete)
select 'ceo', m.key, 'all', true, true from public.modules m;

-- Etapas e status (editáveis)
insert into public.options (set_key, label, color, sort, is_final) values
  ('lead_stage','Lead recebido','#8e6bd8',1,false),
  ('lead_stage','Primeiro contato','#2f80ed',2,false),
  ('lead_stage','Qualificação','#0e9aa7',3,false),
  ('lead_stage','Reunião','#b97d00',4,false),
  ('lead_stage','Diagnóstico','#ea5c2a',5,false),
  ('lead_stage','Proposta enviada','#d6336c',6,false),
  ('lead_stage','Negociação','#5b4bdb',7,false),
  ('lead_stage','Fechado','#2e9e6a',8,true),
  ('lead_stage','Perdido','#55555f',9,true),

  ('lead_origin','Indicação',null,1,false),
  ('lead_origin','Instagram',null,2,false),
  ('lead_origin','Site',null,3,false),
  ('lead_origin','WhatsApp',null,4,false),
  ('lead_origin','Evento',null,5,false),
  ('lead_origin','Outro',null,6,false),

  ('client_status','Em negociação','#2f80ed',1,false),
  ('client_status','Em onboarding','#b97d00',2,false),
  ('client_status','Ativo','#2e9e6a',3,false),
  ('client_status','Pausado','#55555f',4,false),
  ('client_status','Encerrado','#55555f',5,true),
  ('client_status','Inadimplente','#c0392b',6,false),

  ('project_status','Planejado','#2f80ed',1,false),
  ('project_status','Em andamento','#ea5c2a',2,false),
  ('project_status','Pausado','#55555f',3,false),
  ('project_status','Concluído','#2e9e6a',4,true),
  ('project_status','Cancelado','#55555f',5,true),

  ('task_status','Pendente','#ea5c2a',1,false),
  ('task_status','Em andamento','#2f80ed',2,false),
  ('task_status','Bloqueada','#c0392b',3,false),
  ('task_status','Concluída','#2e9e6a',4,true),

  ('content_format','Reels',null,1,false),
  ('content_format','Stories',null,2,false),
  ('content_format','Carrossel',null,3,false),
  ('content_format','Estático',null,4,false),
  ('content_format','Fotografia',null,5,false),
  ('content_format','Vídeo institucional',null,6,false),
  ('content_format','Outro',null,7,false);

-- Catálogo de serviços (especificação 3.1)
insert into public.services (code, name, description, category, billing_type, min_months, delivery_days, delivery_note, deliverables, sort) values
  ('ag','Nuage Agência','Gestão estratégica da comunicação','Agência','recorrente',6,null,null, array[
    'Gestão completa de redes sociais','Planejamento estratégico de conteúdo','Planejamento de Stories',
    'Gestão de comunidade','Captação, roteirização, direção e edição de fotos e vídeos',
    'Impulsionamento e gestão de tráfego pago (Meta Ads)','Análise de resultados e envio de relatórios',
    'Posicionamento de marca','Avaliação e otimização do atendimento','Planejamento e execução de campanhas e eventos',
    'Estruturação de processos de comunicação da marca','Criação de manuais e documentos operacionais',
    'Acompanhamento estratégico e consultoria'], 1),
  ('sm','Nuage Social Media','Gestão da presença digital','Social Media','recorrente',6,null,null, array[
    'Gestão completa de redes sociais','Análise de perfil e diagnóstico de presença digital',
    'Planejamento estratégico de conteúdo','Planejamento de Stories','Gestão de comunidade (responder comentários)',
    'Captação, roteirização, direção e edição de fotos e vídeos'], 2),
  ('st','Nuage Studio','Produção audiovisual','Studio','pacote',null,2,'Até 48 horas após a captação', array[
    'Roteiros','Direção criativa e audiovisual','Captação de vídeos','Edição e finalização',
    'Vídeos de até 1min30','Até uma captação por semana, conforme contratação'], 3);

insert into public.service_offers (service_id, label, quantity, sort)
select s.id, o.label, o.qty, o.sort
from public.services s
join (values ('ag','Mensal',null::int,1),('sm','Mensal',null,1),
             ('st','1 vídeo',1,1),('st','5 vídeos',5,2),('st','8 vídeos',8,3),('st','12 vídeos',12,4)
     ) as o(code,label,qty,sort) on o.code = s.code;

insert into public.offer_prices (offer_id, price)
select o.id, p.price
from public.service_offers o
join public.services s on s.id = o.service_id
join (values ('ag','Mensal',2500.00),('sm','Mensal',1500.00),
             ('st','1 vídeo',350.00),('st','5 vídeos',1200.00),('st','8 vídeos',2000.00),('st','12 vídeos',3000.00)
     ) as p(code,label,price) on p.code = s.code and p.label = o.label;

-- Checklist de onboarding (vale para todo contrato ativado)
with t as (
  insert into public.checklist_templates (service_id, name) values (null, 'Onboarding padrão') returning id
)
insert into public.checklist_template_items (template_id, title, sort, due_offset_days)
select t.id, i.title, i.sort, i.d from t,
(values ('Cadastro completo',1,1),('Contrato',2,2),('Cadastro financeiro',3,2),('Briefing',4,5),
        ('Reunião inicial',5,5),('Coleta de identidade visual',6,7),('Acesso aos canais necessários',7,7),
        ('Diagnóstico',8,10),('Planejamento inicial',9,14),('Aprovação do planejamento',10,18),
        ('Início da operação',11,21)) as i(title,sort,d);
