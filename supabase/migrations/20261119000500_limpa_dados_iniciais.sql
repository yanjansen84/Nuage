-- Limpeza de serviços e checklists de exemplo da Nuage
delete from public.checklist_templates;
delete from public.services;
truncate table public.audit_log;
