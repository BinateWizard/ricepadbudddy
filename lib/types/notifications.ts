export type NotificationType = 
  | 'device_offline'
  | 'device_online'
  | 'task_reminder'
  | 'growth_stage_change'
  | 'critical_sensor'
  | 'harvest_ready'
  | 'general';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  
  // Optional related data for navigation
  fieldId?: string;
  fieldName?: string;
  paddyId?: string;
  paddyName?: string;
  deviceId?: string;
  
  // Optional action data
  actionUrl?: string;
  
  // Optional icon/emoji
  icon?: string;
}

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  fieldId?: string;
  fieldName?: string;
  paddyId?: string;
  paddyName?: string;
  deviceId?: string;
  actionUrl?: string;
  icon?: string;
}
