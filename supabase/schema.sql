-- =====================================================================
--  Gestion RH & Paie — base de données en ligne (Supabase)
--  À exécuter une fois dans Supabase › SQL Editor › New query › Run.
--  Le script peut être relancé sans risque (il remplace les fonctions).
--
--  Principe de sécurité :
--   * aucune table n'est lisible directement depuis l'application ;
--   * tout passe par les fonctions ci-dessous, qui vérifient le compte
--     connecté, son rôle dans l'entreprise et la validité de la licence ;
--   * la clé « publishable » de l'application ne donne accès à rien
--     sans compte valide.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------
create table if not exists public.organisations (
  id               uuid primary key default gen_random_uuid(),
  nom              text not null,
  licence_debut    date not null default current_date,
  licence_fin      date not null,
  max_utilisateurs int  not null default 3 check (max_utilisateurs between 1 and 100),
  actif            boolean not null default true,
  essai            boolean not null default false,
  notes            text,
  cree_par         uuid references auth.users on delete set null,
  cree_le          timestamptz not null default now()
);

create table if not exists public.membres (
  org_id    uuid not null references public.organisations on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  email     text not null,
  role      text not null check (role in ('admin', 'gestionnaire', 'lecture')),
  ajoute_le timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists membres_user_idx on public.membres (user_id);

-- Invitations : e-mails ajoutés par un administrateur avant que la personne
-- ait créé son compte. Elles sont rattachées automatiquement à la connexion.
create table if not exists public.invitations (
  org_id    uuid not null references public.organisations on delete cascade,
  email     text not null,
  role      text not null check (role in ('admin', 'gestionnaire', 'lecture')),
  cree_le   timestamptz not null default now(),
  primary key (org_id, email)
);

create table if not exists public.donnees (
  org_id  uuid primary key references public.organisations on delete cascade,
  contenu jsonb not null,
  version bigint not null default 1,
  maj_le  timestamptz not null default now(),
  maj_par uuid references auth.users on delete set null
);

-- Une copie par jour au maximum, conservée 30 jours.
create table if not exists public.donnees_historique (
  id       bigserial primary key,
  org_id   uuid not null references public.organisations on delete cascade,
  contenu  jsonb not null,
  version  bigint not null,
  cree_le  timestamptz not null default now(),
  cree_par uuid references auth.users on delete set null
);
create index if not exists historique_org_idx on public.donnees_historique (org_id, cree_le desc);

-- Comptes de l'éditeur du logiciel (gestion des licences).
create table if not exists public.editeurs (
  user_id uuid primary key references auth.users on delete cascade
);

-- Aucun accès direct aux tables : tout passe par les fonctions.
alter table public.organisations      enable row level security;
alter table public.membres            enable row level security;
alter table public.invitations        enable row level security;
alter table public.donnees            enable row level security;
alter table public.donnees_historique enable row level security;
alter table public.editeurs           enable row level security;
revoke all on public.organisations, public.membres, public.invitations, public.donnees,
              public.donnees_historique, public.editeurs from anon, authenticated;

-- ---------------------------------------------------------------------
--  Fonctions internes
-- ---------------------------------------------------------------------
create or replace function public._uid() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  return auth.uid();
end $$;

create or replace function public.est_editeur() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.editeurs where user_id = auth.uid());
$$;

create or replace function public._role(o uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.membres where org_id = o and user_id = auth.uid();
$$;

create or replace function public._licence_ok(o uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select actif and current_date between licence_debut and licence_fin
                   from public.organisations where id = o), false);
$$;

