import type { FastifyRequest, FastifyReply } from "fastify";
import { validateSession } from "../services/sessionService.js";
import { updateLastSeen } from "../services/userService.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const signedCookie = request.cookies["session"];
  if (!signedCookie) {
    return reply.status(401).send({ error: "Authentication required" });
  }

  const unsigned = request.unsignCookie(signedCookie);
  if (!unsigned.valid || !unsigned.value) {
    return reply.status(401).send({ error: "Invalid session" });
  }

  const userId = await validateSession(unsigned.value);
  if (!userId) {
    void reply.clearCookie("session", {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      path: "/",
    });
    return reply.status(401).send({ error: "Session expired" });
  }

  request.userId = userId;

  // Fire-and-forget last seen update
  void updateLastSeen(userId);
}
