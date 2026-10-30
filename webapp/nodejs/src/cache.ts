import type { Connection, RowDataPacket } from "mysql2/promise";
import type { Chair, User } from "./types/models.js";

// 作成後に変化しない行のプロセス内キャッシュ
const userById = new Map<string, User>();
const chairById = new Map<string, Chair>();
const discountByRideId = new Map<string, number>();

export const clearRowCache = (): void => {
  userById.clear();
  chairById.clear();
  discountByRideId.clear();
};

export const getRideDiscount = (rideId: string): number | undefined =>
  discountByRideId.get(rideId);

export const setRideDiscount = (rideId: string, discount: number): void => {
  discountByRideId.set(rideId, discount);
};

export const getUserById = async (
  dbConn: Connection,
  id: string,
): Promise<User | undefined> => {
  let user = userById.get(id);
  if (!user) {
    [[user]] = await dbConn.query<Array<User & RowDataPacket>>(
      "SELECT * FROM users WHERE id = ?",
      [id],
    );
    if (user) userById.set(id, user);
  }
  return user;
};

// name / model など不変の列だけを参照すること (is_active は変化する)
export const getChairById = async (
  dbConn: Connection,
  id: string,
): Promise<Chair | undefined> => {
  let chair = chairById.get(id);
  if (!chair) {
    [[chair]] = await dbConn.query<Array<Chair & RowDataPacket>>(
      "SELECT * FROM chairs WHERE id = ?",
      [id],
    );
    if (chair) chairById.set(id, chair);
  }
  return chair;
};
