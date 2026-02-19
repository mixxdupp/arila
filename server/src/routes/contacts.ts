import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { validateParams } from "../middleware/validate.js";
import { generalLimiter } from "../middleware/rateLimit.js";
import { findUserByPin } from "../services/userService.js";

const pinParamSchema = z.object({
  pin: z.string().regex(/^ARL-[A-Z0-9]{6}$/),
});

type PinParams = z.infer<typeof pinParamSchema>;

export async function contactRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/contacts/lookup/:pin
  fastify.get(
    "/api/contacts/lookup/:pin",
    { preHandler: [authenticate, generalLimiter, validateParams(pinParamSchema)] },
    async (request, reply) => {
      const { pin } = request.params as PinParams;

      const user = await findUserByPin(pin);
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({
        userId: user.id,
        pin: user.pin,
      });
    }
  );
}
