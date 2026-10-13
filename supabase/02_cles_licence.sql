-- =====================================================================
--  Gestion RH & Paie — clés de licence (activation par poste, comme Sage)
--  À exécuter une fois dans Supabase › SQL Editor, APRÈS schema.sql.
--  Peut être relancé sans risque.
--
--  Principe :
--   * chaque entreprise reçoit une clé (ex. RHP-7K3F-Q9XM-2B8D-W4TN) ;
--   * sur chaque ordinateur, le client saisit la clé : le poste est activé
--     sans adresse e-mail (compte anonyme Supabase lié à l'entreprise) ;
--   * le nombre de postes est limité par la licence (max_utilisateurs) ;
--   * la date de fin de licence reste contrôlée à chaque ouverture.
--  Prérequis : Authentication › Sign In / Providers › « Allow anonymous sign-ins » activé.
-- =====================================================================

alter table public.organisations add column if not exists cle text;
create unique index if not exists organisations_cle_idx on public.organisations (cle);
alter table public.membres add column if not exists poste boolean not null default false;

-- Clé aléatoire : 16 caractères sans 0/O/1/I/L pour éviter les confusions.
create or replace function public._nouvelle_cle() returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  s text := '';
  c text;
  i int;
begin
  loop
    s := '';
    for i in 0..15 loop
      s := s || substr(alpha, (get_byte(b, i + (case when i >= 6 then 2 else 0 end)) % 31) + 1, 1);
      if i in (3, 7, 11) then s := s || '-'; end if;
    end loop;
    c := 'RHP-' || s;
    exit when not exists (select 1 from public.organisations where cle = c);
    b := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  end loop;
  return c;
end $$;

update public.organisations set cle = public._nouvelle_cle() where cle is null;
alter table public.organisations alter column cle set default public._nouvelle_cle();

create or replace function public._norm_cle(p text) returns text
language sql immutable as $$
  select 'RHP-' || regexp_replace(
           regexp_replace(upper(regexp_replace(coalesce(p, ''), '^\s*RHP', '', 'i')), '[^A-Z0-9]', '', 'g'),
           '^(.{4})(.{4})(.{4})(.{4})$', '\1-\2-\3-\4');
$$;

create table if not exists public.essais_cle (
  user_id uuid not null,
  le      timestamptz not null default now()
);
create index if not exists essais_cle_idx on public.essais_cle (user_id, le);
alter table public.essais_cle enable row level security;
revoke all on public.essais_cle from anon, authenticated;

-- Activation d'un poste avec la clé de licence.
-- Les refus sont renvoyés (et non levés) pour que la tentative reste comptée.
create or replace function public.activer_cle(p_cle text, p_poste text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u  uuid := public._uid();
  o  public.organisations;
  nb int;
  nom text := left(coalesce(nullif(trim(p_poste), ''), 'Poste'), 60);
begin
  -- 10 tentatives par heure et par poste, pour empêcher d'essayer des clés au hasard.
  if (select count(*) from public.essais_cle where user_id = u and le > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'erreur', 'TROP_DE_TENTATIVES');
  end if;
  insert into public.essais_cle (user_id) values (u);
  select * into o from public.organisations where cle = public._norm_cle(p_cle);
  if not found then return jsonb_build_object('ok', false, 'erreur', 'CLE_INVALIDE'); end if;
  if not public._licence_ok(o.id) then return jsonb_build_object('ok', false, 'erreur', 'LICENCE_EXPIREE', 'nom', o.nom); end if;
  if exists (select 1 from public.membres where org_id = o.id and user_id = u) then
    return jsonb_build_object('ok', true, 'id', o.id, 'nom', o.nom);
  end if;
  select (select count(*) from public.membres where org_id = o.id)
       + (select count(*) from public.invitations where org_id = o.id) into nb;
  if nb >= o.max_utilisateurs then
    return jsonb_build_object('ok', false, 'erreur', 'MAX_POSTES', 'nom', o.nom, 'max', o.max_utilisateurs);
  end if;
  insert into public.membres (org_id, user_id, email, role, poste) values (o.id, u, nom, 'admin', true);
  return jsonb_build_object('ok', true, 'id', o.id, 'nom', o.nom);
end $$;

-- Libérer la licence de ce poste (désactivation).
create or replace function public.liberer_poste(o uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := public._uid();
begin
  if (select role from public.membres where org_id = o and user_id = u) = 'admin'
     and (select count(*) from public.membres where org_id = o and role = 'admin') = 1
     and (select count(*) from public.membres where org_id = o) > 1 then
    raise exception 'DERNIER_ADMIN';
  end if;
  delete from public.membres where org_id = o and user_id = u;
  delete from public.essais_cle where le < now() - interval '1 day';
end $$;

-- Utilisateurs / postes de l'entreprise (avec l'indication « poste »).
create or replace function public.liste_membres(o uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_admin(o);
  return jsonb_build_object(
    'max', (select max_utilisateurs from public.organisations where id = o),
    'cle', (select cle from public.organisations where id = o),
    'membres', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', m.email, 'role', m.role, 'poste', m.poste,
                 'moi', m.user_id = auth.uid(), 'ajoute_le', m.ajoute_le) order by m.poste, m.email)
               from public.membres m where m.org_id = o), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'cree_le', i.cree_le) order by i.email)
               from public.invitations i where i.org_id = o), '[]'::jsonb));
end $$;

