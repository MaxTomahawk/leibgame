export async function ensurePlayerProfile (supabase, userId, displayName) {
  const { data, error } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: insertError } = await supabase
      .from('player_profiles')
      .insert({ id: userId, display_name: displayName || 'Player' })
      .select()
      .single();
    if (insertError) throw insertError;
    return created;
  }

  if (displayName && data.display_name !== displayName) {
    const { data: updated, error: updateError } = await supabase
      .from('player_profiles')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (updateError) throw updateError;
    return updated;
  }

  return data;
}

export async function loadPlayerProfile (supabase, userId) {
  const { data, error } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function savePlayerProgress (supabase, userId, { coins, stars, upgrades, ronnieUnlocked, displayName }) {
  const payload = {
    updated_at: new Date().toISOString()
  };
  if (coins !== undefined) payload.coins = coins;
  if (stars !== undefined) payload.stars = stars;
  if (upgrades !== undefined) payload.upgrades = upgrades;
  if (ronnieUnlocked !== undefined) payload.ronnie_unlocked = ronnieUnlocked;
  if (displayName !== undefined) payload.display_name = displayName;

  const { error } = await supabase
    .from('player_profiles')
    .upsert({ id: userId, ...payload }, { onConflict: 'id' });
  if (error) throw error;
}

export async function patchPlayerProfile (supabase, userId, patch) {
  const { error } = await supabase
    .from('player_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}
