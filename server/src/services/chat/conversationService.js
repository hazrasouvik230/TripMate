import Conversation from "../../models/Conversation.js";
import { llmConfig } from "../../config/llm.js";

/**
 * conversationService — persistence for chat conversations. This layer knows
 * nothing about the LLM or retrieval; it only stores and retrieves messages.
 */

/** Get the (user, trip) conversation, creating an empty one if needed. */
export const getOrCreate = async (userId, tripId) => {
  const existing = await Conversation.findOne({ userId, tripId });
  if (existing) return existing;
  return Conversation.create({ userId, tripId, messages: [] });
};

/** Fetch an existing conversation (or null). */
export const getConversation = (userId, tripId) =>
  Conversation.findOne({ userId, tripId });

/** The last `limit` messages as plain { role, content } turns. */
export const recentHistory = (conversation, limit = llmConfig.chat.historyLimit) =>
  (conversation?.messages || [])
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));

/**
 * Append messages and persist, trimming to the configured max stored size
 * (keeps the most recent). `messages` is an array of { role, content, sources? }.
 */
export const appendMessages = async (conversation, messages) => {
  conversation.messages.push(...messages.map((m) => ({ ...m, createdAt: new Date() })));
  const max = llmConfig.chat.maxStored;
  if (conversation.messages.length > max) {
    conversation.messages = conversation.messages.slice(-max);
  }
  await conversation.save();
  return conversation;
};

export default { getOrCreate, getConversation, recentHistory, appendMessages };
