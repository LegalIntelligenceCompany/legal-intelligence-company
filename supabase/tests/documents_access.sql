-- Teste de integração: executar num projecto Supabase DE TESTE, após 001/002/003.
-- Simula duas empresas, duas contas e um visitante; termina com ROLLBACK.
begin;
select set_config('test.user_a', gen_random_uuid()::text, true);
select set_config('test.user_b', gen_random_uuid()::text, true);
select set_config('test.org_a', gen_random_uuid()::text, true);
select set_config('test.org_b', gen_random_uuid()::text, true);
insert into auth.users(id,email,email_confirmed_at) values
  (current_setting('test.user_a')::uuid, current_setting('test.user_a')||'@example.test', now()),
  (current_setting('test.user_b')::uuid, current_setting('test.user_b')||'@example.test', now());
insert into public.organizations(id,name) values (current_setting('test.org_a')::uuid,'Empresa A'), (current_setting('test.org_b')::uuid,'Empresa B');
insert into public.organization_members values
  (current_setting('test.org_a')::uuid,current_setting('test.user_a')::uuid,'owner'),
  (current_setting('test.org_b')::uuid,current_setting('test.user_b')::uuid,'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user_a'),true);
do $$
declare doc public.contracts;
begin
  doc := public.contract_begin(current_setting('test.org_a')::uuid,'test.pdf',9,'application/pdf');
  perform set_config('test.contract',doc.id::text,true);
  perform set_config('test.path',doc.storage_path,true);
  begin
    perform public.contract_finish(doc.id);
    raise exception 'FAIL: missing object accepted';
  exception when raise_exception then
    if sqlerrm <> 'UPLOAD_INCOMPLETE' then raise; end if;
  end;
  insert into storage.objects(bucket_id,name,metadata) values('contracts',doc.storage_path,'{"size":9,"mimetype":"application/pdf"}');
  perform public.contract_finish(doc.id);
  if (select status from public.contracts where id=doc.id) <> 'uploaded' then raise exception 'FAIL: completion'; end if;
  perform public.contract_finish(doc.id); -- Idempotent recovery.
  begin
    update public.contracts set status='completed' where id=doc.id;
    raise exception 'FAIL: forged analysis status';
  exception when insufficient_privilege then null; end;
  insert into public.policies(organization_id,title,content) values(current_setting('test.org_a')::uuid,'Política A','Pagamento em trinta dias.');
  begin
    insert into public.policies(organization_id,title,content) values(current_setting('test.org_b')::uuid,'Intrusão','Não deve ser permitido.');
    raise exception 'FAIL: cross-tenant policy insert';
  exception when insufficient_privilege then null; end;
  begin
    perform public.contract_begin(current_setting('test.org_b')::uuid,'bad.pdf',9,'application/pdf');
    raise exception 'FAIL: cross-tenant begin';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub',current_setting('test.user_b'),true);
do $$
begin
  if exists(select 1 from public.contracts where id=current_setting('test.contract')::uuid) then raise exception 'FAIL: cross-tenant document read'; end if;
  if exists(select 1 from public.policies where organization_id=current_setting('test.org_a')::uuid) then raise exception 'FAIL: cross-tenant policy read'; end if;
  if exists(select 1 from storage.objects where name=current_setting('test.path')) then raise exception 'FAIL: cross-tenant file read'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('contracts',current_setting('test.org_a')||'/forged.pdf');
    raise exception 'FAIL: arbitrary file upload';
  exception when insufficient_privilege then null; end;
  begin
    perform public.contract_finish(current_setting('test.contract')::uuid);
    raise exception 'FAIL: cross-tenant finish';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$
begin
  begin
    perform public.contract_begin(current_setting('test.org_a')::uuid,'test.pdf',9,'application/pdf');
    raise exception 'FAIL: anonymous upload';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
