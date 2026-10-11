import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  applyAuthoritativeRoomAction,
  RoomRecord,
  sanitizeRoomForViewer,
} from '@/lib/multiplayer';

/**
 * Optional Cloud Multiplayer API Route backed by Supabase Postgres (`rummikub_rooms` table).
 * IMPORTANT: Does NOT rely on serverless in-memory state. If Supabase env vars are not configured,
 * returns `cloudConfigured: false` so the frontend uses the local Cross-Tab BroadcastChannel mode
 * or informs the user how to configure Supabase.
 */
function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
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
  const supabase = getSupabaseServerClient();
  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get('code')?.toUpperCase();
  const secretToken = req.headers.get('x-player-token');

  if (!supabase) {
    return NextResponse.json({
      cloudConfigured: false,
      message:
        '未检测到 NEXT_PUBLIC_SUPABASE_URL 环境变量，已自动启用同机多标签页实时联机模式。',
    });
  }

  if (!roomCode) {
    return NextResponse.json({ cloudConfigured: true });
  }

  const { data, error } = await supabase
    .from('rummikub_rooms')
    .select('payload')
    .eq('room_code', roomCode)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { cloudConfigured: true, error: '未找到对应的房间号' },
      { status: 404 }
    );
  }

  const room = data.payload as RoomRecord;
  return NextResponse.json({
    cloudConfigured: true,
    room: sanitizeRoomForViewer(room, secretToken, 'supabase-cloud'),
  });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        cloudConfigured: false,
        error: '云端数据库未配置，请使用本地多窗口联机或配置 Supabase 环境变量',
      },
      { status: 501 }
    );
  }

  const body = await req.json();
  const { op } = body;

  if (op === 'create') {
    const playerName = (body.playerName || '房主').slice(0, 20);
    const maxPlayers = ([2, 3, 4].includes(body.maxPlayers) ? body.maxPlayers : 4) as 2 | 3 | 4;
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

    const { error } = await supabase.from('rummikub_rooms').insert({
      room_code: roomCode,
      version: 1,
      payload: newRoom,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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

    const { data, error } = await supabase
      .from('rummikub_rooms')
      .select('payload, version')
      .eq('room_code', roomCode)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '房间不存在或已过期' }, { status: 404 });
    }

    const room = data.payload as RoomRecord;

    // Check if reconnecting with existing secretToken
    const existingSeat = existingToken
      ? room.seats.find((s) => s.secretToken === existingToken)
      : undefined;

    if (existingSeat) {
      existingSeat.connected = true;
      existingSeat.lastSeenAt = Date.now();
      await supabase
        .from('rummikub_rooms')
        .update({ payload: room, updated_at: new Date().toISOString() })
        .eq('room_code', roomCode);

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

    const { error: updateErr } = await supabase
      .from('rummikub_rooms')
      .update({
        version: room.version,
        payload: room,
        updated_at: new Date().toISOString(),
      })
      .eq('room_code', roomCode)
      .eq('version', data.version);

    if (updateErr) {
      return NextResponse.json({ error: '加入房间并发冲突，请重试' }, { status: 409 });
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

    const { data, error } = await supabase
      .from('rummikub_rooms')
      .select('payload, version')
      .eq('room_code', roomCode)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '房间不存在' }, { status: 404 });
    }

    const room = data.payload as RoomRecord;
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

    const { error: updateErr } = await supabase
      .from('rummikub_rooms')
      .update({
        version: res.room.version,
        payload: res.room,
        updated_at: new Date().toISOString(),
      })
      .eq('room_code', roomCode)
      .eq('version', data.version);

    if (updateErr) {
      return NextResponse.json({ error: '并发写入冲突，请刷新状态' }, { status: 409 });
    }

    return NextResponse.json({
      cloudConfigured: true,
      room: sanitizeRoomForViewer(res.room, secretToken, 'supabase-cloud'),
    });
  }

  return NextResponse.json({ error: '未知操作类型' }, { status: 400 });
}
