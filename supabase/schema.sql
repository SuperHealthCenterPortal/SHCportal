-- =====================================================================
--  Babak Super Health Center — Patient Portal
--  Supabase schema. Paste ALL of this into Supabase → SQL Editor → Run.
--  Safe to run again (uses IF NOT EXISTS / OR REPLACE where possible).
-- =====================================================================

-- ---------- PROFILES (one per login) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        text not null default 'patient'
              check (role in ('patient','staff','doctor','admin')),
  phone       text,
  birthdate   date,
  sex         text,
  barangay    text,
  created_at  timestamptz not null default now()
);

-- Helper: is the logged-in user staff/doctor/admin?
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role in ('staff','doctor','admin'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin');
$$;

-- Auto-create a profile when someone signs up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, birthdate, sex, barangay)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    nullif(new.raw_user_meta_data->>'birthdate','')::date,
    new.raw_user_meta_data->>'sex',
    new.raw_user_meta_data->>'barangay'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Patients cannot promote themselves: only admins may change roles
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null when run from the Supabase SQL Editor (allowed)
  if new.role is distinct from old.role
     and auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end; $$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- ---------- CENTER STATUS (doctor on duty today) ----------
create table if not exists public.center_status (
  id           int primary key default 1 check (id = 1),
  doctor_in    boolean not null default true,
  message      text default '',
  updated_at   timestamptz not null default now()
);
insert into public.center_status (id) values (1) on conflict do nothing;

