import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { RowDataPacket } from "mysql2";
import { ulid } from "ulid";
import { getUserById } from "./cache.js";
import { insertRideStatus, NOTIFICATION_RETRY_AFTER_MS } from "./common.js";
import type { Environment } from "./types/hono.js";
import type {
  Coordinate,
  Owner,
  Ride,
  RideWithYetSentStatus,
} from "./types/models.js";
import { secureRandomStr } from "./utils/random.js";

export const chairPostChairs = async (ctx: Context<Environment>) => {
  const reqJson = await ctx.req.json<{
    name: string;
    model: string;
    chair_register_token: string;
  }>();
  const { name, model, chair_register_token } = reqJson;
  if (!name || !model || !chair_register_token) {
    return ctx.text(
      "some of required fields(name, model, chair_register_token) are empty",
      400,
    );
  }
  const [[owner]] = await ctx.var.dbConn.query<Array<Owner & RowDataPacket>>(
    "SELECT * FROM owners WHERE chair_register_token = ?",
    [chair_register_token],
  );
  if (!owner) {
    return ctx.text("invalid chair_register_token", 401);
  }
  const chairID = ulid();
  const accessToken = secureRandomStr(32);
  await ctx.var.dbConn.query(
    "INSERT INTO chairs (id, owner_id, name, model, is_active, access_token) VALUES (?, ?, ?, ?, ?, ?)",
    [chairID, owner.id, name, model, false, accessToken],
  );

  setCookie(ctx, "chair_session", accessToken, { path: "/" });

  return ctx.json({ id: chairID, owner_id: owner.id }, 201);
};

export const chairPostActivity = async (ctx: Context<Environment>) => {
  const chair = ctx.var.chair;
  const reqJson = await ctx.req.json<{ is_active: boolean }>();
  try {
    await ctx.var.dbConn.query("UPDATE chairs SET is_active = ? WHERE id = ?", [
      reqJson.is_active,
      chair.id,
    ]);
  } catch (e) {
    return ctx.text(`${e}`, 500);
  }
  return ctx.body(null, 204);
};

export const chairPostCoordinate = async (ctx: Context<Environment>) => {
  const reqJson = await ctx.req.json<Coordinate>();
  const chair = ctx.var.chair;
  try {
    // 位置履歴 (chair_locations) はどこからも読まれないため、最新位置と総移動距離だけを記録する
    const createdAt = new Date();
    // 最新位置と総移動距離を更新 (total_distance は更新前の位置との差分を加算するため先に評価させる)
    await ctx.var.dbConn.query(
      `INSERT INTO chair_latest_locations (chair_id, latitude, longitude, total_distance, total_distance_updated_at)
       VALUES (?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE
         total_distance = total_distance + ABS(VALUES(latitude) - latitude) + ABS(VALUES(longitude) - longitude),
         latitude = VALUES(latitude),
         longitude = VALUES(longitude),
         total_distance_updated_at = VALUES(total_distance_updated_at)`,
      [chair.id, reqJson.latitude, reqJson.longitude, createdAt],
    );
    const [[ride]] = await ctx.var.dbConn.query<Array<Ride & RowDataPacket>>(
      "SELECT * FROM rides WHERE chair_id = ? ORDER BY updated_at DESC LIMIT 1",
      [chair.id],
    );
    if (ride) {
      const status = ride.latest_status;
      if (status !== "COMPLETED" && status !== "CANCELED") {
        let nextStatus: string | undefined;
        if (
          reqJson.latitude === ride.pickup_latitude &&
          reqJson.longitude === ride.pickup_longitude &&
          status === "ENROUTE"
        ) {
          nextStatus = "PICKUP";
        }
        if (
          reqJson.latitude === ride.destination_latitude &&
          reqJson.longitude === ride.destination_longitude &&
          status === "CARRYING"
        ) {
          nextStatus = "ARRIVED";
        }
        if (nextStatus) {
          await ctx.var.dbConn.beginTransaction();
          await insertRideStatus(ctx.var.dbConn, ride.id, nextStatus);
          await ctx.var.dbConn.commit();
        }
      }
    }
    return ctx.json({ recorded_at: createdAt.getTime() }, 200);
  } catch (e) {
    await ctx.var.dbConn.rollback();
    return ctx.text(`${e}`, 500);
  }
};

