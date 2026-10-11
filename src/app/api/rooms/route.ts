import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  applyAuthoritativeRoomAction,
  RoomRecord,
  sanitizeRoomForViewer,
} from '@/lib/multiplayer';

const ROOM_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/**
 * Cloud Storage Adapter for Authoritative Multiplayer Rooms.
 * Supports:
 * 1. Upstash Redis KV (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) — Provisioned on Vercel!
 * 2. Supabase Postgres (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
 */
function hasUpstashKV(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvGetRoom(roomCode: string): Promise<RoomRecord | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url}/get/rummikub:room:${roomCode}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: string | null };
  if (!data.result) return null;
  try {
    return JSON.parse(data.result) as RoomRecord;
  } catch {
    return null;
  }
}

async function kvSetRoom(room: RoomRecord): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;

  const res = await fetch(
    `${url}/set/rummikub:room:${room.roomCode}?EX=${ROOM_TTL_SECONDS}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(room),
      cache: 'no-store',
    }
  );
  return res.ok;
}

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

async function loadCloudRoom(roomCode: string): Promise<RoomRecord | null> {
  if (hasUpstashKV()) {
    return kvGetRoom(roomCode);
  }
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('rummikub_rooms')
      .select('payload')
      .eq('room_code', roomCode)
      .single();
    if (error || !data) return null;
    return data.payload as RoomRecord;
  }
  return null;
}

async function saveCloudRoom(
  room: RoomRecord,
  expectedPreviousVersion?: number
): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
  if (hasUpstashKV()) {
    if (expectedPreviousVersion !== undefined) {
      const latest = await kvGetRoom(room.roomCode);
      if (latest && latest.version !== expectedPreviousVersion) {
        return { ok: false, conflict: true, error: '并发写入冲突，请重试' };
      }
    }
    const saved = await kvSetRoom(room);
    return saved ? { ok: true } : { ok: false, error: '写入云端 Redis 失败' };
  }

  const supabase = getSupabaseServerClient();
  if (supabase) {
    if (expectedPreviousVersion === undefined) {
      const { error } = await supabase.from('rummikub_rooms').insert({
        room_code: room.roomCode,
        version: room.version,
        payload: room,
        updated_at: new Date().toISOString(),
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } else {
      const { error } = await supabase
        .from('rummikub_rooms')
        .update({
          version: room.version,
          payload: room,
          updated_at: new Date().toISOString(),
        })
        .eq('room_code', room.roomCode)
        .eq('version', expectedPreviousVersion);
      if (error) return { ok: false, conflict: true, error: error.message };
      return { ok: true };
    }
  }

  return { ok: false, error: '未配置云端存储' };
}

function isCloudConfigured(): boolean {
  return hasUpstashKV() || Boolean(getSupabaseServerClient());
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(req: NextRequest) {
  const cloudReady = isCloudConfigured();
  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get('code')?.toUpperCase();
  const secretToken = req.headers.get('x-player-token');

  if (!cloudReady) {
    return NextResponse.json({
      cloudConfigured: false,
      message: '未检测到云端存储环境变量，已自动启用同机多窗口联机模式。',
    });
  }

  if (!roomCode) {
    return NextResponse.json({
      cloudConfigured: true,
      provider: hasUpstashKV() ? 'upstash-redis' : 'supabase',
    });
  }

  const room = await loadCloudRoom(roomCode);
  if (!room) {
    return NextResponse.json(
      { cloudConfigured: true, error: '未找到对应的房间号' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    cloudConfigured: true,
    room: sanitizeRoomForViewer(room, secretToken, 'supabase-cloud'),
  });
}

export async function POST(req: NextRequest) {
  if (!isCloudConfigured()) {
    return NextResponse.json(
      {
        cloudConfigured: false,
        error: '云端数据库未配置，请使用本地多窗口联机或配置云端环境变量',
      },
      { status: 501 }
    );
  }

  const body = await req.json();
  const { op } = body;

  if (op === 'create') {
    const playerName = String(body.playerName || '房主').slice(0, 20);
    const maxPlayers = ([2, 3, 4].includes(body.maxPlayers) ? body.maxPlayers : 4) as
      | 2
      | 3
      | 4;
    const roomCode = generateRoomCode();
    const playerId = `mp-p1-${Date.now().toString(36)}`;
    const secretToken = `tok-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

    const newRoom: RoomRecord = {
      roomCode,
      hostPlayerId: playerId,
      status: 'waiting',
      maxPlayers,
      version: 1,
      seats: [
        {
          seatIndex: 0,
          playerId,
          playerName,
          playerType: 'human',
          secretToken,
          connected: true,
          lastSeenAt: Date.now(),
        },
      ],
      gameState: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const saveRes = await saveCloudRoom(newRoom);
    if (!saveRes.ok) {
      return NextResponse.json(
        { error: saveRes.error || '创建房间失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      cloudConfigured: true,
      secretToken,
      playerId,
      room: sanitizeRoomForViewer(newRoom, secretToken, 'supabase-cloud'),
    });
  }

  if (op === 'join') {
    const roomCode = String(body.roomCode || '').toUpperCase();
    const playerName = String(body.playerName || '玩家').slice(0, 20);
    const existingToken = body.secretToken as string | undefined;

    const room = await loadCloudRoom(roomCode);
    if (!room) {
      return NextResponse.json({ error: '房间不存在或已过期' }, { status: 404 });
    }

    const previousVersion = room.version;

    // Check if reconnecting with existing secretToken
    const existingSeat = existingToken
      ? room.seats.find((s) => s.secretToken === existingToken)
      : undefined;

    if (existingSeat) {
      existingSeat.connected = true;
      existingSeat.lastSeenAt = Date.now();
      if (playerName && playerName !== '受邀玩家' && playerName !== '玩家') {
        existingSeat.playerName = playerName;
        if (room.gameState) {
          room.gameState.players = room.gameState.players.map((p) =>
            p.id === existingSeat.playerId ? { ...p, name: playerName } : p
          );
        }
        room.version += 1;
      }
      await saveCloudRoom(room);

      return NextResponse.json({
        cloudConfigured: true,
        secretToken: existingSeat.secretToken,
        playerId: existingSeat.playerId,
        room: sanitizeRoomForViewer(room, existingSeat.secretToken!, 'supabase-cloud'),
      });
    }

    if (room.status !== 'waiting' || room.seats.length >= room.maxPlayers) {
      return NextResponse.json(
        { error: '该房间已满员或对局已开始' },
        { status: 400 }
      );
    }

    const seatIndex = room.seats.length;
    const playerId = `mp-p${seatIndex + 1}-${Date.now().toString(36)}`;
    const secretToken = `tok-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

    room.seats.push({
      seatIndex,
      playerId,
      playerName,
      playerType: 'human',
      secretToken,
      connected: true,
      lastSeenAt: Date.now(),
    });
    room.version += 1;
    room.updatedAt = Date.now();

    const saveRes = await saveCloudRoom(room, previousVersion);
    if (!saveRes.ok) {
      return NextResponse.json(
        { error: saveRes.error || '加入房间并发冲突，请重试' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      cloudConfigured: true,
      secretToken,
      playerId,
      room: sanitizeRoomForViewer(room, secretToken, 'supabase-cloud'),
    });
  }

  if (op === 'action') {
    const roomCode = String(body.roomCode || '').toUpperCase();
    const secretToken = String(body.secretToken || '');
    const expectedVersion = Number(body.expectedVersion);

    const room = await loadCloudRoom(roomCode);
    if (!room) {
      return NextResponse.json({ error: '房间不存在' }, { status: 404 });
    }

    const previousVersion = room.version;
    const res = applyAuthoritativeRoomAction({
      room,
      secretToken,
      expectedVersion,
      action: body.action,
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: res.error,
          room: sanitizeRoomForViewer(room, secretToken, 'supabase-cloud'),
        },
        { status: 400 }
      );
    }

    const isRename = body.action?.type === 'rename_player';
    const saveRes = await saveCloudRoom(
      res.room,
      isRename ? undefined : previousVersion
    );
    if (!saveRes.ok) {
      return NextResponse.json(
        { error: saveRes.error || '并发写入冲突，请刷新状态' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      cloudConfigured: true,
      room: sanitizeRoomForViewer(res.room, secretToken, 'supabase-cloud'),
    });
  }

  return NextResponse.json({ error: '未知操作类型' }, { status: 400 });
}
