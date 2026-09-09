-- Momentum — reference data.
--
-- Definition rows ship as a migration, not as seed data: they are part of the
-- schema's meaning (a user_achievements row is meaningless without them) and
-- every environment must have exactly the same set. `on conflict (key)` keeps
-- the migration re-runnable against a database that already has them.

insert into public.achievement_definitions (key, name, description, sort_order) values
  ('first_step',       'First step',       'Complete your first task.',                                   1),
  ('deep_work',        'Deep work',        'Finish a focus session of 45 minutes or more.',               2),
  ('consistency',      'Consistency',      'Keep a habit at 80% or better across four weeks.',            3),
  ('early_bird',       'Early bird',       'Complete a scheduled block before 9am.',                      4),
  ('planner',          'Planner',          'Plan a week with every task estimated and scheduled.',        5),
  ('project_finisher', 'Project finisher', 'Complete every task in a project.',                           6)
on conflict (key) do nothing;

insert into public.quest_definitions
  (key, period, metric, target, xp_reward, coin_reward, title, description) values
  ('daily_three_tasks',    'daily',  'tasks_completed',          3,  20,  5, 'Three down',        'Complete three tasks today.'),
  ('daily_priority_task',  'daily',  'priority_tasks_completed', 1,  15,  5, 'Lead with the one', 'Complete a priority 1 task today.'),
  ('daily_focus_50',       'daily',  'focus_minutes',           50,  20,  5, 'Fifty focused',     'Spend 50 focused minutes today.'),
  ('daily_two_habits',     'daily',  'habits_completed',         2,  15,  5, 'Keep it up',        'Complete two habits today.'),
  ('daily_two_blocks',     'daily',  'blocks_completed',         2,  15,  5, 'Plan met',          'Complete two scheduled blocks today.'),
  ('weekly_twelve_tasks',  'weekly', 'tasks_completed',         12,  60, 20, 'Steady week',       'Complete twelve tasks this week.'),
  ('weekly_focus_240',     'weekly', 'focus_minutes',          240,  60, 20, 'Four hours deep',   'Spend four focused hours this week.'),
  ('weekly_habit_days',    'weekly', 'habit_days',               5,  50, 15, 'Five good days',    'Complete at least one habit on five days this week.'),
  ('weekly_ten_blocks',    'weekly', 'blocks_completed',        10,  50, 15, 'Week as planned',   'Complete ten scheduled blocks this week.')
on conflict (key) do nothing;

insert into public.cosmetic_definitions (key, kind, name, description, price, sort_order) values
  ('frame_copper',   'profile_frame', 'Copper frame',   'A warm ring around your avatar.',              50, 1),
  ('frame_graphite', 'profile_frame', 'Graphite frame', 'A quiet dark ring around your avatar.',       120, 2),
  ('theme_dusk',     'theme',         'Dusk',           'A cooler evening palette for the interface.', 200, 3),
  ('block_hatched',  'block_style',   'Hatched blocks', 'Calendar blocks with a fine hatch fill.',     150, 4),
  ('avatar_compass', 'avatar',        'Compass',        'A compass avatar.',                            80, 5)
on conflict (key) do nothing;