export const chairGetNotification = async (ctx: Context<Environment>) => {
  const chair = ctx.var.chair;

  try {
    // 最新のライドと、その椅子への未通知ステータスのうち最も古いものを1クエリで取得する
    const [[ride]] = await ctx.var.dbConn.query<
      Array<RideWithYetSentStatus & RowDataPacket>
    >(
      `SELECT r.*, s.id AS yet_sent_status_id, s.status AS yet_sent_status
       FROM (SELECT * FROM rides WHERE chair_id = ? ORDER BY updated_at DESC LIMIT 1) r
       LEFT JOIN ride_statuses s ON s.id = (
         SELECT id FROM ride_statuses WHERE ride_id = r.id AND chair_sent_at IS NULL ORDER BY created_at ASC LIMIT 1
       )`,
      [chair.id],
    );
    if (!ride) {
      return ctx.json({ retry_after_ms: NOTIFICATION_RETRY_AFTER_MS }, 200);
    }

    const yetSentRideStatus = ride.yet_sent_status_id
      ? { id: ride.yet_sent_status_id, status: ride.yet_sent_status as string }
      : undefined;
    const status = yetSentRideStatus
      ? yetSentRideStatus.status
      : ride.latest_status;

    const user = await getUserById(ctx.var.dbConn, ride.user_id);
    if (!user) {
      return ctx.text("user not found", 500);
    }

    if (yetSentRideStatus?.id) {
      await ctx.var.dbConn.query(
        "UPDATE ride_statuses SET chair_sent_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
        [yetSentRideStatus.id],
      );
    }

    return ctx.json(
      {
        data: {
          ride_id: ride.id,
          user: {
            id: user.id,
            name: `${user.firstname} ${user.lastname}`,
          },
          pickup_coordinate: {
            latitude: ride.pickup_latitude,
            longitude: ride.pickup_longitude,
          },
          destination_coordinate: {
            latitude: ride.destination_latitude,
            longitude: ride.destination_longitude,
          },
          status,
        },
        retry_after_ms: NOTIFICATION_RETRY_AFTER_MS,
      },
      200,
    );
  } catch (e) {
    await ctx.var.dbConn.rollback();
    return ctx.text(`${e}`, 500);
  }
};

export const chairPostRideStatus = async (ctx: Context<Environment>) => {
  const rideID = ctx.req.param("ride_id");
  const chair = ctx.var.chair;
  const reqJson = await ctx.req.json<{ status: string }>();
  await ctx.var.dbConn.beginTransaction();
  try {
    const [[ride]] = await ctx.var.dbConn.query<Array<Ride & RowDataPacket>>(
      "SELECT * FROM rides WHERE id = ? FOR UPDATE",
      [rideID],
    );
    if (!ride) {
      return ctx.text("ride not found", 404);
    }
    if (ride.chair_id !== chair.id) {
      return ctx.text("not assigned to this ride", 400);
    }
    switch (reqJson.status) {
      // Acknowledge the ride
      case "ENROUTE":
        await insertRideStatus(ctx.var.dbConn, ride.id, "ENROUTE");
        break;
      // After Picking up user
      case "CARRYING": {
        if (ride.latest_status !== "PICKUP") {
          return ctx.text("chair has not arrived yet", 400);
        }
        await insertRideStatus(ctx.var.dbConn, ride.id, "CARRYING");
        break;
      }
      default:
        return ctx.text("invalid status", 400);
    }
    await ctx.var.dbConn.commit();
    return ctx.body(null, 204);
  } catch (e) {
    await ctx.var.dbConn.rollback();
    return ctx.text(`${e}`, 500);
  }
};
