import { customAlphabet } from "nanoid";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generate = customAlphabet(alphabet, 6);

export function generatePin(): string {
  return `ARL-${generate()}`;
}
