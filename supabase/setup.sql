do $$
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'user_profiles'
    ) and not exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'customer_profiles'
    ) then
        alter table public.user_profiles rename to customer_profiles;
    end if;
end
$$;

create table if not exists public.customer_profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    full_name text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.admin_profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    created_at timestamptz not null default now()
);

create or replace function public.handle_customer_profile_timestamp()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_customer_profile_timestamp on public.customer_profiles;
create trigger set_customer_profile_timestamp
before update on public.customer_profiles
for each row
execute function public.handle_customer_profile_timestamp();

create or replace function public.handle_new_auth_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.customer_profiles (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'name', new.email, '')
    )
    on conflict (id) do update
    set
        email = excluded.email,
        full_name = coalesce(excluded.full_name, public.customer_profiles.full_name);

    if lower(new.email) = 'damayojholmer@gmail.com' then
        insert into public.admin_profiles (user_id, email)
        values (new.id, new.email)
        on conflict (user_id) do update
        set email = excluded.email;
    end if;

    return new;
end;
$$;

drop trigger if exists on_auth_customer_created on auth.users;
create trigger on_auth_customer_created
after insert on auth.users
for each row
execute function public.handle_new_auth_customer();

alter table public.customer_profiles enable row level security;
alter table public.admin_profiles enable row level security;

drop policy if exists "customers can read own profile" on public.customer_profiles;
create policy "customers can read own profile"
on public.customer_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "customers can insert own profile" on public.customer_profiles;
create policy "customers can insert own profile"
on public.customer_profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "customers can update own profile" on public.customer_profiles;
create policy "customers can update own profile"
on public.customer_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "admins can read own admin profile" on public.admin_profiles;
create policy "admins can read own admin profile"
on public.admin_profiles
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.admin_profiles
        where user_id = check_user
    );
$$;

comment on table public.customer_profiles is 'Profile records for signed-in customers.';
comment on table public.admin_profiles is 'Admin membership table. Insert a signed-up auth user here to promote them.';

-- Example promotion after a customer signs up:
-- insert into public.admin_profiles (user_id, email)
-- select id, email
-- from auth.users
-- where email = 'admin@example.com';
