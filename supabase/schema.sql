-- 曜石拉密 (Atelier Rummikub) 可选云端联机房间数据表
-- 在 Supabase SQL Editor 中执行此脚本即可启用跨设备权威联机对战

create table if not exists public.rummikub_rooms (
  room_code text primary key,
  version integer not null default 1,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_rummikub_rooms_updated_at
  on public.rummikub_rooms (updated_at desc);