create or replace function public._exiger_admin(o uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._uid();
  if public.est_editeur() then return; end if;
  if coalesce(public._role(o), '') <> 'admin' then raise exception 'ACCES_REFUSE'; end if;
  if not public._licence_ok(o) then raise exception 'LICENCE_EXPIREE'; end if;
end $$;

-- Ajoute un membre (compte existant) ou crée une invitation.
create or replace function public._ajouter(o uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  em text := lower(trim(p_email));
  u  uuid;
  nb int;
  mx int;
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'EMAIL_INVALIDE'; end if;
  if p_role not in ('admin', 'gestionnaire', 'lecture') then raise exception 'ROLE_INVALIDE'; end if;
  select max_utilisateurs into mx from public.organisations where id = o;
  if mx is null then raise exception 'ENTREPRISE_INTROUVABLE'; end if;
  select id into u from auth.users where lower(email) = em limit 1;
  if u is not null and exists (select 1 from public.membres where org_id = o and user_id = u) then
    update public.membres set role = p_role where org_id = o and user_id = u;
    return 'modifie';
  end if;
  select (select count(*) from public.membres where org_id = o)
       + (select count(*) from public.invitations where org_id = o and email <> em) into nb;
  if nb >= mx then raise exception 'MAX_UTILISATEURS'; end if;
  if u is not null then
    insert into public.membres (org_id, user_id, email, role) values (o, u, em, p_role);
    delete from public.invitations where org_id = o and email = em;
    return 'ajoute';
  end if;
  insert into public.invitations (org_id, email, role) values (o, em, p_role)
    on conflict (org_id, email) do update set role = excluded.role;
  return 'invite';
end $$;

-- ---------------------------------------------------------------------
--  Fonctions appelées par l'application
-- ---------------------------------------------------------------------

-- Espace de l'utilisateur connecté : ses entreprises, rôles et licences.
create or replace function public.mon_espace() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u  uuid := public._uid();
  em text;
begin
  -- Rattache les invitations en attente pour l'adresse (confirmée) du compte.
  select lower(email) into em from auth.users where id = u and email_confirmed_at is not null;
  if em is not null then
    insert into public.membres (org_id, user_id, email, role)
      select i.org_id, u, em, i.role from public.invitations i where i.email = em
      on conflict (org_id, user_id) do nothing;
    delete from public.invitations where email = em;
  end if;
  return jsonb_build_object(
    'user_id', u,
    'email', (select email from auth.users where id = u),
    'editeur', public.est_editeur(),
    'aujourdhui', current_date,
    'essai_possible', not exists (select 1 from public.organisations where cree_par = u),
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'nom', o.nom, 'role', m.role,
               'licence_debut', o.licence_debut, 'licence_fin', o.licence_fin,
               'actif', o.actif, 'essai', o.essai, 'licence_ok', public._licence_ok(o.id),
               'max_utilisateurs', o.max_utilisateurs) order by o.nom)
      from public.membres m join public.organisations o on o.id = m.org_id
      where m.user_id = u), '[]'::jsonb));
end $$;

