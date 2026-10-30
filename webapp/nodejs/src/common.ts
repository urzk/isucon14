import type { Connection, RowDataPacket } from "mysql2/promise";
import type { Ride, RideStatus } from "./types/models.js";

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

// ライドの最新ステータスを返す相関サブクエリ (rideIdColumn はライドIDを指すカラム名)
export const latestRideStatusSQL = (rideIdColumn: string): string =>
  `(SELECT status FROM ride_statuses WHERE ride_id = ${rideIdColumn} ORDER BY created_at DESC LIMIT 1)`;

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

export const getLatestRideStatus = async (
  dbConn: Connection,
  rideId: string,
): Promise<string> => {
  const [[{ status }]] = await dbConn.query<
    Array<Pick<RideStatus, "status"> & RowDataPacket>
  >(
    "SELECT status FROM ride_statuses WHERE ride_id = ? ORDER BY created_at DESC LIMIT 1",
    [rideId],
  );
  return status;
};

export class ErroredUpstream extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroredUpstream";
  }
}
