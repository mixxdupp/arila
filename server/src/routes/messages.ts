import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validate.js";
import { messageSendLimiter } from "../middleware/rateLimit.js";
import { queueMessage } from "../services/messageService.js";
import { findUserById } from "../services/userService.js";
import { getConnectionByUserId } from "../ws/rooms.js";

const messageSchema = z.object({
  recipientId: z.string().uuid(),
  encryptedPayload: z.string().min(1).max(65536),
  messageType: z.enum(["message", "receipt", "key_update"]),
});

type MessageBody = z.infer<typeof messageSchema>;

export async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/messages/send
  fastify.post(
    "/api/messages/send",
    { preHandler: [authenticate, messageSendLimiter, validateBody(messageSchema)] },
    async (request, reply) => {
      const body = request.body as MessageBody;

      // Verify recipient exists
      const recipient = await findUserById(body.recipientId);
      if (!recipient) {
        return reply.status(404).send({ error: "Recipient not found" });
      }

      try {
        const result = await queueMessage({
          recipientId: body.recipientId,
          encryptedPayload: body.encryptedPayload,
          messageType: body.messageType,
        });

        // Try to push via WebSocket if recipient is online
        const recipientWs = getConnectionByUserId(body.recipientId);
        if (recipientWs) {
          try {
            recipientWs.send(JSON.stringify({
              type: "message",
              id: result.id,
              encryptedPayload: body.encryptedPayload,
              messageType: body.messageType,
              timestamp: result.timestamp,
            }));
          } catch {
            // WebSocket send failed — message stays queued for later delivery
          }
        }

        return reply.status(201).send({ id: result.id, timestamp: result.timestamp });
      } catch (err) {
        fastify.log.error(err, "Message send failed");
        return reply.status(500).send({ error: "Failed to send message" });
      }
    }
  );
}