-- Essai gratuit de 30 jours (une fois par compte).
create or replace function public.creer_essai(p_nom text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u  uuid := public._uid();
  o  uuid;
  em text;
begin
  if coalesce(trim(p_nom), '') = '' then raise exception 'NOM_OBLIGATOIRE'; end if;
  if exists (select 1 from public.organisations where cree_par = u) then raise exception 'ESSAI_DEJA_UTILISE'; end if;
  select lower(email) into em from auth.users where id = u;
  insert into public.organisations (nom, licence_fin, max_utilisateurs, essai, cree_par)
    values (trim(p_nom), current_date + 30, 2, true, u) returning id into o;
  insert into public.membres (org_id, user_id, email, role) values (o, u, em, 'admin');
  return o;
end $$;

-- Lecture des données de l'entreprise.
create or replace function public.charger(o uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.donnees;
begin
  perform public._uid();
  if public._role(o) is null then raise exception 'ACCES_REFUSE'; end if;
  if not public._licence_ok(o) then raise exception 'LICENCE_EXPIREE'; end if;
  select * into d from public.donnees where org_id = o;
  if not found then return jsonb_build_object('version', 0, 'contenu', null); end if;
  return jsonb_build_object('version', d.version, 'contenu', d.contenu, 'maj_le', d.maj_le);
end $$;

-- Version actuelle (contrôle léger des mises à jour faites par les autres utilisateurs).
create or replace function public.etat(o uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._uid();
  if public._role(o) is null then raise exception 'ACCES_REFUSE'; end if;
  return jsonb_build_object('version', coalesce((select version from public.donnees where org_id = o), 0),
                            'licence_ok', public._licence_ok(o),
                            'licence_fin', (select licence_fin from public.organisations where id = o),
                            'role', public._role(o));
end $$;

-- Enregistrement avec contrôle de version : si quelqu'un a enregistré entre-temps,
-- rien n'est écrasé et la version la plus récente est renvoyée (conflit).
create or replace function public.enregistrer(o uuid, c jsonb, v bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u uuid := public._uid();
  r text := public._role(o);
  d public.donnees;
  nv bigint;
begin
  if r is null then raise exception 'ACCES_REFUSE'; end if;
  if r = 'lecture' then raise exception 'LECTURE_SEULE'; end if;
  if not public._licence_ok(o) then raise exception 'LICENCE_EXPIREE'; end if;
  if c is null or jsonb_typeof(c) <> 'object' then raise exception 'DONNEES_INVALIDES'; end if;
  if octet_length(c::text) > 8000000 then raise exception 'TROP_VOLUMINEUX'; end if;
  select * into d from public.donnees where org_id = o for update;
  if not found then
    insert into public.donnees (org_id, contenu, version, maj_par) values (o, c, 1, u)
      on conflict (org_id) do nothing;
    if not found then
      select * into d from public.donnees where org_id = o;
      return jsonb_build_object('ok', false, 'conflit', true, 'version', d.version, 'contenu', d.contenu, 'maj_le', d.maj_le);
    end if;
    nv := 1;
  else
    if d.version <> v then
      return jsonb_build_object('ok', false, 'conflit', true, 'version', d.version, 'contenu', d.contenu, 'maj_le', d.maj_le);
    end if;
    if not exists (select 1 from public.donnees_historique h
                   where h.org_id = o and h.cree_le > now() - interval '1 day') then
      insert into public.donnees_historique (org_id, contenu, version, cree_le, cree_par)
        values (o, d.contenu, d.version, d.maj_le, d.maj_par);
    end if;
    nv := d.version + 1;
    update public.donnees set contenu = c, version = nv, maj_le = now(), maj_par = u where org_id = o;
  end if;
  delete from public.donnees_historique where org_id = o and cree_le < now() - interval '30 days';
  return jsonb_build_object('ok', true, 'version', nv, 'maj_le', now());
end $$;

-- Historique des sauvegardes (administrateur).
create or replace function public.historique(o uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_admin(o);
  return coalesce((select jsonb_agg(jsonb_build_object(
            'id', h.id, 'version', h.version, 'cree_le', h.cree_le,
            'par', (select email from auth.users where id = h.cree_par),
            'salaries', coalesce(jsonb_array_length(h.contenu -> 'emps'), 0)) order by h.cree_le desc)
          from public.donnees_historique h where h.org_id = o), '[]'::jsonb);
end $$;

create or replace function public.restaurer(o uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c jsonb;
  d public.donnees;
begin
  perform public._exiger_admin(o);
  select contenu into c from public.donnees_historique where id = p_id and org_id = o;
  if c is null then raise exception 'SAUVEGARDE_INTROUVABLE'; end if;
  select * into d from public.donnees where org_id = o for update;
  if found then
    insert into public.donnees_historique (org_id, contenu, version, cree_le, cree_par)
      values (o, d.contenu, d.version, now(), auth.uid());
    update public.donnees set contenu = c, version = d.version + 1, maj_le = now(), maj_par = auth.uid() where org_id = o;
    return jsonb_build_object('version', d.version + 1, 'contenu', c);
  end if;
  insert into public.donnees (org_id, contenu, version, maj_par) values (o, c, 1, auth.uid());
  return jsonb_build_object('version', 1, 'contenu', c);
end $$;

-- Utilisateurs de l'entreprise (administrateur).
create or replace function public.liste_membres(o uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_admin(o);
  return jsonb_build_object(
    'max', (select max_utilisateurs from public.organisations where id = o),
    'membres', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', m.email, 'role', m.role,
                 'moi', m.user_id = auth.uid(), 'ajoute_le', m.ajoute_le) order by m.email)
               from public.membres m where m.org_id = o), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'cree_le', i.cree_le) order by i.email)
               from public.invitations i where i.org_id = o), '[]'::jsonb));
end $$;