-- ---------- ANNOUNCEMENTS ----------
create table if not exists public.announcements (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null default '',
  category    text not null default 'General',
  pinned      boolean not null default false,
  published   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- SCHEDULE (weekly services + special dates) ----------
create table if not exists public.schedules (
  id           bigint generated always as identity primary key,
  day_of_week  int check (day_of_week between 0 and 6),   -- 0=Sun … 6=Sat (weekly)
  event_date   date,                                      -- OR a specific date
  time_text    text default '',                           -- e.g. "8:00 AM – 12:00 NN"
  title        text not null,                             -- e.g. "Prenatal Check-up"
  staff        text default '',                           -- e.g. "Dr. Santos / Midwife"
  notes        text default '',                           -- shown as "Remarks"
  no_doctor    boolean not null default false,            -- 🔴 No Doctor
  created_at   timestamptz not null default now(),
  check (day_of_week is not null or event_date is not null)
);
alter table public.schedules add column if not exists no_doctor boolean not null default false;

-- ---------- QUESTIONS (Q&A) ----------
create table if not exists public.questions (
  id           bigint generated always as identity primary key,
  user_id      uuid references public.profiles(id) on delete set null,
  asker_name   text not null default 'Anonymous',
  question     text not null check (char_length(question) between 5 and 2000),
  answer       text,
  answered_by  text,
  answered_at  timestamptz,
  is_public    boolean not null default true,   -- staff can hide private ones
  created_at   timestamptz not null default now()
);

-- ---------- ONLINE CONSULTATIONS ----------
create table if not exists public.consultations (
  id              bigint generated always as identity primary key,
  patient_id      uuid not null references public.profiles(id) on delete cascade,
  patient_name    text not null,
  age             int,
  sex             text,
  contact         text,
  concern         text not null,
  symptoms_since  text,
  preferred_date  date,
  preferred_time  text,
  status          text not null default 'pending'
                  check (status in ('pending','accepted','completed','cancelled')),
  doctor_id       uuid references public.profiles(id) on delete set null,
  doctor_name     text,
  schedule_at     timestamptz,
  meeting_link    text,
  doctor_available     boolean,          -- 🟢 Available / 🔴 Not Available
  availability_remarks text,             -- remarks when Not Available
  doctor_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.consult_messages (
  id               bigint generated always as identity primary key,
  consultation_id  bigint not null references public.consultations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  sender_name      text not null default '',
  is_staff         boolean not null default false,
  body             text not null check (char_length(body) between 1 and 4000),
  created_at       timestamptz not null default now()
);
alter table public.consultations add column if not exists doctor_available boolean;
alter table public.consultations add column if not exists availability_remarks text;

create index if not exists consult_messages_cid on public.consult_messages(consultation_id, created_at);

-- =====================================================================
--  ROW LEVEL SECURITY — patients only ever see their own records
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.center_status    enable row level security;
alter table public.announcements    enable row level security;
alter table public.schedules        enable row level security;
alter table public.questions        enable row level security;
alter table public.consultations    enable row level security;
alter table public.consult_messages enable row level security;

-- drop old policies so this file can be re-run
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public'
           and tablename in ('profiles','center_status','announcements','schedules',
                             'questions','consultations','consult_messages')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- profiles
create policy "own profile read"   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "own profile update" on public.profiles for update using (id = auth.uid() or public.is_admin());

-- center status: everyone reads, staff writes
create policy "status read"  on public.center_status for select using (true);
create policy "status write" on public.center_status for update using (public.is_staff());

-- announcements
create policy "ann read"   on public.announcements for select using (published or public.is_staff());
create policy "ann insert" on public.announcements for insert with check (public.is_staff());
create policy "ann update" on public.announcements for update using (public.is_staff());
create policy "ann delete" on public.announcements for delete using (public.is_staff());

-- schedules
create policy "sch read"   on public.schedules for select using (true);
create policy "sch insert" on public.schedules for insert with check (public.is_staff());
create policy "sch update" on public.schedules for update using (public.is_staff());
create policy "sch delete" on public.schedules for delete using (public.is_staff());

-- questions: anyone may ask; public answered ones are visible to all
create policy "q read" on public.questions for select using (
  (is_public and answer is not null) or user_id = auth.uid() or public.is_staff());
create policy "q insert" on public.questions for insert with check (
  answer is null and (user_id is null or user_id = auth.uid()));
create policy "q update" on public.questions for update using (public.is_staff());
create policy "q delete" on public.questions for delete using (public.is_staff());

-- consultations
create policy "c read"   on public.consultations for select using (patient_id = auth.uid() or public.is_staff());
create policy "c insert" on public.consultations for insert with check (patient_id = auth.uid() and status = 'pending');
create policy "c update" on public.consultations for update using (patient_id = auth.uid() or public.is_staff());

-- Patients may only cancel; they cannot change doctor fields
create or replace function public.protect_consult() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    new.doctor_id    := old.doctor_id;
    new.doctor_name  := old.doctor_name;
    new.schedule_at  := old.schedule_at;
    new.meeting_link := old.meeting_link;
    new.doctor_notes := old.doctor_notes;
    new.doctor_available     := old.doctor_available;
    new.availability_remarks := old.availability_remarks;
    new.patient_id   := old.patient_id;
    if new.status <> old.status and new.status <> 'cancelled' then
      new.status := old.status;
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists consult_protect on public.consultations;
create trigger consult_protect before update on public.consultations
  for each row execute function public.protect_consult();

-- consult messages
create policy "m read" on public.consult_messages for select using (
  public.is_staff() or exists (select 1 from public.consultations c
    where c.id = consultation_id and c.patient_id = auth.uid()));
create policy "m insert" on public.consult_messages for insert with check (
  sender_id = auth.uid() and (
    public.is_staff() or exists (select 1 from public.consultations c
      where c.id = consultation_id and c.patient_id = auth.uid()
        and c.status in ('pending','accepted'))));

-- Force the is_staff flag to be truthful
create or replace function public.stamp_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.is_staff := public.is_staff();
  return new;
end; $$;
drop trigger if exists msg_stamp on public.consult_messages;
create trigger msg_stamp before insert on public.consult_messages
  for each row execute function public.stamp_message();

-- =====================================================================
--  TABLE PERMISSIONS (new Supabase projects don't grant these automatically)
--  Row Level Security above still decides which ROWS each person can see.
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select on public.center_status, public.announcements,
                public.schedules, public.questions to anon;
grant insert on public.questions to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- =====================================================================
--  REALTIME (live chat, live announcements, doctor status)
-- =====================================================================
do $$ begin
  begin alter publication supabase_realtime add table public.consult_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.consultations;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.announcements;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.center_status;    exception when others then null; end;
end $$;

-- =====================================================================
--  SAMPLE DATA (delete or edit later in the Staff page)
-- =====================================================================
insert into public.schedules (day_of_week, time_text, title, staff)
select * from (values
  (1, '8:00 AM – 12:00 NN', 'General Consultation', 'Doctor on duty'),
  (2, '8:00 AM – 12:00 NN', 'Prenatal Check-up', 'Midwife'),
  (3, '8:00 AM – 12:00 NN', 'Immunization (Bakuna)', 'Nurse / Midwife'),
  (4, '8:00 AM – 12:00 NN', 'Family Planning', 'Midwife'),
  (5, '1:00 PM – 5:00 PM',  'Hypertension & Diabetes Clinic', 'Doctor on duty')
) as v(d,t,ti,s)
where not exists (select 1 from public.schedules);

insert into public.announcements (title, body, category, pinned)
select 'Welcome to the Babak SHC Patient Portal',
       'You can now read announcements, see our clinic schedule, ask questions, and request an online consultation with our doctors.',
       'General', true
where not exists (select 1 from public.announcements);

-- =====================================================================
--  AFTER YOU CREATE YOUR OWN ACCOUNT on the portal, make yourself admin:
--
--  update public.profiles set role = 'admin'
--  where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
--
--  (If you signed up with a mobile number, the email is
--   09XXXXXXXXX@babakshc.app)
-- =====================================================================
