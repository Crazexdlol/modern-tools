export type ReminderChannels = {
  in_app: boolean;
  push: boolean;
  email: boolean;
};

export type ReminderRecurrence = {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;        // every N days/weeks/months (default 1)
  end_at: string | null;   // ISO timestamp or null = indefinite
};

export type ReminderStatus =
  | 'scheduled'
  | 'fired'
  | 'acknowledged'
  | 'snoozed'
  | 'dismissed';

export type Reminder = {
  id: string;
  created_by: string;
  target_user_id: string;
  note: string;
  fire_at: string;           // ISO timestamp
  claim_id: string | null;
  recurrence: ReminderRecurrence | null;
  channels: ReminderChannels;
  status: ReminderStatus;
  fired_at: string | null;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  created_at: string;
};

export type ReminderCreateInput = {
  target_user_ids: string[];           // one row inserted per entry
  note: string;
  fire_at: string;
  claim_id?: string | null;
  recurrence?: ReminderRecurrence | null;
  channels: ReminderChannels;
};

export type ReminderUpdateInput = Partial<{
  note: string;
  fire_at: string;
  claim_id: string | null;
  recurrence: ReminderRecurrence | null;
  channels: ReminderChannels;
}>;

export type ReminderActionInput = {
  action: 'acknowledge' | 'snooze' | 'dismiss';
  snooze_until?: string;    // required when action='snooze'
};