create or replace function public.ajouter_membre(o uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_admin(o);
  if p_role <> 'admin' and exists (select 1 from public.membres m join auth.users a on a.id = m.user_id
       where m.org_id = o and lower(a.email) = lower(trim(p_email)) and m.role = 'admin')
     and (select count(*) from public.membres where org_id = o and role = 'admin') = 1 then
    raise exception 'DERNIER_ADMIN';
  end if;
  return public._ajouter(o, p_email, p_role);
end $$;

create or replace function public.retirer_membre(o uuid, p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_admin(o);
  if p_user is not null then
    if (select role from public.membres where org_id = o and user_id = p_user) = 'admin'
       and (select count(*) from public.membres where org_id = o and role = 'admin') = 1 then
      raise exception 'DERNIER_ADMIN';
    end if;
    delete from public.membres where org_id = o and user_id = p_user;
  else
    delete from public.invitations where org_id = o and email = lower(trim(p_email));
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Console de l'éditeur (licences)
-- ---------------------------------------------------------------------
create or replace function public._exiger_editeur() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._uid();
  if not public.est_editeur() then raise exception 'ACCES_REFUSE'; end if;
end $$;

create or replace function public.editeur_organisations() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_editeur();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'nom', o.nom, 'licence_debut', o.licence_debut, 'licence_fin', o.licence_fin,
      'max_utilisateurs', o.max_utilisateurs, 'actif', o.actif, 'essai', o.essai, 'notes', o.notes,
      'cree_le', o.cree_le, 'licence_ok', public._licence_ok(o.id),
      'nb_membres', (select count(*) from public.membres m where m.org_id = o.id),
      'admins', (select string_agg(m.email, ', ' order by m.email) from public.membres m where m.org_id = o.id and m.role = 'admin'),
      'invitations', (select string_agg(i.email, ', ' order by i.email) from public.invitations i where i.org_id = o.id),
      'maj_le', (select d.maj_le from public.donnees d where d.org_id = o.id),
      'salaries', (select coalesce(jsonb_array_length(d.contenu -> 'emps'), 0) from public.donnees d where d.org_id = o.id)
    ) order by o.nom) from public.organisations o), '[]'::jsonb);
end $$;

create or replace function public.editeur_creer_organisation(p_nom text, p_email_admin text, p_debut date, p_fin date, p_max int, p_notes text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare o uuid; st text;
begin
  perform public._exiger_editeur();
  if coalesce(trim(p_nom), '') = '' then raise exception 'NOM_OBLIGATOIRE'; end if;
  if p_fin is null or p_fin < coalesce(p_debut, current_date) then raise exception 'DATES_INVALIDES'; end if;
  insert into public.organisations (nom, licence_debut, licence_fin, max_utilisateurs, notes)
    values (trim(p_nom), coalesce(p_debut, current_date), p_fin, coalesce(p_max, 3), p_notes) returning id into o;
  st := public._ajouter(o, p_email_admin, 'admin');
  return jsonb_build_object('id', o, 'admin', st);
end $$;

create or replace function public.editeur_maj_organisation(o uuid, p_nom text, p_debut date, p_fin date, p_max int, p_actif boolean, p_notes text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_editeur();
  if p_fin < p_debut then raise exception 'DATES_INVALIDES'; end if;
  update public.organisations set nom = coalesce(nullif(trim(p_nom), ''), nom), licence_debut = p_debut, licence_fin = p_fin,
         max_utilisateurs = p_max, actif = p_actif, notes = p_notes,
         essai = case when p_fin <> licence_fin then false else essai end
   where id = o;
  if not found then raise exception 'ENTREPRISE_INTROUVABLE'; end if;
end $$;

create or replace function public.editeur_ajouter_admin(o uuid, p_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exiger_editeur();
  return public._ajouter(o, p_email, 'admin');
end $$;

-- ---------------------------------------------------------------------
--  Droits d'exécution : comptes connectés uniquement
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.mon_espace(), public.creer_essai(text), public.etat(uuid), public.charger(uuid), public.enregistrer(uuid, jsonb, bigint),
  public.historique(uuid), public.restaurer(uuid, bigint),
  public.liste_membres(uuid), public.ajouter_membre(uuid, text, text), public.retirer_membre(uuid, uuid, text),
  public.editeur_organisations(), public.editeur_creer_organisation(text, text, date, date, int, text),
  public.editeur_maj_organisation(uuid, text, date, date, int, boolean, text), public.editeur_ajouter_admin(uuid, text)
to authenticated;
revoke execute on function public._uid(), public.est_editeur(), public._role(uuid), public._licence_ok(uuid),
  public._exiger_admin(uuid), public._exiger_editeur(), public._ajouter(uuid, text, text) from authenticated;

-- ---------------------------------------------------------------------
--  Premier compte éditeur (à faire une fois, après avoir créé votre compte
--  dans l'application) : remplacez l'adresse puis exécutez la ligne.
-- ---------------------------------------------------------------------
-- insert into public.editeurs (user_id) select id from auth.users where email = 'votre@email.com';
