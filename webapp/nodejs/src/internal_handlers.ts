import type { Context } from "hono";
import type { Environment } from "./types/hono.js";
import type { RowDataPacket } from "mysql2";
import { calculateDistance } from "./common.js";

type WaitingRide = {
  id: string;
  pickup_latitude: number;
  pickup_longitude: number;
};

type FreeChair = {
  id: string;
  speed: number | null;
  latitude: number | null;
  longitude: number | null;
};

// 位置情報が未登録の椅子は、どのライドからも最も遠い扱いにする
const UNKNOWN_LOCATION_DISTANCE = 1_000_000;

// このAPIをインスタンス内から一定間隔で叩かせることで、椅子とライドをマッチングさせる
// 待たせている順にライドを見ていき、配車地点まで最も早く到着できる空き椅子を割り当てる
export const internalGetMatching = async (ctx: Context<Environment>) => {
  const [rides] = await ctx.var.dbConn.query<Array<WaitingRide & RowDataPacket>>(
    "SELECT id, pickup_latitude, pickup_longitude FROM rides WHERE chair_id IS NULL ORDER BY created_at",
  );
  if (rides.length === 0) {
    return ctx.body(null, 204);
  }

  // 稼働中で、割り当て済みのライドがすべて椅子に完了まで通知済み (chair_sent_at が6件) の椅子
  const [chairs] = await ctx.var.dbConn.query<Array<FreeChair & RowDataPacket>>(
    `SELECT chairs.id, chair_models.speed, chair_latest_locations.latitude, chair_latest_locations.longitude
     FROM chairs
     LEFT JOIN chair_models ON chair_models.name = chairs.model
     LEFT JOIN chair_latest_locations ON chair_latest_locations.chair_id = chairs.id
     WHERE chairs.is_active = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM rides
         WHERE rides.chair_id = chairs.id
           AND (SELECT COUNT(chair_sent_at) FROM ride_statuses WHERE ride_statuses.ride_id = rides.id) < 6
       )`,
  );
  const freeChairs = [...chairs];

  for (const ride of rides) {
    if (freeChairs.length === 0) {
      break;
    }
    let bestIndex = -1;
    let bestTime = Number.POSITIVE_INFINITY;
    for (let i = 0; i < freeChairs.length; i++) {
      const chair = freeChairs[i];
      const distance =
        chair.latitude === null || chair.longitude === null
          ? UNKNOWN_LOCATION_DISTANCE
          : calculateDistance(
              chair.latitude,
              chair.longitude,
              ride.pickup_latitude,
              ride.pickup_longitude,
            );
      const time = distance / (chair.speed ?? 1);
      if (time < bestTime) {
        bestTime = time;
        bestIndex = i;
      }
    }
    const [chair] = freeChairs.splice(bestIndex, 1);
    await ctx.var.dbConn.query(
      "UPDATE rides SET chair_id = ? WHERE id = ? AND chair_id IS NULL",
      [chair.id, ride.id],
    );
  }

  return ctx.body(null, 204);
};
