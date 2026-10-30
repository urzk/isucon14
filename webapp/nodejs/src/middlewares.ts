import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { RowDataPacket } from "mysql2/promise";
import type { Environment } from "./types/hono.js";
import type { Chair, Owner, User } from "./types/models.js";

// アクセストークンとそれに紐づく行は変化しないため、プロセス内でキャッシュする
const userByToken = new Map<string, User>();
const ownerByToken = new Map<string, Owner>();
const chairByToken = new Map<string, Chair>();

export const clearAuthCache = (): void => {
  userByToken.clear();
  ownerByToken.clear();
  chairByToken.clear();
};

export const appAuthMiddleware = createMiddleware<Environment>(
  async (ctx, next) => {
    const accessToken = getCookie(ctx, "app_session");
    if (!accessToken) {
      return ctx.text("app_session cookie is required", 401);
    }
    try {
      let user = userByToken.get(accessToken);
      if (!user) {
        [[user]] = await ctx.var.dbConn.query<Array<User & RowDataPacket>>(
          "SELECT * FROM users WHERE access_token = ?",
          [accessToken],
        );
        if (!user) {
          return ctx.text("invalid access token", 401);
        }
        userByToken.set(accessToken, user);
      }
      ctx.set("user", user);
    } catch (error) {
      return ctx.text(`Internal Server Error\n${error}`, 500);
    }
    await next();
  },
);

export const ownerAuthMiddleware = createMiddleware<Environment>(
  async (ctx, next) => {
    const accessToken = getCookie(ctx, "owner_session");
    if (!accessToken) {
      return ctx.text("owner_session cookie is required", 401);
    }
    try {
      let owner = ownerByToken.get(accessToken);
      if (!owner) {
        [[owner]] = await ctx.var.dbConn.query<Array<Owner & RowDataPacket>>(
          "SELECT * FROM owners WHERE access_token = ?",
          [accessToken],
        );
        if (!owner) {
          return ctx.text("invalid access token", 401);
        }
        ownerByToken.set(accessToken, owner);
      }
      ctx.set("owner", owner);
    } catch (error) {
      return ctx.text(`Internal Server Error\n${error}`, 500);
    }
    await next();
  },
);

export const chairAuthMiddleware = createMiddleware<Environment>(
  async (ctx, next) => {
    const accessToken = getCookie(ctx, "chair_session");
    if (!accessToken) {
      return ctx.text("chair_session cookie is required", 401);
    }
    try {
      let chair = chairByToken.get(accessToken);
      if (!chair) {
        [[chair]] = await ctx.var.dbConn.query<Array<Chair & RowDataPacket>>(
          "SELECT * FROM chairs WHERE access_token = ?",
          [accessToken],
        );
        if (!chair) {
          return ctx.text("invalid access token", 401);
        }
        chairByToken.set(accessToken, chair);
      }
      ctx.set("chair", chair);
    } catch (error) {
      return ctx.text(`Internal Server Error\n${error}`, 500);
    }
    await next();
  },
);
