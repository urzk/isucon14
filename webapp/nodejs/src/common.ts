import type { Connection } from "mysql2/promise";
import { ulid } from "ulid";
import type { Ride } from "./types/models.js";

export const INITIAL_FARE = 500;
export const FARE_PER_DISTANCE = 100;

// マンハッタン距離を求める
export const calculateDistance = (
  aLatitude: number,
  aLongitude: number,
  bLatitude: number,
  bLongitude: number,
): number => {
  return Math.abs(aLatitude - bLatitude) + Math.abs(aLongitude - bLongitude);
};

export const calculateFare = (
  pickupLatitude: number,
  pickupLongitude: number,
  destLatitude: number,
  destLongitude: number,
): number => {
  const meterdFare =
    FARE_PER_DISTANCE *
    calculateDistance(
      pickupLatitude,
      pickupLongitude,
      destLatitude,
      destLongitude,
    );
  return INITIAL_FARE + meterdFare;
};

export const calculateSale = (ride: Ride): number => {
  return calculateFare(
    ride.pickup_latitude,
    ride.pickup_longitude,
    ride.destination_latitude,
    ride.destination_longitude,
  );
};

// 適用済みクーポンの割引額からライドの運賃を求める
export const calculateDiscountedFareWithDiscount = (
  ride: Pick<
    Ride,
    | "pickup_latitude"
    | "pickup_longitude"
    | "destination_latitude"
    | "destination_longitude"
  >,
  discount: number,
): number => {
  const meteredFare =
    FARE_PER_DISTANCE *
    calculateDistance(
      ride.pickup_latitude,
      ride.pickup_longitude,
      ride.destination_latitude,
      ride.destination_longitude,
    );
  return INITIAL_FARE + Math.max(meteredFare - discount, 0);
};

// ステータス変更履歴を記録し、rides.latest_status も更新する
// (latest_status の更新で updated_at が変わらないよう明示的に自身を代入する)
export const insertRideStatus = async (
  dbConn: Connection,
  rideId: string,
  status: string,
): Promise<void> => {
  await dbConn.query(
    "INSERT INTO ride_statuses (id, ride_id, status) VALUES (?, ?, ?)",
    [ulid(), rideId, status],
  );
  await dbConn.query(
    "UPDATE rides SET latest_status = ?, updated_at = updated_at WHERE id = ?",
    [status, rideId],
  );
};

export class ErroredUpstream extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroredUpstream";
  }
}
