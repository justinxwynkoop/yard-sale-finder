-- Diagnostic only: dump every policy on storage.objects to the
-- migration log so we can see exactly what's evaluating against
-- INSERT requests. The previous "Anyone can upload to app buckets"
-- policy is permissive and should allow any upload to sale-media /
-- listing-media / avatars, yet the storage service is still
-- returning a 400 RLS rejection -- which can only happen if a
-- RESTRICTIVE policy (or a stricter permissive policy that this
-- one isn't shadowing) is denying.

do $$
declare
  rec record;
begin
  raise notice '=== policies on storage.objects ===';
  for rec in
    select policyname, cmd, permissive, roles, qual::text as using_expr, with_check::text as check_expr
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    order by permissive desc, cmd, policyname
  loop
    raise notice '[%] %  cmd=%  roles=%  USING=%  WITH CHECK=%',
      rec.permissive, rec.policyname, rec.cmd, rec.roles, rec.using_expr, rec.check_expr;
  end loop;
  raise notice '=== end policies ===';
end $$;
