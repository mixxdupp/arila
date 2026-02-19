import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createUser, findUserByUsername, findUserById } from "../services/userService.js";
import {
  generateServerEphemeral,
  storeSRPSession,
  getSRPSession,
  deleteSRPSession,
  verifyClientProof,
} from "../services/srpService.js";
import {
  createSession,
  deleteSessionsByUser,
  deleteSessionByToken,
} from "../services/sessionService.js";
import { env } from "../config/env.js";
import { registerLimiter, loginLimiter, generalLimiter } from "../middleware/rateLimit.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validate.js";

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric with underscores"),
  srpSalt: z.string().min(1).max(512),
  srpVerifier: z.string().min(1).max(2048),
});

const loginStartSchema = z.object({
  username: z.string().min(3).max(32),
});

const loginFinishSchema = z.object({
  username: z.string().min(3).max(32),
  clientPublicEphemeral: z.string().min(1).max(2048),
  clientProof: z.string().min(1).max(2048),
});

type RegisterBody = z.infer<typeof registerSchema>;
type LoginStartBody = z.infer<typeof loginStartSchema>;
type LoginFinishBody = z.infer<typeof loginFinishSchema>;

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/auth/register
  fastify.post(
    "/api/auth/register",
    { preHandler: [registerLimiter, validateBody(registerSchema)] },
    async (request, reply) => {
      const { username, srpSalt, srpVerifier } = request.body as RegisterBody;

      const existing = await findUserByUsername(username);
      if (existing) {
        return reply.status(409).send({ error: "Username already taken" });
      }

      try {
        const result = await createUser({ username, srpSalt, srpVerifier });
        return reply.status(201).send({ pin: result.pin });
      } catch (err) {
        fastify.log.error(err, "Registration failed");
        return reply.status(500).send({ error: "Registration failed" });
      }
    }
  );

  // POST /api/auth/login/start
  fastify.post(
    "/api/auth/login/start",
    { preHandler: [loginLimiter, validateBody(loginStartSchema)] },
    async (request, reply) => {
      const { username } = request.body as LoginStartBody;

      const user = await findUserByUsername(username);
      if (!user) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      try {
        const ephemeral = generateServerEphemeral(user.srp_verifier);

        storeSRPSession(username, {
          serverSecretEphemeral: ephemeral.serverSecretEphemeral,
          serverPublicEphemeral: ephemeral.serverPublicEphemeral,
        });

        return reply.send({
          salt: user.srp_salt,
          serverPublicEphemeral: ephemeral.serverPublicEphemeral,
        });
      } catch (err) {
        fastify.log.error(err, "Login start failed");
        return reply.status(500).send({ error: "Login failed" });
      }
    }
  );

  // POST /api/auth/login/finish
  fastify.post(
    "/api/auth/login/finish",
    { preHandler: [loginLimiter, validateBody(loginFinishSchema)] },
    async (request, reply) => {
      const { username, clientPublicEphemeral, clientProof } = request.body as LoginFinishBody;

      const user = await findUserByUsername(username);
      if (!user) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const srpSession = getSRPSession(username);
      if (!srpSession) {
        return reply.status(401).send({ error: "Login session expired. Start login again." });
      }

      try {
        const serverProof = verifyClientProof(
          srpSession.serverSecretEphemeral,
          clientPublicEphemeral,
          clientProof,
          user.srp_salt,
          user.srp_verifier,
          username
        );

        deleteSRPSession(username);
        await deleteSessionsByUser(user.id);
        const session = await createSession(user.id);

        void reply.setCookie("session", session.token, {
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: env.SESSION_MAX_AGE / 1000,
          signed: true,
        });

        return reply.send({ serverProof });
      } catch {
        deleteSRPSession(username);
        return reply.status(401).send({ error: "Invalid credentials" });
      }
    }
  );

  // POST /api/auth/logout
  fastify.post("/api/auth/logout", { preHandler: [generalLimiter] }, async (request, reply) => {
    const signedCookie = request.cookies["session"];
    if (signedCookie) {
      const unsigned = request.unsignCookie(signedCookie);
      if (unsigned.valid && unsigned.value) {
        await deleteSessionByToken(unsigned.value);
      }
    }

    void reply.clearCookie("session", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    return reply.send({ ok: true });
  });

  // GET /api/auth/me — session restore
  fastify.get(
    "/api/auth/me",
    { preHandler: [authenticate, generalLimiter] },
    async (request, reply) => {
      const user = await findUserById(request.userId);
      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }
      return reply.send({ userId: user.id, pin: user.pin, username: user.username });
    }
  );
}
