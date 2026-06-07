export const DEFAULT_ROOM_ID = 'main_world';

export function getActiveRoomId () {
  const fromUrl = new URLSearchParams(window.location.search).get('room');
  return (fromUrl && fromUrl.trim()) || DEFAULT_ROOM_ID;
}

export function applyCollectedCoins (worldData, collectedIds = []) {
  if (!worldData?.coins?.length || !collectedIds?.length) return worldData;
  const taken = new Set(collectedIds);
  return {
    ...worldData,
    coins: worldData.coins.filter((c) => !taken.has(c.id))
  };
}

export async function fetchOrCreateRoomWorld (supabase, roomId, userId, generateWorldData, castleZ) {
  const { data: existing, error: readError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle();

  if (readError) throw readError;

  if (existing?.world_data) {
    return {
      worldData: applyCollectedCoins(existing.world_data, existing.collected_coin_ids),
      collectedCoinIds: existing.collected_coin_ids || [],
      generatedAt: existing.generated_at
    };
  }

  const worldData = stampCoinIds(generateWorldData(castleZ));
  const row = {
    id: roomId,
    host_id: userId,
    world_data: worldData,
    generated_at: worldData.generatedAt,
    collected_coin_ids: [],
    updated_at: new Date().toISOString()
  };

  const { error: insertError } = await supabase.from('rooms').insert(row);
  if (insertError && insertError.code !== '23505') throw insertError;

  if (insertError?.code === '23505') {
    return fetchOrCreateRoomWorld(supabase, roomId, userId, generateWorldData, castleZ);
  }

  return { worldData, collectedCoinIds: [], generatedAt: worldData.generatedAt };
}

export async function regenerateRoomWorld (supabase, roomId, userId, generateWorldData, castleZ) {
  const worldData = stampCoinIds(generateWorldData(castleZ));
  const { error } = await supabase
    .from('rooms')
    .update({
      host_id: userId,
      world_data: worldData,
      generated_at: worldData.generatedAt,
      collected_coin_ids: [],
      updated_at: new Date().toISOString()
    })
    .eq('id', roomId);
  if (error) throw error;
  return worldData;
}

export async function markCoinCollected (supabase, roomId, coinId) {
  const { data: room, error: readError } = await supabase
    .from('rooms')
    .select('collected_coin_ids')
    .eq('id', roomId)
    .single();
  if (readError) throw readError;

  const current = room.collected_coin_ids || [];
  if (current.includes(coinId)) return false;

  const { error } = await supabase
    .from('rooms')
    .update({
      collected_coin_ids: [...current, coinId],
      updated_at: new Date().toISOString()
    })
    .eq('id', roomId);
  if (error) throw error;
  return true;
}

export function subscribeToRoom (supabase, roomId, onRoomChange) {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${roomId}`
    }, (payload) => {
      onRoomChange(payload.new);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function stampCoinIds (worldData) {
  if (!worldData?.coins) return worldData;
  let id = 0;
  return {
    ...worldData,
    coins: worldData.coins.map((coin) => ({ ...coin, id: coin.id ?? id++ }))
  };
}
