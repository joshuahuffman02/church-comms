export type ChannelType = "windowed" | "dated_instance" | "one_shot";
export type Phase = "awareness" | "register" | "reminder" | "day_of" | "follow_up";

export interface ChannelConfig {
  key: string;
  name: string;
  type: ChannelType;
  defaultPublishOffsetDays: number;
  productionLeadDays: number;
  lockLeadDays?: number;
  cadence?: { weekdays: number[] };     // 0=Sun..6=Sat; windowed touch days
  capacity?: number;
  tierEligibility: number[];
}

export interface EventInput {
  eventStart: Date;
  /**
   * Optional promotion deadline. When set, output schedules run backward from
   * this date instead of the event date, while phase labels still compare
   * against eventStart.
   */
  promotionEndsAt?: Date | null;
  tier: number;
}

export interface ComputedTouch {
  scheduledAt: Date;
  purposeLabel: Phase;
}

export interface ComputedDeliverable {
  channelKey: string;
  instanceDate?: Date;
  windowStart?: Date;
  windowEnd?: Date;
  productionDueAt: Date;
  phase: Phase;
  status: "to_design" | "skipped";
  skippedReason?: string;
  touches: ComputedTouch[];
}
