-- Bear Farm · migration 0003 — 4 Adsgram cards (safe to re-run)
insert into public.ad_networks (id, name, provider, block_id, url, reward, daily_limit, cooldown_secs, min_watch_secs, active, sort_order)
values
  ('adsgram_reward',   '🎁 Golden Reward', 'adsgram', '55403',     '', 100, 5, 10, 3, true, 1),
  ('adsgram_int',      '🌾 Harvest Video', 'adsgram', 'int-55404', '', 100, 5, 10, 3, true, 2),
  ('adsgram_reward_2', '🍯 Honey Bonus',   'adsgram', '55403',     '', 100, 5, 10, 3, true, 3),
  ('adsgram_int_2',    '🐻 Bear Boost',    'adsgram', 'int-55404', '', 100, 5, 10, 3, true, 4)
on conflict (id) do update set
  name = excluded.name, provider = excluded.provider, block_id = excluded.block_id,
  daily_limit = 5, cooldown_secs = 10, min_watch_secs = 3, active = true, sort_order = excluded.sort_order;

update public.ad_networks set active = false where id in ('monetag', 'gigapub');