-- Changement de rôle d'un membre (utile pour les postes, qui n'ont pas d'e-mail).
create or replace function public.changer_role(o uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_admin(o);
  if p_role not in ('admin', 'gestionnaire', 'lecture') then raise exception 'ROLE_INVALIDE'; end if;
  if p_role <> 'admin' and (select role from public.membres where org_id = o and user_id = p_user) = 'admin'
     and (select count(*) from public.membres where org_id = o and role = 'admin') = 1 then
    raise exception 'DERNIER_ADMIN';
  end if;
  update public.membres set role = p_role where org_id = o and user_id = p_user;
end $$;

-- Console de l'éditeur : avec la clé et le détail des postes.
create or replace function public.editeur_organisations() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_editeur();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'nom', o.nom, 'cle', o.cle, 'licence_debut', o.licence_debut, 'licence_fin', o.licence_fin,
      'max_utilisateurs', o.max_utilisateurs, 'actif', o.actif, 'essai', o.essai, 'notes', o.notes,
      'cree_le', o.cree_le, 'licence_ok', public._licence_ok(o.id),
      'nb_membres', (select count(*) from public.membres m where m.org_id = o.id),
      'postes', (select string_agg(m.email, ', ' order by m.email) from public.membres m where m.org_id = o.id and m.poste),
      'admins', (select string_agg(m.email, ', ' order by m.email) from public.membres m where m.org_id = o.id and m.role = 'admin' and not m.poste),
      'invitations', (select string_agg(i.email, ', ' order by i.email) from public.invitations i where i.org_id = o.id),
      'maj_le', (select d.maj_le from public.donnees d where d.org_id = o.id),
      'salaries', (select coalesce(jsonb_array_length(d.contenu -> 'emps'), 0) from public.donnees d where d.org_id = o.id)
    ) order by o.nom) from public.organisations o), '[]'::jsonb);
end $$;

-- Création : l'e-mail de l'administrateur devient facultatif ; la clé est renvoyée.
create or replace function public.editeur_creer_organisation(p_nom text, p_email_admin text, p_debut date, p_fin date, p_max int, p_notes text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare o uuid; st text; k text;
begin
  perform public._exiger_editeur();
  if coalesce(trim(p_nom), '') = '' then raise exception 'NOM_OBLIGATOIRE'; end if;
  if p_fin is null or p_fin < coalesce(p_debut, current_date) then raise exception 'DATES_INVALIDES'; end if;
  insert into public.organisations (nom, licence_debut, licence_fin, max_utilisateurs, notes)
    values (trim(p_nom), coalesce(p_debut, current_date), p_fin, coalesce(p_max, 3), p_notes) returning id, cle into o, k;
  if coalesce(trim(p_email_admin), '') <> '' then st := public._ajouter(o, p_email_admin, 'admin'); end if;
  return jsonb_build_object('id', o, 'admin', st, 'cle', k);
end $$;

-- Nouvelle clé (clé perdue ou divulguée). Les postes déjà activés restent actifs
-- sauf si p_retirer_postes = true.
create or replace function public.editeur_nouvelle_cle(o uuid, p_retirer_postes boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text := public._nouvelle_cle();
begin
  perform public._exiger_editeur();
  update public.organisations set cle = k where id = o;
  if not found then raise exception 'ENTREPRISE_INTROUVABLE'; end if;
  if p_retirer_postes then delete from public.membres where org_id = o and poste; end if;
  return k;
end $$;

-- Retrait d'un poste par l'éditeur (ordinateur perdu, remplacé…).
create or replace function public.editeur_retirer_postes(o uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  perform public._exiger_editeur();
  delete from public.membres where org_id = o and poste;
  get diagnostics n = row_count;
  return n;
end $$;

-- L'essai gratuit est réservé aux comptes avec e-mail (pas aux postes anonymes).
create or replace function public.creer_essai(p_nom text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u  uuid := public._uid();
  o  uuid;
  em text;
begin
  if coalesce(trim(p_nom), '') = '' then raise exception 'NOM_OBLIGATOIRE'; end if;
  select lower(email) into em from auth.users where id = u;
  if em is null then raise exception 'ACCES_REFUSE'; end if;
  if exists (select 1 from public.organisations where cree_par = u) then raise exception 'ESSAI_DEJA_UTILISE'; end if;
  insert into public.organisations (nom, licence_fin, max_utilisateurs, essai, cree_par)
    values (trim(p_nom), current_date + 30, 2, true, u) returning id into o;
  insert into public.membres (org_id, user_id, email, role) values (o, u, em, 'admin');
  return o;
end $$;

-- Droits d'exécution
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.mon_espace(), public.creer_essai(text), public.etat(uuid), public.charger(uuid), public.enregistrer(uuid, jsonb, bigint),
  public.historique(uuid), public.restaurer(uuid, bigint),
  public.liste_membres(uuid), public.ajouter_membre(uuid, text, text), public.retirer_membre(uuid, uuid, text),
  public.activer_cle(text, text), public.liberer_poste(uuid), public.changer_role(uuid, uuid, text),
  public.editeur_organisations(), public.editeur_creer_organisation(text, text, date, date, int, text),
  public.editeur_maj_organisation(uuid, text, date, date, int, boolean, text), public.editeur_ajouter_admin(uuid, text),
  public.editeur_nouvelle_cle(uuid, boolean), public.editeur_retirer_postes(uuid)
to authenticated;
revoke execute on function public._uid(), public.est_editeur(), public._role(uuid), public._licence_ok(uuid),
  public._exiger_admin(uuid), public._exiger_editeur(), public._ajouter(uuid, text, text),
  public._nouvelle_cle(), public._norm_cle(text) from authenticated;
