export type PublicSmtpAccount = {
  id: string;
  label: string;
  kind: 'ENV' | 'CUSTOM';
  host: string;
  port: number;
  secure: boolean;
  username: string;
  mailFrom: string;
  hourlyQuota: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SlackStatus = {
  connected: boolean;
  configured: boolean;
  teamId?: string;
  teamName?: string;
  channelName?: string;
  scope?: string;
  connectedAt?: string;
};
