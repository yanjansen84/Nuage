-- =====================================================================
-- Na.Nu · Permissões do papel service_role
-- Projetos Supabase novos não concedem mais acesso automático às tabelas
-- para os papéis da API. A migration 400 liberou apenas anon/authenticated,
-- e o service_role (usado pela função create-user com a chave de serviço)
-- ficou sem SELECT/UPDATE: a leitura do cargo voltava vazia e a criação de
-- usuário falhava com "Cargo informado não existe".
-- O service_role ignora RLS por definição; a chave fica só nos secrets das
-- Edge Functions, nunca no frontend.
-- =====================================================================

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
