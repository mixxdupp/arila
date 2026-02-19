import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { keyFetchLimiter, generalLimiter } from "../middleware/rateLimit.js";
import { uploadKeyBundle, fetchKeyBundle, getUnusedPreKeyCount, bundleExists } from "../services/keyService.js";
import { findUserByPin } from "../services/userService.js";

const keyBundleSchema = z.object({
  identityKey: z.string().min(1).max(1024),
  signedPreKeyId: z.number().int().positive(),
  signedPreKey: z.string().min(1).max(1024),
  signedPreKeySignature: z.string().min(1).max(1024),
  oneTimePreKeys: z.array(z.object({
    keyId: z.number().int().positive(),
    publicKey: z.string().min(1).max(1024),
  })).min(1).max(100),
});

const pinParamSchema = z.object({
  pin: z.string().regex(/^ARL-[A-Z0-9]{6}$/),
});

type KeyBundleBody = z.infer<typeof keyBundleSchema>;
type PinParams = z.infer<typeof pinParamSchema>;

export async function keyRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/keys/bundle — upload key bundle
  fastify.post(
    "/api/keys/bundle",
    { preHandler: [authenticate, generalLimiter, validateBody(keyBundleSchema)] },
    async (request, reply) => {
      const body = request.body as KeyBundleBody;

      try {
        await uploadKeyBundle({
          userId: request.userId,
          identityKey: body.identityKey,
          signedPreKeyId: body.signedPreKeyId,
          signedPreKey: body.signedPreKey,
          signedPreKeySignature: body.signedPreKeySignature,
          oneTimePreKeys: body.oneTimePreKeys,
        });

        return reply.send({ ok: true });
      } catch (err) {
        fastify.log.error(err, "Key bundle upload failed");
        return reply.status(500).send({ error: "Key bundle upload failed" });
      }
    }
  );

  // GET /api/keys/check — check if own key bundle exists (doesn't consume pre-keys)
  fastify.get(
    "/api/keys/check",
    { preHandler: [authenticate, generalLimiter] },
    async (request, reply) => {
      const exists = await bundleExists(request.userId);
      return reply.send({ exists });
    }
  );

  // GET /api/keys/bundle/:pin — fetch someone's key bundle
  fastify.get(
    "/api/keys/bundle/:pin",
    { preHandler: [authenticate, keyFetchLimiter, validateParams(pinParamSchema)] },
    async (request, reply) => {
      const { pin } = request.params as PinParams;

      const user = await findUserByPin(pin);
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const bundle = await fetchKeyBundle(user.id);
      if (!bundle) {
        return reply.status(404).send({ error: "Key bundle not found" });
      }

      // Also return remaining prekey count so client can replenish
      const remainingPreKeys = await getUnusedPreKeyCount(user.id);

      return reply.send({
        ...bundle,
        remainingPreKeys,
      });
    }
  );
}
