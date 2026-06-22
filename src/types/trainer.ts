export type TrainerMode = "idle" | "exercise" | "rest";

export type TrainerSettings = {
  beepCooldownSeconds: number;
  exerciseLimitBpm: number;
  restCompleteBpm: number;
};
